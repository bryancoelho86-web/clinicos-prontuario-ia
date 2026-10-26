-- Requisito do cliente (2026-08-25): (1) deixar explícito, ao criar um plano, se o
-- paciente terá sessões pré-determinadas ou não (frontend, sem mudança de
-- schema); (2) cobrir o caso que faltava — planos SEM sessões
-- pré-determinadas nunca finalizavam sozinhos (só os planos com contagem
-- fixa finalizam automaticamente, ver concluir_sessao() na 0025). Agora o
-- Dr. pode finalizar manualmente pelo perfil do paciente, respondendo se
-- houve melhora significativa (nunca bloqueia) + observação (obrigatória)
-- + foto opcional. E, pra unificar a experiência, a mesma pergunta de
-- desfecho passa a aparecer também quando um plano COM sessões definidas
-- finaliza sozinho (o Dr. é levado pro perfil do paciente nesse momento —
-- ver ModoAtendimento.jsx) — por isso a função abaixo cobre os dois casos.

alter table planos_tratamento
  add column finalizado_com_melhora boolean,
  add column observacao_finalizacao text;

create or replace function registrar_desfecho_plano_tratamento(
  p_plano_id uuid,
  p_teve_melhora boolean,
  p_observacao text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_status status_plano;
  v_sessoes_contratadas int;
  v_finalizado_com_melhora boolean;
  v_paciente_id uuid;
  v_tag_id uuid;
  v_tag_finalizado_id uuid;
begin
  if p_observacao is null or btrim(p_observacao) = '' then
    raise exception 'observação é obrigatória para registrar o desfecho';
  end if;

  select status, sessoes_contratadas, finalizado_com_melhora, paciente_id, tag_id
    into v_status, v_sessoes_contratadas, v_finalizado_com_melhora, v_paciente_id, v_tag_id
  from planos_tratamento where id = p_plano_id for update;

  if v_status is null then
    raise exception 'plano_tratamento % não encontrado', p_plano_id;
  end if;

  if v_status = 'ativo' and v_sessoes_contratadas is null then
    -- finalização manual (plano sem sessões pré-determinadas)
    update planos_tratamento
    set status = 'finalizado', data_fim = current_date,
        finalizado_com_melhora = p_teve_melhora, observacao_finalizacao = p_observacao
    where id = p_plano_id;
  elsif v_status = 'finalizado' and v_finalizado_com_melhora is null then
    -- já finalizado automaticamente (bateu o total de sessões) — só registra o desfecho
    update planos_tratamento
    set finalizado_com_melhora = p_teve_melhora, observacao_finalizacao = p_observacao
    where id = p_plano_id;
  else
    raise exception 'plano_tratamento % não está elegível para registrar desfecho (status %, desfecho já registrado?)', p_plano_id, v_status;
  end if;

  if v_tag_id is not null and not exists (
    select 1 from planos_tratamento
    where paciente_id = v_paciente_id and tag_id = v_tag_id and status = 'ativo'
  ) then
    delete from paciente_tags where paciente_id = v_paciente_id and tag_id = v_tag_id;
  end if;

  select id into v_tag_finalizado_id from tags where nome = 'Finalizado';
  if v_tag_finalizado_id is not null then
    insert into paciente_tags (paciente_id, tag_id)
    values (v_paciente_id, v_tag_finalizado_id)
    on conflict (paciente_id, tag_id) do nothing;
  end if;
end;
$$;

-- Reaproveita o trigger existente (já dispara em qualquer UPDATE que
-- finalize um plano, inclusive pelo novo caminho manual acima) só pra
-- incluir a observação como descricao do evento de timeline — mesmo padrão
-- já usado pro motivo de cancelamento logo abaixo. Fica null no ramo de
-- auto-finalização por contagem de sessões (o status não muda de novo
-- quando o desfecho é anexado depois, então o trigger não dispara outra
-- vez — o evento original de "tratamento_finalizado" fica sem a
-- observação nesse caso, aceitável, não reescrevemos histórico).
create or replace function trg_timeline_tratamento() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_nome text;
begin
  if tg_op = 'INSERT' then
    select nome into v_nome from protocolos where id = new.protocolo_id;
    insert into timeline_eventos (paciente_id, tipo, titulo, data, plano_tratamento_id, editavel)
    values (new.paciente_id, 'tratamento_iniciado', 'Tratamento iniciado' || coalesce(': ' || v_nome, ' (avulso)'), now(), new.id, false);
  elsif tg_op = 'UPDATE' and old.status <> 'finalizado' and new.status = 'finalizado' then
    insert into timeline_eventos (paciente_id, tipo, titulo, descricao, data, plano_tratamento_id, editavel)
    values (new.paciente_id, 'tratamento_finalizado', 'Tratamento finalizado', new.observacao_finalizacao, now(), new.id, false);
  elsif tg_op = 'UPDATE' and old.status <> 'cancelado' and new.status = 'cancelado' then
    insert into timeline_eventos (paciente_id, tipo, titulo, descricao, data, plano_tratamento_id, editavel)
    values (new.paciente_id, 'tratamento_cancelado', 'Tratamento cancelado', new.motivo_cancelamento, now(), new.id, false);
  end if;
  return new;
end;
$$;

-- concluir_sessao() passa a informar se essa conclusão finalizou o plano
-- (o frontend usa isso pra decidir se leva o Dr. direto pro perfil do
-- paciente com a caixa de desfecho aberta). Corpo idêntico ao da 0025 —
-- só o tipo de retorno (uuid -> jsonb) e o `return` final mudam. Precisa
-- de DROP porque CREATE OR REPLACE não troca tipo de retorno (mesmo
-- padrão já usado em criar_plano_tratamento, migration 0023).
drop function if exists concluir_sessao(uuid, text, jsonb, jsonb);

create or replace function concluir_sessao(
  p_sessao_id uuid,
  p_observacao_final text,
  p_procedimentos jsonb,
  p_documentos_paths jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_plano_id uuid;
  v_paciente_id uuid;
  v_agendamento_id uuid;
  v_numero_sessao int;
  v_sessoes_contratadas int;
  v_tag_id uuid;
  v_finalizou boolean;
  v_tag_finalizado_id uuid;
  v_proc jsonb;
  v_proc_realizado_id uuid;
  v_mat jsonb;
  v_titulo_timeline text;
begin
  select plano_tratamento_id, agendamento_id, numero_sessao
    into v_plano_id, v_agendamento_id, v_numero_sessao
  from sessoes where id = p_sessao_id and status = 'em_andamento'
  for update;

  if v_plano_id is null then
    raise exception 'sessão % não encontrada ou já concluída/cancelada', p_sessao_id;
  end if;

  select paciente_id, sessoes_contratadas, tag_id into v_paciente_id, v_sessoes_contratadas, v_tag_id
  from planos_tratamento where id = v_plano_id for update;

  if v_sessoes_contratadas is not null and v_numero_sessao > v_sessoes_contratadas then
    raise exception 'sessão excede o total contratado (%/%)', v_numero_sessao, v_sessoes_contratadas;
  end if;

  update sessoes
  set status = 'concluida', observacao_final = p_observacao_final, concluida_em = now(), rascunho = null
  where id = p_sessao_id;

  for v_proc in select * from jsonb_array_elements(p_procedimentos)
  loop
    insert into procedimentos_realizados (sessao_id, procedimento_id, materiais_conforme_padrao)
    values (p_sessao_id, (v_proc->>'procedimento_id')::uuid, (v_proc->>'materiais_conforme_padrao')::boolean)
    returning id into v_proc_realizado_id;

    insert into procedimento_realizado_materiais (procedimento_realizado_id, material_id, quantidade, origem)
    select v_proc_realizado_id, pm.material_id, pm.quantidade, 'padrao'
    from procedimento_materiais pm where pm.procedimento_id = (v_proc->>'procedimento_id')::uuid;

    for v_mat in
      select jsonb_build_object('material_id', pm.material_id, 'quantidade', pm.quantidade)
      from procedimento_materiais pm where pm.procedimento_id = (v_proc->>'procedimento_id')::uuid
    loop
      update estoque set quantidade_atual = quantidade_atual - (v_mat->>'quantidade')::numeric, atualizado_em = now()
      where material_id = (v_mat->>'material_id')::uuid;

      insert into movimentacoes_estoque (material_id, tipo, quantidade, motivo, sessao_id, procedimento_realizado_id)
      values ((v_mat->>'material_id')::uuid, 'saida', (v_mat->>'quantidade')::numeric, 'Sessão', p_sessao_id, v_proc_realizado_id);
    end loop;

    if (v_proc->'materiais_extra') is not null then
      insert into procedimento_realizado_materiais (procedimento_realizado_id, material_id, quantidade, origem)
      select v_proc_realizado_id, (m->>'material_id')::uuid, (m->>'quantidade')::numeric, 'extra'
      from jsonb_array_elements(v_proc->'materiais_extra') m;

      for v_mat in select * from jsonb_array_elements(v_proc->'materiais_extra')
      loop
        update estoque set quantidade_atual = quantidade_atual - (v_mat->>'quantidade')::numeric, atualizado_em = now()
        where material_id = (v_mat->>'material_id')::uuid;

        insert into movimentacoes_estoque (material_id, tipo, quantidade, motivo, sessao_id, procedimento_realizado_id)
        values ((v_mat->>'material_id')::uuid, 'saida', (v_mat->>'quantidade')::numeric, 'Sessão (material extra)', p_sessao_id, v_proc_realizado_id);
      end loop;
    end if;
  end loop;

  if p_documentos_paths is not null then
    insert into documentos (paciente_id, sessao_id, tipo, storage_path, nome_arquivo, mime_type, tamanho_bytes)
    select v_paciente_id, p_sessao_id, (d->>'tipo')::tipo_documento, d->>'storage_path', d->>'nome_arquivo',
           d->>'mime_type', nullif(d->>'tamanho_bytes','')::bigint
    from jsonb_array_elements(p_documentos_paths) d;
  end if;

  v_finalizou := v_sessoes_contratadas is not null and v_numero_sessao >= v_sessoes_contratadas;

  update planos_tratamento
  set sessoes_realizadas = v_numero_sessao,
      status = case when v_finalizou then 'finalizado' else status end,
      data_fim = case when v_finalizou then current_date else data_fim end
  where id = v_plano_id;

  if v_finalizou then
    if v_tag_id is not null and not exists (
      select 1 from planos_tratamento
      where paciente_id = v_paciente_id and tag_id = v_tag_id and status = 'ativo'
    ) then
      delete from paciente_tags where paciente_id = v_paciente_id and tag_id = v_tag_id;
    end if;

    select id into v_tag_finalizado_id from tags where nome = 'Finalizado';
    if v_tag_finalizado_id is not null then
      insert into paciente_tags (paciente_id, tag_id)
      values (v_paciente_id, v_tag_finalizado_id)
      on conflict (paciente_id, tag_id) do nothing;
    end if;
  end if;

  if v_sessoes_contratadas is not null then
    v_titulo_timeline := 'Sessão ' || v_numero_sessao;
  else
    select string_agg(pr.nome, ', ' order by pr.nome) into v_titulo_timeline
    from procedimentos pr
    where pr.id in (
      select (elem->>'procedimento_id')::uuid from jsonb_array_elements(p_procedimentos) elem
    );
    v_titulo_timeline := coalesce(v_titulo_timeline, 'Atendimento');
  end if;

  insert into timeline_eventos (paciente_id, tipo, titulo, descricao, data, sessao_id)
  values (v_paciente_id, 'sessao', v_titulo_timeline, p_observacao_final, now(), p_sessao_id);

  if v_agendamento_id is not null then
    update agendamentos set status = 'realizado', atualizado_em = now() where id = v_agendamento_id;
  end if;

  return jsonb_build_object(
    'sessao_id', p_sessao_id,
    'plano_tratamento_id', v_plano_id,
    'plano_finalizou', v_finalizou
  );
end;
$$;
