-- bugfix real (encontrado testando o upload de exame de verdade, 2026-07-30):
-- trg_timeline_exame() e trg_timeline_tratamento() escrevem em timeline_eventos,
-- tabela que só concede SELECT para authenticated (todo o resto entra via
-- trigger/RPC security definer). Como essas duas funções de trigger NUNCA
-- tiveram "security definer", elas rodam com o privilégio de quem disparou o
-- INSERT/UPDATE que as aciona. exames_insert permite authenticated inserir em
-- `exames` diretamente (sem passar por RPC) — e nesse caminho o trigger falhava
-- sempre com "permission denied for table timeline_eventos" (42501), quebrando
-- 100% das inserções de exame pelo frontend. planos_tratamento não tem esse
-- sintoma hoje (só é escrita via RPCs já security definer, que propagam o
-- privilégio do definer pros triggers que disparam), mas corrigido pelo mesmo
-- motivo e pra não depender desse detalhe frágil no futuro.

create or replace function trg_timeline_exame() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into timeline_eventos (paciente_id, tipo, titulo, descricao, data, exame_id, editavel)
  values (new.paciente_id, 'exame', 'Exame: ' || new.nome_exame, new.observacoes_medicas, new.data_exame::timestamptz, new.id, false);
  return new;
end;
$$;

create or replace function trg_timeline_tratamento() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_nome text;
begin
  if tg_op = 'INSERT' then
    select nome into v_nome from protocolos where id = new.protocolo_id;
    insert into timeline_eventos (paciente_id, tipo, titulo, data, plano_tratamento_id, editavel)
    values (new.paciente_id, 'tratamento_iniciado', 'Tratamento iniciado' || coalesce(': ' || v_nome, ' (avulso)'), now(), new.id, false);
  elsif tg_op = 'UPDATE' and old.status <> 'finalizado' and new.status = 'finalizado' then
    insert into timeline_eventos (paciente_id, tipo, titulo, data, plano_tratamento_id, editavel)
    values (new.paciente_id, 'tratamento_finalizado', 'Tratamento finalizado', now(), new.id, false);
  elsif tg_op = 'UPDATE' and old.status <> 'cancelado' and new.status = 'cancelado' then
    insert into timeline_eventos (paciente_id, tipo, titulo, descricao, data, plano_tratamento_id, editavel)
    values (new.paciente_id, 'tratamento_cancelado', 'Tratamento cancelado', new.motivo_cancelamento, now(), new.id, false);
  end if;
  return new;
end;
$$;
