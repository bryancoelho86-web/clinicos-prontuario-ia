-- Requisito do cliente (2026-08-02): a tag deve acompanhar o plano de
-- tratamento em andamento de verdade — aplicada ao criar (já
-- funcionava), removida ao cancelar (restaura o que a 0024 tinha
-- desfeito, agora que o campo "Classificação" manual foi removido do
-- cadastro — ver frontend desta mesma feature — o motivo daquela
-- reversão deixou de existir), e trocada pela tag "Finalizado" quando o
-- plano bate o total de sessões contratadas. "Finalizado" é permanente
-- uma vez ganha, mesmo que o paciente entre num plano novo depois.

insert into tags (nome, cor) values ('Finalizado', '#0D9488')
on conflict do nothing;

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

create or replace function concluir_sessao(
  p_sessao_id uuid,
  p_observacao_final text,
  p_procedimentos jsonb,
  p_documentos_paths jsonb
) returns uuid
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

  return p_sessao_id;
end;
$$;
