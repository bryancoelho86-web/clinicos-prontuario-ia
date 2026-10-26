-- Requisito do cliente (2026-09-01): após perder compromissos em outra
-- ferramenta de agenda, o cliente pediu garantia de que nada
-- desaparece sozinho no ClinicOS. Investigação encontrou o único ponto
-- real de risco: `agendamentos` era a ÚNICA entidade importante do sistema
-- ainda com hard delete de verdade (todo o resto — pacientes, documentos,
-- exames, planos_tratamento, sessões, investimentos — já usa soft delete
-- via `deletado_em`). Um clique em "Excluir" (mesmo já tendo confirmação)
-- apagava a linha pra sempre, sem nenhum rastro nem chance de recuperação.

alter table agendamentos add column deletado_em timestamptz;

-- Revoga DELETE de verdade — daqui pra frente é fisicamente impossível o
-- client apagar uma linha de agendamentos (só via a função abaixo, que
-- nunca faz DELETE, só soft delete). useDeleteAgendamento (frontend) muda
-- de .delete() cru pra chamar essa RPC.
revoke delete on agendamentos from authenticated;

-- Substitui o hard delete cru do frontend. Preserva a mesma trava que a
-- FK RESTRICT de sessoes.agendamento_id já dava de graça antes (bloquear
-- excluir um agendamento que já virou atendimento) — como soft delete
-- nunca dispara FK, a checagem precisa ser explícita aqui agora. Marca
-- status='cancelado' junto (não só deletado_em) pra reaproveitar a
-- exclusion constraint sem_conflito_horario já existente (que já ignora
-- status='cancelado' na hora de checar sobreposição de horário) — sem
-- isso, o horário do agendamento "excluído" continuaria travado,
-- impedindo remarcar outro paciente no mesmo slot. Testado ao vivo em
-- transação com rollback antes de aplicar: exclusão comum funciona,
-- horário liberado pra reagendar em seguida, e exclusão de agendamento
-- com sessão vinculada bloqueia com a mensagem abaixo.
create or replace function excluir_agendamento(p_agendamento_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from sessoes where agendamento_id = p_agendamento_id) then
    raise exception 'Não é possível excluir um agendamento que já teve atendimento iniciado.';
  end if;

  update agendamentos
  set deletado_em = now(), status = 'cancelado', atualizado_em = now()
  where id = p_agendamento_id and deletado_em is null;

  if not found then
    raise exception 'agendamento % não encontrado ou já excluído', p_agendamento_id;
  end if;
end;
$$;

-- View pré-existente precisa ignorar os soft-deletados agora.
create or replace view v_agenda_do_dia as
select * from agendamentos where inicio::date = current_date and status <> 'cancelado' and deletado_em is null;
