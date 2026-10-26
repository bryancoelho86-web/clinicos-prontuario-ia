-- O enum tipo_evento_timeline já tinha 'observacao_livre' desde a migration
-- 0001, mas nenhuma função escrevia nela — timeline_eventos só tem RLS de
-- SELECT (todas as outras entradas nascem de triggers/RPCs de negócio). Sem
-- isso, não havia como o Dr. registrar uma nota manual na timeline do
-- paciente (recurso que a tela de perfil do paciente precisa).

create or replace function adicionar_observacao_timeline(
  p_paciente_id uuid,
  p_titulo text,
  p_descricao text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into timeline_eventos (paciente_id, tipo, titulo, descricao, data, editavel)
  values (p_paciente_id, 'observacao_livre', p_titulo, p_descricao, now(), true)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function editar_descricao_timeline(
  p_evento_id uuid,
  p_descricao text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update timeline_eventos set descricao = p_descricao
  where id = p_evento_id and editavel = true;

  if not found then
    raise exception 'evento de timeline % não existe ou não é editável', p_evento_id;
  end if;
end;
$$;

revoke execute on function adicionar_observacao_timeline(uuid, text, text) from anon;
revoke execute on function editar_descricao_timeline(uuid, text) from anon;
