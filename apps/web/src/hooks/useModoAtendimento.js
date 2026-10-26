import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { otimizarImagem } from '@/lib/imageOptimization';

const AGENDAMENTO_SELECT = `
  *,
  pacientes(*, paciente_tags(tags(*)), planos_tratamento(*), consultas_iniciais(*)),
  procedimentos(*)
`;

export function useAgendamento(id) {
  return useQuery({
    queryKey: ['agendamento-atendimento', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select(AGENDAMENTO_SELECT)
        .eq('id', id)
        .is('deletado_em', null)
        .maybeSingle();
      if (error) throw error;
      if (!data?.pacientes?.foto_perfil_path) return data;
      const { data: signed } = await supabase.storage
        .from('documentos-paciente')
        .createSignedUrl(data.pacientes.foto_perfil_path, 3600);
      return { ...data, pacientes: { ...data.pacientes, fotoPerfilUrl: signed?.signedUrl ?? null } };
    },
    enabled: !!id,
  });
}

// Procedimentos ativos do catálogo com os materiais padrão vinculados —
// usado tanto pra "procedimentos previstos" quanto pra saber o que baixa do
// estoque em concluir_sessao().
export function useProcedimentosParaAtendimento() {
  return useQuery({
    queryKey: ['procedimentos', 'atendimento'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('procedimentos')
        .select('*, procedimento_materiais(quantidade, materiais(*))')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data;
    },
  });
}

// Todas as sessões em andamento agora (mono-médico — na prática nunca mais
// de uma por vez) — usado pelo Dashboard pra mostrar "atendimento em
// andamento" sem depender de localStorage.
export function useSessoesEmAndamento() {
  return useQuery({
    queryKey: ['sessoes-em-andamento'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessoes')
        .select('id, agendamento_id, criado_em')
        .eq('status', 'em_andamento')
        .not('agendamento_id', 'is', null);
      if (error) throw error;
      return data;
    },
  });
}

// Sessão em andamento pra este agendamento, se já existir — permite
// retomar o atendimento exatamente de onde parou (autosave real, não
// depende de localStorage).
export function useSessaoAtiva(agendamentoId) {
  return useQuery({
    queryKey: ['sessao-ativa', agendamentoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessoes')
        .select('*')
        .eq('agendamento_id', agendamentoId)
        .eq('status', 'em_andamento')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!agendamentoId,
  });
}

export function useIniciarSessao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planoTratamentoId, agendamentoId }) => {
      const { data, error } = await supabase.rpc('iniciar_sessao', {
        p_plano_tratamento_id: planoTratamentoId,
        p_agendamento_id: agendamentoId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { agendamentoId }) => {
      queryClient.invalidateQueries({ queryKey: ['sessao-ativa', agendamentoId] });
      queryClient.invalidateQueries({ queryKey: ['agendamento-atendimento', agendamentoId] });
    },
  });
}

// Idempotente — serve tanto pro autosave quanto pra edições manuais.
export function useSalvarRascunhoSessao() {
  return useMutation({
    mutationFn: async ({ sessaoId, observacoes, rascunho }) => {
      const { error } = await supabase.rpc('salvar_rascunho_sessao', {
        p_sessao_id: sessaoId,
        p_observacoes: observacoes,
        p_rascunho: rascunho,
      });
      if (error) throw error;
    },
  });
}

export function useConcluirSessao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessaoId, observacaoFinal, procedimentos, agendamentoId }) => {
      const { data, error } = await supabase.rpc('concluir_sessao', {
        p_sessao_id: sessaoId,
        p_observacao_final: observacaoFinal,
        p_procedimentos: procedimentos,
        p_documentos_paths: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { agendamentoId, pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['sessao-ativa', agendamentoId] });
      queryClient.invalidateQueries({ queryKey: ['agendamento-atendimento', agendamentoId] });
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });

      // Fire-and-forget — mesmo padrão/comentário de useUpdatePacienteResumo
      // (usePacientePerfil.js). Guard porque pacienteId é opcional aqui (fica
      // faltando só se algum call site futuro esquecer de passá-lo).
      if (pacienteId) {
        supabase.functions
          .invoke('gerar_resumo_completo_paciente', { body: { paciente_id: pacienteId } })
          .then(({ error: iaError }) => {
            if (iaError) {
              console.error('Falha ao gerar resumo completo via IA:', iaError);
              return;
            }
            queryClient.invalidateQueries({ queryKey: ['paciente', pacienteId] });
          })
          .catch((iaError) => console.error('Falha ao gerar resumo completo via IA:', iaError));
      }
    },
  });
}

// Desfaz uma sessão iniciada por engano (RPC já existia no banco sem UI —
// auditoria de 2026-08-21). Mesma invalidação de useIniciarSessao, mais
// 'sessoes-em-andamento' (usada pelo Dashboard).
export function useCancelarSessao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessaoId }) => {
      const { error } = await supabase.rpc('cancelar_sessao', { p_sessao_id: sessaoId });
      if (error) throw error;
    },
    onSuccess: (_data, { agendamentoId }) => {
      queryClient.invalidateQueries({ queryKey: ['sessao-ativa', agendamentoId] });
      queryClient.invalidateQueries({ queryKey: ['agendamento-atendimento', agendamentoId] });
      queryClient.invalidateQueries({ queryKey: ['sessoes-em-andamento'] });
    },
  });
}

// --- Fotos da sessão (mesmo bucket/contrato de remoção de PacientePerfil,
// mas vinculadas a sessao_id em vez de soltas no perfil) ------------------

const DOCUMENTOS_BUCKET = 'documentos-paciente';

function storagePathFor(pacienteId, file) {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
  return `${pacienteId}/${crypto.randomUUID()}${ext}`;
}

export function useFotosSessao(sessaoId) {
  return useQuery({
    queryKey: ['fotos-sessao', sessaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documentos')
        .select('*')
        .eq('sessao_id', sessaoId)
        .eq('tipo', 'foto')
        .is('deletado_em', null)
        .order('criado_em', { ascending: false });
      if (error) throw error;
      if (!data.length) return data;
      const { data: signed, error: signError } = await supabase.storage
        .from(DOCUMENTOS_BUCKET)
        .createSignedUrls(data.map((r) => r.storage_path), 3600);
      if (signError) throw signError;
      return data.map((r, i) => ({ ...r, signedUrl: signed[i]?.signedUrl ?? null }));
    },
    enabled: !!sessaoId,
  });
}

export function useUploadFotoSessao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, sessaoId, file }) => {
      file = await otimizarImagem(file);
      const path = storagePathFor(pacienteId, file);
      const { error: uploadError } = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(path, file);
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('documentos')
        .insert({
          paciente_id: pacienteId,
          sessao_id: sessaoId,
          tipo: 'foto',
          storage_path: path,
          nome_arquivo: file.name,
          mime_type: file.type || null,
          tamanho_bytes: file.size,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { sessaoId }) => queryClient.invalidateQueries({ queryKey: ['fotos-sessao', sessaoId] }),
  });
}

export function useRemoverFotoSessao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessaoId, documentoId, storagePath }) => {
      const { error: rpcError } = await supabase.rpc('remover_foto', { p_documento_id: documentoId });
      if (rpcError) throw rpcError;
      const { error: storageError } = await supabase.storage.from(DOCUMENTOS_BUCKET).remove([storagePath]);
      if (storageError) throw storageError;
    },
    onSuccess: (_data, { sessaoId }) => queryClient.invalidateQueries({ queryKey: ['fotos-sessao', sessaoId] }),
  });
}
