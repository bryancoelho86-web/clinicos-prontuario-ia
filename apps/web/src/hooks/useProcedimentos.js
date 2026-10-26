import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

const PROCEDIMENTO_ADMIN_SELECT = '*, procedimento_materiais(quantidade, materiais(*))';

export function useProcedimentos() {
  return useQuery({
    queryKey: ['procedimentos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('procedimentos')
        .select('*')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data;
    },
  });
}

// Todos os procedimentos (ativos e inativos), com materiais vinculados — usado
// na tela de gestão (Tratamentos), diferente de useProcedimentos() que só traz
// os ativos (usado em seletores como o de Agenda).
export function useProcedimentosAdmin() {
  return useQuery({
    queryKey: ['procedimentos', 'admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('procedimentos')
        .select(PROCEDIMENTO_ADMIN_SELECT)
        .order('nome');
      if (error) throw error;
      return data;
    },
  });
}

function invalidateProcedimentos(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['procedimentos'] });
}

export function useCreateProcedimento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ nome, descricao, duracao_padrao_minutos, preco_avulso }) => {
      const { data, error } = await supabase
        .from('procedimentos')
        .insert({
          nome,
          descricao: descricao || null,
          duracao_padrao_minutos,
          preco_avulso: preco_avulso === '' || preco_avulso == null ? null : preco_avulso,
        })
        .select(PROCEDIMENTO_ADMIN_SELECT)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateProcedimentos(queryClient),
  });
}

export function useUpdateProcedimento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nome, descricao, duracao_padrao_minutos, preco_avulso }) => {
      const { data, error } = await supabase
        .from('procedimentos')
        .update({
          nome,
          descricao: descricao || null,
          duracao_padrao_minutos,
          preco_avulso: preco_avulso === '' || preco_avulso == null ? null : preco_avulso,
        })
        .eq('id', id)
        .select(PROCEDIMENTO_ADMIN_SELECT)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateProcedimentos(queryClient),
  });
}

export function useToggleProcedimentoAtivo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }) => {
      const { error } = await supabase.from('procedimentos').update({ ativo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateProcedimentos(queryClient),
  });
}

// Substitui por inteiro a lista de materiais vinculados ao procedimento
// (mais simples que diffar item a item — não há edição concorrente nesse app).
export function useSetProcedimentoMateriais() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ procedimentoId, materiais }) => {
      const { error } = await supabase.rpc('definir_materiais_procedimento', {
        p_procedimento_id: procedimentoId,
        p_materiais: materiais.map(m => ({ material_id: m.material_id, quantidade: m.quantidade })),
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateProcedimentos(queryClient),
  });
}
