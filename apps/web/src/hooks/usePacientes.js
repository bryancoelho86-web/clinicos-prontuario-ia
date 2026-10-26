import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

const PACIENTE_SELECT = '*, paciente_tags(tags(*)), planos_tratamento(*)';

export function usePacientes() {
  return useQuery({
    queryKey: ['pacientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pacientes')
        .select(PACIENTE_SELECT)
        .is('deletado_em', null)
        .order('nome');
      if (error) throw error;

      // Só gera URL assinada pra quem realmente tem foto de perfil — sem
      // custo extra pra pacientes sem foto (a maioria, já que é opcional).
      const comFoto = data.filter((p) => p.foto_perfil_path);
      if (comFoto.length === 0) return data;
      const { data: signed } = await supabase.storage
        .from('documentos-paciente')
        .createSignedUrls(comFoto.map((p) => p.foto_perfil_path), 3600);
      const urlPorPath = Object.fromEntries(comFoto.map((p, i) => [p.foto_perfil_path, signed?.[i]?.signedUrl ?? null]));
      return data.map((p) => ({ ...p, fotoPerfilUrl: p.foto_perfil_path ? urlPorPath[p.foto_perfil_path] : null }));
    },
  });
}

export function useCreatePaciente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paciente) => {
      const { data, error } = await supabase
        .from('pacientes')
        .insert(paciente)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pacientes'] }),
  });
}
