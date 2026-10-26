import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

const BUCKET = 'gravacoes-ia';

function storagePathFor(consultaInicialId) {
  return `${consultaInicialId}/${crypto.randomUUID()}.webm`;
}

export function useIniciarGravacaoIA() {
  return useMutation({
    mutationFn: async ({ consultaInicialId }) => {
      const { data, error } = await supabase.rpc('iniciar_gravacao_ia', {
        p_consulta_inicial_id: consultaInicialId,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useEnviarAudioGravacaoIA() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gravacaoId, consultaInicialId, blob }) => {
      const path = storagePathFor(consultaInicialId);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type || 'audio/webm' });
      if (uploadError) throw uploadError;

      const { error: rpcError } = await supabase.rpc('registrar_audio_gravacao_ia', {
        p_gravacao_id: gravacaoId,
        p_storage_path: path,
      });
      if (rpcError) throw rpcError;

      const { error: invokeError } = await supabase.functions.invoke('processar_gravacao_ia', {
        body: { gravacao_id: gravacaoId },
      });
      if (invokeError) throw invokeError;
    },
    onSuccess: (_data, { gravacaoId }) => queryClient.invalidateQueries({ queryKey: ['gravacao-ia', gravacaoId] }),
  });
}

export function useGravacaoIA(gravacaoId) {
  return useQuery({
    queryKey: ['gravacao-ia', gravacaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gravacoes_ia')
        .select('*, resumo_ia_itens(*)')
        .eq('id', gravacaoId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!gravacaoId,
    refetchInterval: (query) => (query.state.data?.status === 'processando' ? 3000 : false),
  });
}

export function useReprocessarGravacaoIA() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gravacaoId }) => {
      const { error } = await supabase.functions.invoke('processar_gravacao_ia', {
        body: { gravacao_id: gravacaoId },
      });
      if (error) throw error;
    },
    onSuccess: (_data, { gravacaoId }) => queryClient.invalidateQueries({ queryKey: ['gravacao-ia', gravacaoId] }),
  });
}

// registrar_transcricao_ia é idempotente de propósito — serve tanto pro
// resultado bruto da IA (Edge Function) quanto pra edição manual do médico
// antes de confirmar (mesmo texto do comentário da função no banco).
export function useSalvarEdicaoResumoIA() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gravacaoId, transcricao, resumoClinico, itens }) => {
      const { error } = await supabase.rpc('registrar_transcricao_ia', {
        p_gravacao_id: gravacaoId,
        p_transcricao: transcricao,
        p_resumo_clinico: resumoClinico,
        p_itens: itens,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { gravacaoId }) => queryClient.invalidateQueries({ queryKey: ['gravacao-ia', gravacaoId] }),
  });
}

export function useConfirmarResumoIA() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gravacaoId, pacienteId, consultaId, resumoClinico, agendamentoId }) => {
      const { error: confirmError } = await supabase.rpc('confirmar_resumo_ia', { p_gravacao_id: gravacaoId });
      if (confirmError) throw confirmError;

      // confirmar_resumo_ia() só atualiza o paciente e a gravação — não conclui
      // a consulta_inicial. Sem isso, o paciente fica preso em "isNew" pra
      // sempre (bloqueia sessões, aniversariantes, regra de 15 dias). Chama
      // concluir_consulta_inicial() direto (não o hook useConcluirConsultaInicial,
      // que criaria uma segunda entrada de timeline — confirmar_resumo_ia() já
      // registrou a dela).
      const { error: concluirError } = await supabase.rpc('concluir_consulta_inicial', {
        p_consulta_id: consultaId,
        p_anamnese: resumoClinico,
        p_gerar_plano: false,
        p_protocolo_id: null,
        p_sessoes_contratadas: null,
        p_preco_contratado: null,
        p_agendamento_id: agendamentoId || null,
      });
      if (concluirError) throw concluirError;
    },
    onSuccess: (_data, { gravacaoId, pacienteId }) => {
      queryClient.invalidateQueries({ queryKey: ['gravacao-ia', gravacaoId] });
      queryClient.invalidateQueries({ queryKey: ['paciente', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', pacienteId] });

      // Fire-and-forget — mesmo padrão/comentário de useUpdatePacienteResumo
      // (usePacientePerfil.js). Seguro disparar direto aqui (sem race):
      // confirmar_resumo_ia() já é o único escritor de resumo_clinico neste
      // fluxo, nada mais reescreve a coluna depois.
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
    },
  });
}
