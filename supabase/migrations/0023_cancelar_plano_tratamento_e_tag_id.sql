-- Requisito do cliente (2026-08-02): poder cancelar ("retirar") um plano de
-- tratamento ativo. Duas peças que faltavam:
--
-- 1. planos_tratamento nunca guardou a qual tag ele corresponde (o tipo
--    escolhido no modal "Novo plano" só existia como estado do
--    formulário) — sem isso não dá pra saber, no cancelamento, qual tag
--    reavaliar.
-- 2. cancelar_plano_tratamento() já existia desde a 0002 mas nunca foi
--    chamada pelo frontend, e não tinha nenhuma lógica de tag.

alter table planos_tratamento
  add column tag_id uuid references tags(id) on delete set null;

-- Assinatura muda (novo parâmetro) — precisa dropar a antiga primeiro,
-- CREATE OR REPLACE sozinho não troca a lista de argumentos.
drop function if exists criar_plano_tratamento(uuid, uuid, int, numeric);

create or replace function criar_plano_tratamento(
  p_paciente_id uuid,
  p_protocolo_id uuid,
  p_sessoes_contratadas int,
  p_preco_contratado numeric,
  p_tag_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_plano_id uuid;
begin
  insert into planos_tratamento (paciente_id, protocolo_id, sessoes_contratadas, preco_contratado, tag_id)
  values (p_paciente_id, p_protocolo_id, p_sessoes_contratadas, p_preco_contratado, p_tag_id)
  returning id into v_plano_id;

  if p_tag_id is not null then
    insert into paciente_tags (paciente_id, tag_id)
    values (p_paciente_id, p_tag_id)
    on conflict (paciente_id, tag_id) do nothing;
  end if;

  return v_plano_id;
end;
$$;

-- Mesma assinatura de sempre (p_plano_id uuid, p_motivo text) — CREATE OR
-- REPLACE preserva os grants existentes (authenticated já tem EXECUTE
-- desde a 0003, anon/public não).
create or replace function cancelar_plano_tratamento(p_plano_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_paciente_id uuid;
  v_tag_id uuid;
begin
  update planos_tratamento
  set status = 'cancelado', data_fim = current_date, motivo_cancelamento = p_motivo
  where id = p_plano_id and status = 'ativo'
  returning paciente_id, tag_id into v_paciente_id, v_tag_id;

  if not found then
    raise exception 'plano_tratamento % não encontrado ou não está ativo', p_plano_id;
  end if;

  if v_tag_id is not null and not exists (
    select 1 from planos_tratamento
    where paciente_id = v_paciente_id and tag_id = v_tag_id and status = 'ativo'
  ) then
    delete from paciente_tags where paciente_id = v_paciente_id and tag_id = v_tag_id;
  end if;
end;
$$;
