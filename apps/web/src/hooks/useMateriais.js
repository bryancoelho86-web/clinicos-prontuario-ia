import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

// Materiais ativos, para uso em seletores (ex: vincular material a um procedimento).
export function useMateriaisAtivos() {
  return useQuery({
    queryKey: ['materiais', 'ativos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materiais')
        .select('*')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data;
    },
  });
}

// Materiais + estoque vinculado (ativos e inativos) — tela de gestão de estoque.
export function useMateriaisComEstoque() {
  return useQuery({
    queryKey: ['materiais', 'com-estoque'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materiais')
        .select('*, estoque(*)')
        .order('nome');
      if (error) throw error;
      // `estoque` é 1:1 (PK = FK), mas o PostgREST pode devolver como array
      // dependendo da versão — normaliza pra objeto único.
      return data.map(m => ({ ...m, estoque: Array.isArray(m.estoque) ? m.estoque[0] : m.estoque }));
    },
  });
}

function invalidateMateriais(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['materiais'] });
}

// A linha de `estoque` correspondente é criada automaticamente por trigger
// (quantidade_atual=0, quantidade_minima=0) — ver migration 0008.
export function useCreateMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ nome, unidade_medida }) => {
      const { data, error } = await supabase
        .from('materiais')
        .insert({ nome, unidade_medida: unidade_medida || 'un' })
        .select('*, estoque(*)')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateMateriais(queryClient),
  });
}

export function useToggleMaterialAtivo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }) => {
      const { error } = await supabase.from('materiais').update({ ativo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateMateriais(queryClient),
  });
}

export function useExcluirMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.rpc('excluir_material_estoque', { p_material_id: id });
      if (error) throw error;
    },
    onSuccess: () => invalidateMateriais(queryClient),
  });
}

// Edição de metadado do item (nome/quantidade_minima/preco_unitario) — UPDATE
// direto, nunca passa por ajustar_estoque()/entrada_estoque() e nunca grava
// em movimentacoes_estoque (aquelas RPCs existem só pra mudar
// quantidade_atual/saldo físico, via movimentação registrada; isso aqui é
// cadastro, não saldo). `nome` vive em `materiais` (Grupo A, CRUD livre já
// concedido desde a 0002); `quantidade_minima`/`preco_unitario` vivem em
// `estoque` (Grupo B, grant por coluna — preco_unitario ganhou o grant na
// migration 0046). Campos omitidos (undefined) não são tocados — usado tanto
// pelo fluxo de criação (só quantidade_minima/preco_unitario, nome já foi
// definido no INSERT) quanto pelo modal de edição completa (os três juntos).
export function useEditarItemEstoque() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ materialId, nome, quantidade_minima, preco_unitario }) => {
      if (nome !== undefined) {
        const { error } = await supabase.from('materiais').update({ nome }).eq('id', materialId);
        if (error) throw error;
      }
      const estoquePatch = {};
      if (quantidade_minima !== undefined) estoquePatch.quantidade_minima = quantidade_minima;
      if (preco_unitario !== undefined) estoquePatch.preco_unitario = preco_unitario;
      if (Object.keys(estoquePatch).length > 0) {
        const { error } = await supabase.from('estoque').update(estoquePatch).eq('material_id', materialId);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateMateriais(queryClient),
  });
}

export function useEntradaEstoque() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ materialId, quantidade, motivo, valorGasto }) => {
      const { error } = await supabase.rpc('entrada_estoque', {
        p_material_id: materialId,
        p_quantidade: quantidade,
        p_motivo: motivo,
        p_valor_gasto: valorGasto ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMateriais(queryClient);
      queryClient.invalidateQueries({ queryKey: ['movimentacoes-estoque'] });
    },
  });
}

// Extrato de estoque (2026-08-25): só entradas, num intervalo [inicio, fim).
// `inicio`/`fim` são Date — convertidos pra ISO aqui, então o call site só
// passa objetos Date de verdade, sem se preocupar com formatação.
export function useMovimentacoesEstoqueEntrada(inicio, fim) {
  const inicioIso = inicio?.toISOString();
  const fimIso = fim?.toISOString();
  return useQuery({
    queryKey: ['movimentacoes-estoque', 'entrada', inicioIso, fimIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimentacoes_estoque')
        .select('*, materiais(nome, unidade_medida)')
        .eq('tipo', 'entrada')
        .gte('criado_em', inicioIso)
        .lt('criado_em', fimIso)
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!inicioIso && !!fimIso,
  });
}

export function useAjustarEstoque() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ materialId, quantidadeContada, motivo }) => {
      const { error } = await supabase.rpc('ajustar_estoque', {
        p_material_id: materialId,
        p_quantidade_contada: quantidadeContada,
        p_motivo: motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateMateriais(queryClient),
  });
}
