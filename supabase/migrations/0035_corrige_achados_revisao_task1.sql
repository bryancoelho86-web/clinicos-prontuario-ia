-- Corrige os achados da revisão da Task 1 (migration 0034) — auditoria
-- completa de 2026-08-19.

-- ============================================================
-- Important #1 — sessoes_plano_numero_ativo_uk (criado em 0034) é
-- duplicata textual de uq_sessoes_plano_numero, já criado em
-- 0001_schema_final.sql (mesmas colunas, mesmo predicado parcial). O
-- advisor de performance do Supabase passou a apontar WARN de
-- duplicate_index pra essa dupla assim que 0034 foi aplicada. Mantém só
-- o índice original (uq_sessoes_plano_numero) e derruba o novo.
-- ============================================================
drop index if exists public.sessoes_plano_numero_ativo_uk;

-- ============================================================
-- Minor #4 — definir_materiais_procedimento(): (v_item->>'quantidade')::numeric <= 0
-- avalia pra NULL (não TRUE) quando 'quantidade' está ausente/null no
-- item, então um item malformado passava direto pro INSERT e estourava
-- a violação NOT NULL crua do Postgres (em inglês) em vez da exceção em
-- português já escrita pra esse caso. Fix: coalesce(..., 0) força a
-- comparação a avaliar TRUE quando quantidade é null/ausente. Resto da
-- função idêntico ao aplicado em 0034.
-- ============================================================
create or replace function public.definir_materiais_procedimento(
  p_procedimento_id uuid,
  p_materiais jsonb
)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_item jsonb;
begin
  if p_materiais is not null then
    for v_item in select * from jsonb_array_elements(p_materiais)
    loop
      if coalesce((v_item->>'quantidade')::numeric, 0) <= 0 then
        raise exception 'quantidade do material % deve ser maior que zero', v_item->>'material_id';
      end if;
    end loop;
  end if;

  delete from procedimento_materiais where procedimento_id = p_procedimento_id;

  if p_materiais is not null and jsonb_array_length(p_materiais) > 0 then
    insert into procedimento_materiais (procedimento_id, material_id, quantidade)
    select p_procedimento_id, (m->>'material_id')::uuid, (m->>'quantidade')::numeric
    from jsonb_array_elements(p_materiais) m;
  end if;
end;
$function$;

-- ============================================================
-- Minor #5 e #6 — concluir_sessao(): a pré-checagem de estoque
-- (introduzida em 0034 pro achado #5) era NULL-permissiva se um material
-- não tivesse linha em `estoque` — hoje inalcançável na prática (o
-- trigger da migration 0008 cria a linha de estoque junto com o
-- material), mas barato de blindar mesmo assim: coalesce(..., 0) faz a
-- comparação avaliar TRUE (estoque insuficiente) em vez de NULL
-- (condição ignorada) nesse caso hipotético. Também documenta, via
-- comentário, o gap TOCTOU já aceito entre a pré-checagem e o débito
-- de fato (nenhum lock de linha em `estoque` durante a checagem) — numa
-- aplicação de médico único isso é aceitável, e a CHECK
-- (quantidade_atual >= 0) já existente continua como rede de segurança
-- final caso o gap seja explorado. Resto da função idêntico ao aplicado
-- em 0034 (inclusive o fix de 0026, não tocado).
-- ============================================================
create or replace function public.concluir_sessao(p_sessao_id uuid, p_observacao_final text, p_procedimentos jsonb, p_documentos_paths jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_plano_id uuid;
  v_paciente_id uuid;
  v_agendamento_id uuid;
  v_numero_sessao int;
  v_sessoes_contratadas int;
  v_tag_id uuid;
  v_status_plano status_plano;
  v_finalizou boolean;
  v_tag_finalizado_id uuid;
  v_proc jsonb;
  v_proc_realizado_id uuid;
  v_mat jsonb;
  v_titulo_timeline text;
  v_req record;
begin
  select plano_tratamento_id, agendamento_id, numero_sessao
    into v_plano_id, v_agendamento_id, v_numero_sessao
  from sessoes where id = p_sessao_id and status = 'em_andamento'
  for update;

  if v_plano_id is null then
    raise exception 'sessão % não encontrada ou já concluída/cancelada', p_sessao_id;
  end if;

  select paciente_id, sessoes_contratadas, tag_id, status into v_paciente_id, v_sessoes_contratadas, v_tag_id, v_status_plano
  from planos_tratamento where id = v_plano_id for update;

  if v_status_plano <> 'ativo' then
    raise exception 'plano de tratamento % não está mais ativo (status atual: %) — sessão não pode ser concluída', v_plano_id, v_status_plano;
  end if;

  if v_sessoes_contratadas is not null and v_numero_sessao > v_sessoes_contratadas then
    raise exception 'sessão excede o total contratado (%/%)', v_numero_sessao, v_sessoes_contratadas;
  end if;

  -- Pré-checagem de estoque suficiente ANTES de debitar qualquer material
  -- (achado #5). Nota: existe um gap TOCTOU aqui — não há lock de linha
  -- em `estoque` entre esta checagem e o UPDATE de débito mais abaixo, só
  -- os locks FOR UPDATE em `sessoes`/`planos_tratamento` já tirados acima.
  -- Numa aplicação de médico único, concluir_sessao() concorrente pro
  -- mesmo material é um cenário de probabilidade desprezível; aceito por
  -- ora, e a CHECK (quantidade_atual >= 0) em `estoque` continua como
  -- rede de segurança final caso o gap seja explorado.
  for v_req in
    select material_id, sum(necessario) as necessario
    from (
      select pm.material_id, pm.quantidade as necessario
      from jsonb_array_elements(p_procedimentos) proc
      join procedimento_materiais pm on pm.procedimento_id = (proc->>'procedimento_id')::uuid
      union all
      select (m->>'material_id')::uuid, (m->>'quantidade')::numeric
      from jsonb_array_elements(p_procedimentos) proc,
           jsonb_array_elements(coalesce(proc->'materiais_extra', '[]'::jsonb)) m
    ) t
    group by material_id
  loop
    if coalesce((select quantidade_atual from estoque where material_id = v_req.material_id), 0) < v_req.necessario then
      raise exception 'Estoque insuficiente de "%" — disponível: %, necessário: %',
        (select nome from materiais where id = v_req.material_id),
        coalesce((select quantidade_atual from estoque where material_id = v_req.material_id), 0),
        v_req.necessario;
    end if;
  end loop;

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
  set sessoes_realizadas = greatest(sessoes_realizadas, v_numero_sessao),
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
$function$;
