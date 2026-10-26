import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from '@/components/ui/use-toast';

export function useEstoqueCritico() {
  return useQuery({
    queryKey: ['estoque-critico'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_estoque_critico').select('*');
      if (error) throw error;
      return data;
    },
  });
}

export function useRetornosAtrasados() {
  return useQuery({
    queryKey: ['retornos-atrasados'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_pacientes_retorno_atrasado')
        .select('*')
        .order('dias_sem_retorno', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAniversariantesMes() {
  return useQuery({
    queryKey: ['aniversariantes-mes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_aniversariantes_mes').select('*');
      if (error) throw error;
      // A view não ordena por dia — sem isso a lista sai na ordem de
      // criação do paciente, misturada (achado em teste: "dia 1" antes
      // de "dia 5" tudo bem, mas "dia 27" no meio do bloco de dias iniciais
      // ficava bagunçado). `getUTCDate()` casa com o mesmo cálculo já usado
      // pra exibir o "dia X" no Dashboard.
      return [...data].sort((a, b) => new Date(a.data_nascimento).getUTCDate() - new Date(b.data_nascimento).getUTCDate());
    },
  });
}

export function useTarefas() {
  return useQuery({
    queryKey: ['tarefas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tarefas')
        .select('*')
        .eq('concluida', false)
        .order('criado_em', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCriarTarefa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ texto }) => {
      const { error } = await supabase.from('tarefas').insert({ texto });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tarefas'] }),
    onError: (error) => toast({ title: 'Erro ao criar tarefa', description: error?.message, variant: 'destructive' }),
  });
}

export function useEditarTextoTarefa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, texto }) => {
      const { error } = await supabase.from('tarefas').update({ texto }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tarefas'] }),
    onError: (error) => toast({ title: 'Erro ao editar tarefa', description: error?.message, variant: 'destructive' }),
  });
}

export function useConcluirTarefa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('tarefas').update({ concluida: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tarefas'] }),
    onError: (error) => toast({ title: 'Erro ao concluir tarefa', description: error?.message, variant: 'destructive' }),
  });
}

export function useExcluirTarefa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('tarefas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tarefas'] }),
    onError: (error) => toast({ title: 'Erro ao excluir tarefa', description: error?.message, variant: 'destructive' }),
  });
}
