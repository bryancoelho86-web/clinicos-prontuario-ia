import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { colorForId } from '@/lib/agendaUtils';

const AGENDAMENTO_SELECT = '*, pacientes(*, paciente_tags(tags(*))), procedimentos(*)';

export const STATUS_DB_TO_UI = {
  pendente: 'pending',
  confirmado: 'confirmed',
  realizado: 'done',
  cancelado: 'cancelled',
  faltou: 'missed',
};
export const STATUS_UI_TO_DB = Object.fromEntries(
  Object.entries(STATUS_DB_TO_UI).map(([db, ui]) => [ui, db])
);

// Erro do Postgres para a exclusion constraint que impede horários sobrepostos
// (agendamentos é agenda única, mono-médico — ver migration 0001_schema_final.sql).
export const OVERLAP_ERROR_CODE = '23P01';

// Trecho da mensagem que a RPC excluir_agendamento() lança (exceção P0001,
// não mais um erro de FK — ver migration 0047_soft_delete_agendamentos.sql)
// quando o agendamento já tem sessão vinculada. Substituiu o antigo
// DELETE_RESTRICT_ERROR_CODE ('23503'), que dependia do DELETE cru bater
// numa FK RESTRICT — desde a 0047, exclusão é sempre soft delete (nunca
// dispara FK de verdade), então a checagem precisa vir da mensagem da RPC.
export const DELETE_RESTRICT_MESSAGE_FRAGMENT = 'já teve atendimento iniciado';

const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' + 'HH:MM' (horário local) -> ISO string para a coluna timestamptz.
function toTimestamp(date, time) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function fromTimestamp(iso) {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function adaptPatient(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.nome,
    phone: p.telefone,
    classification: (p.paciente_tags || []).map(pt => pt.tags?.nome).filter(Boolean),
    destaques_clinicos: p.destaques_clinicos,
  };
}

export function adaptTreatment(t) {
  if (!t) return null;
  return {
    id: t.id,
    name: t.nome,
    duration: t.duracao_padrao_minutos,
    value: t.preco_avulso,
    color: colorForId(t.id),
  };
}

function rowToEvent(row) {
  const inicio = fromTimestamp(row.inicio);
  const fim = fromTimestamp(row.fim);
  return {
    id: row.id,
    patientId: row.paciente_id,
    treatmentId: row.procedimento_id,
    date: inicio.date,
    start: inicio.time,
    end: fim.time,
    status: STATUS_DB_TO_UI[row.status] || 'pending',
    notes: row.observacoes || '',
    patient: adaptPatient(row.pacientes),
    treatment: adaptTreatment(row.procedimentos),
  };
}

export function useAgendamentosRange(rangeStart, rangeEnd) {
  const startIso = rangeStart.toISOString();
  const endIso = rangeEnd.toISOString();
  return useQuery({
    queryKey: ['agendamentos', startIso, endIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select(AGENDAMENTO_SELECT)
        .gte('inicio', startIso)
        .lt('inicio', endIso)
        .is('deletado_em', null)
        .order('inicio');
      if (error) throw error;
      return data.map(rowToEvent);
    },
  });
}

export function useCreateAgendamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ patientId, treatmentId, date, start, end, status, notes }) => {
      const { data, error } = await supabase
        .from('agendamentos')
        .insert({
          paciente_id: patientId,
          procedimento_id: treatmentId,
          inicio: toTimestamp(date, start),
          fim: toTimestamp(date, end),
          status: STATUS_UI_TO_DB[status] || 'confirmado',
          observacoes: notes || null,
        })
        .select(AGENDAMENTO_SELECT)
        .single();
      if (error) throw error;
      return rowToEvent(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agendamentos'] }),
  });
}

export function useUpdateAgendamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patientId, treatmentId, date, start, end, status, notes }) => {
      const patch = {};
      if (patientId !== undefined) patch.paciente_id = patientId;
      if (treatmentId !== undefined) patch.procedimento_id = treatmentId;
      if (date !== undefined && start !== undefined) patch.inicio = toTimestamp(date, start);
      if (date !== undefined && end !== undefined) patch.fim = toTimestamp(date, end);
      if (status !== undefined) patch.status = STATUS_UI_TO_DB[status];
      if (notes !== undefined) patch.observacoes = notes || null;

      const { data, error } = await supabase
        .from('agendamentos')
        .update(patch)
        .eq('id', id)
        .select(AGENDAMENTO_SELECT)
        .single();
      if (error) throw error;
      return rowToEvent(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agendamentos'] }),
  });
}

export function useAgendamentoConsultaInicialPendente(pacienteId, procedimentoId) {
  return useQuery({
    queryKey: ['agendamento-consulta-inicial-pendente', pacienteId, procedimentoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('id, inicio, status')
        .eq('paciente_id', pacienteId)
        .eq('procedimento_id', procedimentoId)
        .in('status', ['pendente', 'confirmado'])
        .order('inicio', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!pacienteId && !!procedimentoId,
  });
}

// Soft delete via RPC (migration 0047) — o client não tem mais privilégio
// de DELETE em `agendamentos` (revogado de propósito), então isso nunca
// apaga a linha de verdade: marca `deletado_em`/`status='cancelado'` e
// bloqueia (exceção P0001, ver DELETE_RESTRICT_MESSAGE_FRAGMENT acima) se
// o agendamento já tiver uma sessão vinculada. Nenhum agendamento
// desaparece sem deixar rastro — sempre recuperável no banco, mesmo que
// ainda não exista uma tela de "lixeira" pra isso.
export function useDeleteAgendamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('excluir_agendamento', { p_agendamento_id: id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agendamentos'] }),
  });
}

// Busca um agendamento específico por id, fora do range de datas de
// useAgendamentosRange — usado pelo Dashboard pra achar o agendamento de uma
// sessão 'em_andamento' abandonada de um dia anterior, que não aparece na
// lista `appointments` (sempre só de hoje). Só dispara quando `id` existe.
export function useAgendamentoPorId(id) {
  return useQuery({
    queryKey: ['agendamento-por-id', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select(AGENDAMENTO_SELECT)
        .eq('id', id)
        .is('deletado_em', null)
        .maybeSingle();
      if (error) throw error;
      return data ? rowToEvent(data) : null;
    },
    enabled: !!id,
  });
}
