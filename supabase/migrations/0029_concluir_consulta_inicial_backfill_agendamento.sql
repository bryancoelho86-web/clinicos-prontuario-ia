-- Achado na revisão final (2026-08-04): agendamento_id só era gravado por
-- iniciar_consulta_inicial() — uma consulta retomada (já em_andamento, sem
-- passar pelo botão de iniciar de novo) nunca ganhava o vínculo, e
-- concluir_consulta_inicial() não tinha como marcar o agendamento como
-- realizado. Passa a aceitar p_agendamento_id também na conclusão e
-- preencher via coalesce (não sobrescreve um vínculo já existente).
drop function if exists concluir_consulta_inicial(uuid, text, boolean, uuid, int, numeric);

create or replace function concluir_consulta_inicial(
  p_consulta_id uuid,
  p_anamnese text,
  p_gerar_plano boolean,
  p_protocolo_id uuid,
  p_sessoes_contratadas int,
  p_preco_contratado numeric,
  p_agendamento_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_paciente_id uuid;
  v_agendamento_id uuid;
  v_plano_id uuid;
begin
  update consultas_iniciais
  set status = 'concluida', anamnese = p_anamnese, concluida_em = now(),
      agendamento_id = coalesce(agendamento_id, p_agendamento_id)
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

-- Achado 6 (low): a coluna nova da 0028 nasceu sem índice — sessoes.agendamento_id
-- (mesmo padrão que esta coluna espelha) já tem idx_sessoes_agendamento.
create index if not exists idx_consultas_iniciais_agendamento on consultas_iniciais using btree (agendamento_id);
