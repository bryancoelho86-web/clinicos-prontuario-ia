import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { otimizarImagem } from '@/lib/imageOptimization';

const PACIENTE_DETALHE_SELECT = '*, paciente_tags(tags(*)), planos_tratamento(*, protocolos(nome), tags(nome,cor)), consultas_iniciais(*)';

export function usePaciente(id) {
  return useQuery({
    queryKey: ['paciente', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pacientes')
        .select(PACIENTE_DETALHE_SELECT)
        .eq('id', id)
        .is('deletado_em', null)
        .maybeSingle();
      if (error) throw error;
      if (!data?.foto_perfil_path) return data;
      const { data: signed } = await supabase.storage
        .from(DOCUMENTOS_BUCKET)
        .createSignedUrl(data.foto_perfil_path, 3600);
      return { ...data, fotoPerfilUrl: signed?.signedUrl ?? null };
    },
    enabled: !!id,
  });
}

export function useUpdatePacienteResumo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, resumo_clinico, dispararResumoIA }) => {
      // Editar aqui sempre limpa resumo_ia_atualizado_em — sinaliza pra UI
      // (ResumoCard, PacientePerfil.jsx) que o texto atual não é mais
      // garantidamente output puro da IA (ver gerar_resumo_completo_paciente,
      // migration 0036). dispararResumoIA (abaixo) é opt-in explícito: só
      // ConsultaInicialManual.jsx passa true (regrava o texto colado e, em
      // seguida, dispara a regeneração completa por IA) — "Editar resumo" do
      // ResumoCard NUNCA passa isso, pra não sobrescrever silenciosamente
      // uma edição manual do Dr. com output de IA segundos depois.
      const { error } = await supabase
        .from('pacientes')
        .update({ resumo_clinico, resumo_ia_atualizado_em: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id, dispararResumoIA }) => {
      queryClient.invalidateQueries({ queryKey: ['paciente', id] });

      if (!dispararResumoIA) return;

      // Fire-and-forget — nunca bloqueia nem lança (a escrita direta acima já
      // garantiu o texto no prontuário; isso só melhora depois). Falha vira
      // só console.error, sem toast: não há estado "pendente" visível na UI
      // pra justificar um aviso (diferente do padrão storageWarning usado em
      // useExcluirPacienteDefinitivamente/useAtualizarFotoPerfil, que sempre
      // têm um toast de sucesso principal ao lado do qual encaixar um aviso).
      supabase.functions
        .invoke('gerar_resumo_completo_paciente', { body: { paciente_id: id } })
        .then(({ error: iaError }) => {
          if (iaError) {
            console.error('Falha ao gerar resumo completo via IA:', iaError);
            return;
          }
          queryClient.invalidateQueries({ queryKey: ['paciente', id] });
        })
        .catch((iaError) => console.error('Falha ao gerar resumo completo via IA:', iaError));
    },
  });
}

// cpf já tem grant de UPDATE por coluna desde a 0002 — nenhuma migration
// nova precisou ser criada pra essa edição.
export function useUpdatePacienteCpf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, cpf }) => {
      const { error } = await supabase.from('pacientes').update({ cpf }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['paciente', id] });
      queryClient.invalidateQueries({ queryKey: ['pacientes'] });
    },
  });
}

// --- Timeline ---------------------------------------------------------
// Toda entrada exceto 'observacao_livre' nasce automaticamente (triggers de
// negócio); o Dr. só adiciona/edita manualmente as observações livres — ver
// migration 0009 (adicionar_observacao_timeline / editar_descricao_timeline).

export function useTimelineEventos(pacienteId) {
  return useQuery({
    queryKey: ['timeline', pacienteId],
    queryFn: async () => {
      // sessoes(observacoes): concluir_sessao() grava a observação final em
      // timeline_eventos.descricao, mas nunca toca em sessoes.observacoes
      // (as notas da aba "Observações da sessão", escritas durante o
      // atendimento) — o join busca as duas pra exibir ambas no detalhe.
      const { data, error } = await supabase
        .from('timeline_eventos')
        .select('*, sessoes(observacoes, ativos_utilizados)')
        .eq('paciente_id', pacienteId)
        .order('data', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!pacienteId,
  });
}

export function useAdicionarObservacaoTimeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, titulo, descricao, data }) => {
      const { error } = await supabase.rpc('adicionar_observacao_timeline', {
        p_paciente_id: pacienteId,
        p_titulo: titulo,
        p_descricao: descricao,
        p_data: data ? new Date(`${data}T00:00:00`).toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { pacienteId }) => queryClient.invalidateQueries({ queryKey: ['timeline', pacienteId] }),
  });
}

// Registro retroativo de uma Sessão real (numeração manual, escolhida pelo
// Dr.) — pra pacientes já em tratamento avançado sem histórico no sistema.
// Conta pra sessoes_realizadas/progresso do plano, igual uma sessão feita
// pelo Modo de Atendimento — só que sem baixa de estoque (histórico, não
// atendimento do dia) e com data escolhida pelo Dr., não `now()`.
export function useRegistrarSessaoRetroativa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, planoTratamentoId, numeroSessao, data, ativosUtilizados, observacoes }) => {
      const { data: sessaoId, error } = await supabase.rpc('registrar_sessao_retroativa', {
        p_plano_tratamento_id: planoTratamentoId,
        p_numero_sessao: numeroSessao,
        p_data: new Date(`${data}T00:00:00`).toISOString(),
        p_ativos_utilizados: ativosUtilizados?.length ? ativosUtilizados : null,
        p_observacoes: observacoes,
      });
      if (error) throw error;
      return sessaoId;
    },
    onSuccess: (_data, { pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['timeline', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['paciente', pacienteId] });
    },
  });
}

// Vincula uma foto sem sessão (upload avulso, sem passar pelo Modo de
// Atendimento) a uma sessão retroativa — `documentos` não tem RLS de UPDATE
// pra `authenticated` (só INSERT/SELECT), por isso passa por RPC dedicada.
export function useVincularFotoASessao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, documentoId, sessaoId }) => {
      const { error } = await supabase.rpc('vincular_foto_a_sessao', {
        p_documento_id: documentoId,
        p_sessao_id: sessaoId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { pacienteId }) => queryClient.invalidateQueries({ queryKey: ['documentos', pacienteId, 'foto'] }),
  });
}

export function useEditarDescricaoTimeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, eventoId, descricao }) => {
      const { error } = await supabase.rpc('editar_descricao_timeline', {
        p_evento_id: eventoId,
        p_descricao: descricao,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { pacienteId }) => queryClient.invalidateQueries({ queryKey: ['timeline', pacienteId] }),
  });
}

// --- Documentos (fotos / exames / outros) ------------------------------

const DOCUMENTOS_BUCKET = 'documentos-paciente';

function storagePathFor(pacienteId, file) {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
  return `${pacienteId}/${crypto.randomUUID()}${ext}`;
}

// Bucket é privado — precisa de URL assinada pra exibir/baixar (1h de validade).
async function withSignedUrls(rows) {
  if (!rows.length) return rows;
  const { data, error } = await supabase.storage
    .from(DOCUMENTOS_BUCKET)
    .createSignedUrls(rows.map(r => r.storage_path), 3600);
  if (error) throw error;
  return rows.map((r, i) => ({ ...r, signedUrl: data[i]?.signedUrl ?? null }));
}

export function useFotosPaciente(pacienteId) {
  return useQuery({
    queryKey: ['documentos', pacienteId, 'foto'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documentos')
        .select('*, sessoes(numero_sessao)')
        .eq('paciente_id', pacienteId)
        .eq('tipo', 'foto')
        .is('deletado_em', null)
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return withSignedUrls(data);
    },
    enabled: !!pacienteId,
  });
}

export function useUploadFoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, file, titulo = null }) => {
      file = await otimizarImagem(file);
      const path = storagePathFor(pacienteId, file);
      const { error: uploadError } = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(path, file);
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('documentos')
        .insert({
          paciente_id: pacienteId,
          tipo: 'foto',
          titulo,
          storage_path: path,
          nome_arquivo: file.name,
          mime_type: file.type || null,
          tamanho_bytes: file.size,
        })
        .select('*, sessoes(numero_sessao)')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { pacienteId }) => queryClient.invalidateQueries({ queryKey: ['documentos', pacienteId, 'foto'] }),
  });
}

// remover_foto() só apaga a linha (o Supabase bloqueia DELETE direto em
// storage.objects mesmo em função security definer — ver migration 0007) —
// por isso o arquivo físico precisa ser removido separadamente aqui.
export function useRemoverFoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, documentoId, storagePath }) => {
      const { error: rpcError } = await supabase.rpc('remover_foto', { p_documento_id: documentoId });
      if (rpcError) throw rpcError;
      const { error: storageError } = await supabase.storage.from(DOCUMENTOS_BUCKET).remove([storagePath]);
      if (storageError) throw storageError;
    },
    onSuccess: (_data, { pacienteId }) => queryClient.invalidateQueries({ queryKey: ['documentos', pacienteId, 'foto'] }),
  });
}

export function useExames(pacienteId) {
  return useQuery({
    queryKey: ['exames', pacienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exames')
        .select('*, documentos(*)')
        .eq('paciente_id', pacienteId)
        .is('deletado_em', null)
        .order('data_exame', { ascending: false });
      if (error) throw error;
      if (!data.length) return data;
      const { data: signed, error: signError } = await supabase.storage
        .from(DOCUMENTOS_BUCKET)
        .createSignedUrls(data.map(r => r.documentos.storage_path), 3600);
      if (signError) throw signError;
      return data.map((r, i) => ({ ...r, signedUrl: signed[i]?.signedUrl ?? null }));
    },
    enabled: !!pacienteId,
  });
}

export function useUploadExame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, file, nomeExame, dataExame, observacoes }) => {
      // Só converte se for imagem — exames também aceitam PDF, que passa direto.
      file = await otimizarImagem(file);
      const path = storagePathFor(pacienteId, file);
      const { error: uploadError } = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(path, file);
      if (uploadError) throw uploadError;

      const { data: documento, error: documentoError } = await supabase
        .from('documentos')
        .insert({
          paciente_id: pacienteId,
          tipo: 'exame',
          titulo: nomeExame,
          storage_path: path,
          nome_arquivo: file.name,
          mime_type: file.type || null,
          tamanho_bytes: file.size,
          data_documento: dataExame,
        })
        .select()
        .single();
      if (documentoError) throw documentoError;

      const { data, error } = await supabase
        .from('exames')
        .insert({
          documento_id: documento.id,
          paciente_id: pacienteId,
          nome_exame: nomeExame,
          data_exame: dataExame,
          observacoes_medicas: observacoes || null,
        })
        .select('*, documentos(*)')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['exames', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', pacienteId] });
    },
  });
}

// Soft delete (não remove o arquivo do Storage) — sincroniza exames.deletado_em
// (ou notas_fiscais_investimento.deletado_em, se for esse o tipo)
// automaticamente, via remover_documento() no banco.
export function useRemoverDocumento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentoId }) => {
      const { error } = await supabase.rpc('remover_documento', { p_documento_id: documentoId });
      if (error) throw error;
    },
    onSuccess: (_data, { pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['exames', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['notas-fiscais', pacienteId] });
    },
  });
}

// --- Investimentos (financeiro por paciente, opcional) -----------------
// Requisito do cliente (2026-08-25): valor total combinado é o único campo
// manual do investimento — o "valor pago" é calculado no client como a
// soma dos valores das notas fiscais enviadas (cada uma com seu próprio
// valor, ver useUploadNotaFiscal), ajustado logo
// depois da primeira versão (que tinha valor pago como campo solto).

export function useInvestimentos(pacienteId) {
  return useQuery({
    queryKey: ['investimentos', pacienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investimentos')
        .select('*')
        .eq('paciente_id', pacienteId)
        .is('deletado_em', null)
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!pacienteId,
  });
}

export function useNotasFiscais(pacienteId) {
  return useQuery({
    queryKey: ['notas-fiscais', pacienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notas_fiscais_investimento')
        .select('*, documentos(*)')
        .eq('paciente_id', pacienteId)
        .is('deletado_em', null)
        .order('data_nota', { ascending: false });
      if (error) throw error;
      if (!data.length) return data;
      const { data: signed, error: signError } = await supabase.storage
        .from(DOCUMENTOS_BUCKET)
        .createSignedUrls(data.map(r => r.documentos.storage_path), 3600);
      if (signError) throw signError;
      return data.map((r, i) => ({ ...r, signedUrl: signed[i]?.signedUrl ?? null }));
    },
    enabled: !!pacienteId,
  });
}

export function useCriarInvestimento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, valorTotal }) => {
      const { error } = await supabase
        .from('investimentos')
        .insert({ paciente_id: pacienteId, valor_total: valorTotal });
      if (error) throw error;
    },
    onSuccess: (_data, { pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['investimentos', pacienteId] });
    },
  });
}

export function useAtualizarInvestimento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, valorTotal }) => {
      const { error } = await supabase
        .from('investimentos')
        .update({ valor_total: valorTotal })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['investimentos', pacienteId] });
    },
  });
}

export function useUploadNotaFiscal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, investimentoId, file, dataNota, valor }) => {
      file = await otimizarImagem(file);
      const path = storagePathFor(pacienteId, file);
      const { error: uploadError } = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(path, file);
      if (uploadError) throw uploadError;

      const { data: documento, error: documentoError } = await supabase
        .from('documentos')
        .insert({
          paciente_id: pacienteId,
          tipo: 'documento_financeiro',
          titulo: 'Nota fiscal',
          storage_path: path,
          nome_arquivo: file.name,
          mime_type: file.type || null,
          tamanho_bytes: file.size,
          data_documento: dataNota,
        })
        .select()
        .single();
      if (documentoError) throw documentoError;

      const { data, error } = await supabase
        .from('notas_fiscais_investimento')
        .insert({ documento_id: documento.id, investimento_id: investimentoId, paciente_id: pacienteId, data_nota: dataNota, valor })
        .select('*, documentos(*)')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['notas-fiscais', pacienteId] });
    },
  });
}

// --- Gráficos de evolução de exame (nomeados, alimentados à mão) ---

export function useGraficosExame(pacienteId) {
  return useQuery({
    queryKey: ['graficos-exame', pacienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('graficos_exame')
        .select('*, graficos_exame_pontos(*)')
        .eq('paciente_id', pacienteId)
        .order('criado_em');
      if (error) throw error;
      return data;
    },
    enabled: !!pacienteId,
  });
}

export function useCriarGraficoExame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, nome }) => {
      const { error } = await supabase.from('graficos_exame').insert({ paciente_id: pacienteId, nome });
      if (error) throw error;
    },
    onSuccess: (_data, { pacienteId }) => queryClient.invalidateQueries({ queryKey: ['graficos-exame', pacienteId] }),
  });
}

export function useExcluirGraficoExame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ graficoId }) => {
      const { error } = await supabase.from('graficos_exame').delete().eq('id', graficoId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['graficos-exame'] }),
  });
}

export function useAdicionarPontoGrafico() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ graficoId, data, valor, observacao }) => {
      const { error } = await supabase.from('graficos_exame_pontos').insert({ grafico_id: graficoId, data, valor, observacao });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['graficos-exame'] }),
  });
}

export function useEditarPontoGrafico() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pontoId, data, valor, observacao }) => {
      const { error } = await supabase.from('graficos_exame_pontos').update({ data, valor, observacao }).eq('id', pontoId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['graficos-exame'] }),
  });
}

export function useExcluirPontoGrafico() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pontoId }) => {
      const { error } = await supabase.from('graficos_exame_pontos').delete().eq('id', pontoId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['graficos-exame'] }),
  });
}

// --- Consulta inicial (fluxo manual — gravação de áudio com IA fica pra
// quando a Edge Function de transcrição existir, ver docs/arquitetura.md) ---

export function useIniciarConsultaInicial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, agendamentoId }) => {
      const { data, error } = await supabase.rpc('iniciar_consulta_inicial', {
        p_paciente_id: pacienteId,
        p_agendamento_id: agendamentoId || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { pacienteId, agendamentoId }) => {
      queryClient.invalidateQueries({ queryKey: ['paciente', pacienteId] });
      // ModoAtendimento.jsx lê o agendamento via essa outra query key
      // (useAgendamento, em useModoAtendimento.js) — sem invalidar isso
      // também, o refetchOnWindowFocus desligado globalmente faz a tela
      // ficar presa mostrando o botão "Iniciar" de novo, mesmo depois da
      // consulta já ter sido criada no banco.
      if (agendamentoId) queryClient.invalidateQueries({ queryKey: ['agendamento-atendimento', agendamentoId] });
    },
  });
}

// Desfaz uma Consulta Inicial iniciada por engano (RPC já existia no banco
// sem UI — auditoria de 2026-08-21). Mesmo padrão de invalidação de
// useIniciarConsultaInicial, pelo mesmo motivo.
export function useCancelarConsultaInicial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ consultaId }) => {
      const { error } = await supabase.rpc('cancelar_consulta_inicial', { p_consulta_id: consultaId });
      if (error) throw error;
    },
    onSuccess: (_data, { pacienteId, agendamentoId }) => {
      queryClient.invalidateQueries({ queryKey: ['paciente', pacienteId] });
      if (agendamentoId) queryClient.invalidateQueries({ queryKey: ['agendamento-atendimento', agendamentoId] });
    },
  });
}

export function useConcluirConsultaInicial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, consultaId, anamnese, agendamentoId }) => {
      const { error } = await supabase.rpc('concluir_consulta_inicial', {
        p_consulta_id: consultaId,
        p_anamnese: anamnese,
        p_gerar_plano: false,
        p_protocolo_id: null,
        p_sessoes_contratadas: null,
        p_preco_contratado: null,
        p_agendamento_id: agendamentoId || null,
      });
      if (error) throw error;

      // concluir_consulta_inicial() só cria evento de timeline quando gera
      // plano de tratamento junto — como aqui não gera, registra a conclusão
      // manualmente pra sempre sobrar um rastro na timeline dessa visita.
      const { error: timelineError } = await supabase.rpc('adicionar_observacao_timeline', {
        p_paciente_id: pacienteId,
        p_titulo: 'Consulta Inicial concluída',
        p_descricao: anamnese,
      });
      if (timelineError) throw timelineError;
    },
    onSuccess: (_data, { pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['paciente', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', pacienteId] });
    },
  });
}

// --- Plano de tratamento ------------------------------------------------
// Sem UI de gestão de protocolos ainda (catálogo de pacotes) — a lista vem
// vazia até existir alguma linha em `protocolos`, e o plano fica "avulso"
// (sem protocolo, sem número fixo de sessões) até lá.

export function useProtocolosAtivos() {
  return useQuery({
    queryKey: ['protocolos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('protocolos')
        .select('*')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data;
    },
  });
}

// Os 5 tipos de plano (Avulso/Premium/Por Sessão/Home Care/Manutenção)
// também são tags — a própria função do banco aplica a tag ao criar o
// plano (soma às tags que o paciente já tem, nunca substitui, já que
// múltiplos planos simultâneos são permitidos por design).
export function useCriarPlanoTratamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, protocoloId, sessoesContratadas, tagId }) => {
      const { data, error } = await supabase.rpc('criar_plano_tratamento', {
        p_paciente_id: pacienteId,
        p_protocolo_id: protocoloId || null,
        p_sessoes_contratadas: sessoesContratadas || null,
        p_preco_contratado: null,
        p_tag_id: tagId || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['paciente', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['pacientes'] });
    },
  });
}

// Cancela um plano ativo (status -> 'cancelado'). A própria função do
// banco remove a tag correspondente do paciente, mas só se não sobrar
// nenhum outro plano ativo do mesmo tipo.
export function useCancelarPlanoTratamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planoId, motivo }) => {
      const { error } = await supabase.rpc('cancelar_plano_tratamento', {
        p_plano_id: planoId,
        p_motivo: motivo || null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['paciente', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['pacientes'] });
    },
  });
}

// Cobre os dois casos de desfecho (migration 0040): plano ativo sem
// sessões pré-determinadas -> finaliza agora; plano já finalizado
// automaticamente ao bater o total de sessões -> só anexa o desfecho.
export function useRegistrarDesfechoPlano() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planoId, teveMelhora, observacao }) => {
      const { error } = await supabase.rpc('registrar_desfecho_plano_tratamento', {
        p_plano_id: planoId,
        p_teve_melhora: teveMelhora,
        p_observacao: observacao,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['paciente', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['pacientes'] });
    },
  });
}

const GRAVACOES_BUCKET = 'gravacoes-ia';

export function useExcluirPacienteDefinitivamente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, cpfConfirmacao }) => {
      const { data, error } = await supabase.rpc('excluir_paciente_definitivamente', {
        p_paciente_id: pacienteId,
        p_cpf_confirmacao: cpfConfirmacao,
      });
      if (error) throw error;

      // A esta altura o paciente já foi excluído de verdade no banco — não
      // dá mais pra desfazer. Por isso uma falha aqui não deve lançar (não
      // queremos que o toast de erro genérico sugira que a exclusão falhou);
      // só registra o problema e sinaliza pro chamador mostrar um aviso
      // secundário, sem esconder a falha em silêncio.
      const documentosPaths = data?.storage_paths_documentos || [];
      const gravacoesPaths = data?.storage_paths_gravacoes || [];
      let storageWarning = false;
      if (documentosPaths.length > 0) {
        const { error: storageError } = await supabase.storage.from(DOCUMENTOS_BUCKET).remove(documentosPaths);
        if (storageError) {
          console.error('Falha ao remover documentos do Storage após excluir paciente:', storageError);
          storageWarning = true;
        }
      }
      if (gravacoesPaths.length > 0) {
        const { error: storageError } = await supabase.storage.from(GRAVACOES_BUCKET).remove(gravacoesPaths);
        if (storageError) {
          console.error('Falha ao remover gravações do Storage após excluir paciente:', storageError);
          storageWarning = true;
        }
      }
      return { storageWarning };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pacientes'] });
    },
  });
}

// Foto de perfil opcional do paciente — reaproveita o bucket
// documentos-paciente (mesmo usado por fotos de progresso/exames).
export function useAtualizarFotoPerfil() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, file, fotoPerfilPathAtual }) => {
      file = await otimizarImagem(file);
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
      const path = `${pacienteId}/perfil-${crypto.randomUUID()}${ext}`;
      const { error: uploadError } = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(path, file);
      if (uploadError) throw uploadError;

      const { error } = await supabase.from('pacientes').update({ foto_perfil_path: path }).eq('id', pacienteId);
      if (error) throw error;

      // Remove o arquivo antigo só depois de confirmar o update — se o
      // update falhasse, não queremos perder o arquivo ainda em uso. A foto
      // nova já está salva e em uso a esta altura, então uma falha aqui vira
      // aviso (não lança) — quem chamar decide como sinalizar a limpeza
      // incompleta.
      let storageWarning = false;
      if (fotoPerfilPathAtual) {
        const { error: storageError } = await supabase.storage.from(DOCUMENTOS_BUCKET).remove([fotoPerfilPathAtual]);
        if (storageError) {
          console.error('Falha ao remover foto de perfil antiga do Storage:', storageError);
          storageWarning = true;
        }
      }
      return { storageWarning };
    },
    onSuccess: (_data, { pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['paciente', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['pacientes'] });
    },
  });
}

export function useRemoverFotoPerfil() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pacienteId, fotoPerfilPath }) => {
      const { error } = await supabase.from('pacientes').update({ foto_perfil_path: null }).eq('id', pacienteId);
      if (error) throw error;
      let storageWarning = false;
      if (fotoPerfilPath) {
        const { error: storageError } = await supabase.storage.from(DOCUMENTOS_BUCKET).remove([fotoPerfilPath]);
        if (storageError) {
          console.error('Falha ao remover foto de perfil do Storage:', storageError);
          storageWarning = true;
        }
      }
      return { storageWarning };
    },
    onSuccess: (_data, { pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['paciente', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['pacientes'] });
    },
  });
}
