-- Requisito do cliente (2026-08-04): a Consulta Inicial passa a ser iniciada
-- pelo Dashboard (como qualquer outro atendimento agendado), não mais
-- por um botão dentro do perfil do paciente. Pra isso, precisa do mesmo
-- vínculo que sessões comuns já têm com o agendamento que as originou
-- (sessoes.agendamento_id) — sem isso, não tem como marcar o agendamento
-- como 'realizado' ao concluir a consulta.

alter table consultas_iniciais
  add column agendamento_id uuid references agendamentos(id) on delete set null;

drop function if exists iniciar_consulta_inicial(uuid);

create or replace function iniciar_consulta_inicial(p_paciente_id uuid, p_agendamento_id uuid default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  insert into consultas_iniciais (paciente_id, agendamento_id, status)
  values (p_paciente_id, p_agendamento_id, 'em_andamento')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function concluir_consulta_inicial(
  p_consulta_id uuid,
  p_anamnese text,
  p_gerar_plano boolean,
  p_protocolo_id uuid,
  p_sessoes_contratadas int,
  p_preco_contratado numeric
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_paciente_id uuid;
  v_agendamento_id uuid;
  v_plano_id uuid;
begin
  update consultas_iniciais
  set status = 'concluida', anamnese = p_anamnese, concluida_em = now()
  where id = p_consulta_id and status = 'em_andamento'
  returning paciente_id, agendamento_id into v_paciente_id, v_agendamento_id;

  if v_paciente_id is null then
    raise exception 'consulta_inicial % não encontrada ou não está em andamento', p_consulta_id;
  end if;

  if v_agendamento_id is not null then
    update agendamentos set status = 'realizado', atualizado_em = now() where id = v_agendamento_id;
  end if;

  if p_gerar_plano then
    insert into planos_tratamento (
      paciente_id, protocolo_id, origem_consulta_inicial_id,
      sessoes_contratadas, preco_contratado
    ) values (
      v_paciente_id, p_protocolo_id, p_consulta_id,
      p_sessoes_contratadas, p_preco_contratado
    ) returning id into v_plano_id;
  end if;

  return coalesce(v_plano_id, p_consulta_id);
end;
$$;
