-- Corrige os achados Critical/Important de backend da auditoria completa
-- de 2026-08-19 (auditoria interna).

-- ============================================================
-- C1 (parte backend) — RPC atômica pra substituir os materiais de um
-- procedimento. O frontend hoje faz DELETE + INSERT como duas chamadas
-- separadas (useSetProcedimentoMateriais); se o INSERT falhar depois do
-- DELETE já ter comitado, a lista de materiais do tratamento fica vazia
-- sem rollback. Uma função só roda numa transação implícita — atômico
-- por natureza. Valida quantidade > 0 antes de mexer em qualquer linha.
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
      if (v_item->>'quantidade')::numeric <= 0 then
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
-- C2 — trava contra duas sessões 'em_andamento' pro mesmo agendamento
-- (duplo-clique ou duas abas no botão "Iniciar"). NULLs não colidem em
-- índice único, então agendamentos sem sessão nenhuma não são afetados.
-- ============================================================
create unique index if not exists sessoes_agendamento_ativa_uk
  on sessoes (agendamento_id)
  where status = 'em_andamento';

-- ============================================================
-- Achado #2 (Important) — defesa em profundidade contra numero_sessao
-- duplicado no mesmo plano. Exclui sessões 'cancelada' de propósito —
-- docs/arquitetura.md documenta que cancelar uma sessão libera renumeração/reinício.
-- Antes de aplicar esta migration, checar se já existe violação nos dados
-- reais (ver Step 2 abaixo) — se existir, resolver manualmente primeiro.
-- ============================================================
create unique index if not exists sessoes_plano_numero_ativo_uk
  on sessoes (plano_tratamento_id, numero_sessao)
  where status <> 'cancelada';

-- ============================================================
-- iniciar_sessao() — acrescenta a checagem de sessão já em andamento no
-- MESMO plano (não só no mesmo agendamento — dois agendamentos diferentes
-- do mesmo pacote, ambos iniciados antes de qualquer um concluir, calculam
-- o mesmo numero_sessao, porque o lock FOR UPDATE só protege até o commit
-- desta transação, não até a sessão ser concluída). Resto da função
-- idêntico ao original.
-- ============================================================
create or replace function public.iniciar_sessao(p_plano_tratamento_id uuid, p_agendamento_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sessao_id uuid;
  v_numero_sessao int;
  v_status status_plano;
  v_sessoes_contratadas int;
begin
  select sessoes_realizadas + 1, status, sessoes_contratadas
    into v_numero_sessao, v_status, v_sessoes_contratadas
  from planos_tratamento where id = p_plano_tratamento_id for update;

  if v_numero_sessao is null then
    raise exception 'plano_tratamento % não encontrado', p_plano_tratamento_id;
  end if;
  if v_status <> 'ativo' then
    raise exception 'plano_tratamento % não está ativo (status atual: %)', p_plano_tratamento_id, v_status;
  end if;
  if v_sessoes_contratadas is not null and v_numero_sessao > v_sessoes_contratadas then
    raise exception 'plano_tratamento % já atingiu o total de sessões contratadas (%)', p_plano_tratamento_id, v_sessoes_contratadas;
  end if;

  if exists (
    select 1 from sessoes
    where plano_tratamento_id = p_plano_tratamento_id and status = 'em_andamento'
  ) then
    raise exception 'já existe uma sessão em andamento para este plano de tratamento — conclua ou cancele antes de iniciar outra';
  end if;

  insert into sessoes (plano_tratamento_id, agendamento_id, numero_sessao, status)
  values (p_plano_tratamento_id, p_agendamento_id, v_numero_sessao, 'em_andamento')
  returning id into v_sessao_id;

  if p_agendamento_id is not null then
    update agendamentos set status = 'confirmado', atualizado_em = now() where id = p_agendamento_id;
  end if;

  return v_sessao_id;
end;
$function$;

-- ============================================================
-- concluir_sessao() — acrescenta: (1) checagem de que o plano ainda está
-- 'ativo' antes de prosseguir (achado #12 — um plano cancelado no meio de
-- uma sessão não deve mais poder ser finalizado); (2) pré-checagem de
-- estoque suficiente ANTES de debitar qualquer material, com mensagem
-- legível (achado #5 — hoje estoura a CHECK >= 0 no meio do débito e
-- reverte a sessão inteira sem explicação); (3) sessoes_realizadas usa
-- greatest() em vez de atribuição absoluta, defesa em profundidade caso a
-- trava do iniciar_sessao() seja contornada por uma chamada direta à RPC.
-- Resto da função (débito de estoque, timeline, tag Finalizado) idêntico
-- ao original — inclusive o fix de 0026 (jsonb_build_object com
-- material_id/quantidade), que continua presente, não foi tocado.
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
    if (select quantidade_atual from estoque where material_id = v_req.material_id) < v_req.necessario then
      raise exception 'Estoque insuficiente de "%" — disponível: %, necessário: %',
        (select nome from materiais where id = v_req.material_id),
        (select quantidade_atual from estoque where material_id = v_req.material_id),
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

-- ============================================================
-- Achado #1 — confirmar_resumo_ia() agora usa coalesce em resumo_clinico
-- (as outras 3 colunas já usavam) e só confirma uma gravação com
-- status='concluido' — sem isso, adicionar áudio depois numa consulta já
-- concluída, seguido de timeout da Edge Function (cenário já aceito no
-- docs/arquitetura.md), grava resumo_clinico = NULL por cima do que o Dr. escreveu
-- à mão.
-- ============================================================
create or replace function public.confirmar_resumo_ia(p_gravacao_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_consulta_id uuid;
  v_paciente_id uuid;
  v_medicamentos text[];
  v_doencas text[];
  v_destaques text[];
  v_resumo text;
begin
  select consulta_inicial_id into v_consulta_id from gravacoes_ia where id = p_gravacao_id;
  if v_consulta_id is null then
    raise exception 'gravacao_ia % não encontrada', p_gravacao_id;
  end if;

  update gravacoes_ia set confirmado = true, confirmado_em = now()
  where id = p_gravacao_id and confirmado = false and status = 'concluido';

  if not found then
    raise exception 'gravacao_ia % já foi confirmada anteriormente, ou ainda não está concluída — confirmar_resumo_ia não pode rodar', p_gravacao_id;
  end if;

  select paciente_id into v_paciente_id from consultas_iniciais where id = v_consulta_id;

  select array_agg(texto) into v_medicamentos from resumo_ia_itens where gravacao_id = p_gravacao_id and categoria = 'medicamento';
  select array_agg(texto) into v_doencas from resumo_ia_itens where gravacao_id = p_gravacao_id and categoria = 'doenca';
  select array_agg(texto) into v_destaques from resumo_ia_itens where gravacao_id = p_gravacao_id and categoria in ('alergia','hipotese','fator_risco','recomendacao');
  select resumo_clinico into v_resumo from gravacoes_ia where id = p_gravacao_id;

  update pacientes
  set medicamentos_uso = coalesce(v_medicamentos, medicamentos_uso),
      doencas_historico = coalesce(v_doencas, doencas_historico),
      destaques_clinicos = coalesce(v_destaques, destaques_clinicos),
      resumo_clinico = coalesce(v_resumo, resumo_clinico),
      atualizado_em = now()
  where id = v_paciente_id;

  insert into timeline_eventos (paciente_id, tipo, titulo, data, consulta_inicial_id)
  values (v_paciente_id, 'consulta_inicial', 'Consulta inicial registrada', now(), v_consulta_id);
end;
$function$;

-- ============================================================
-- Achados #3 e #4 — excluir_paciente_definitivamente() ganha
-- search_path fixo (era a única função security definer sem, das 23) e
-- passa a coletar pacientes.foto_perfil_path na lista de arquivos a
-- limpar do bucket documentos-paciente (a coluna foi adicionada em
-- migration posterior à função original e nunca foi retroalimentada —
-- sem isso a foto de perfil de um paciente excluído fica órfã pra sempre).
-- Resto da função (ordem de cascade, validação de CPF) idêntico.
-- ============================================================
create or replace function public.excluir_paciente_definitivamente(p_paciente_id uuid, p_cpf_confirmacao text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cpf_real text;
  v_storage_paths_documentos text[];
  v_storage_paths_gravacoes text[];
  v_foto_perfil_path text;
begin
  select cpf, foto_perfil_path into v_cpf_real, v_foto_perfil_path from pacientes where id = p_paciente_id;
  if v_cpf_real is null then
    raise exception 'Paciente não encontrado.';
  end if;
  if regexp_replace(v_cpf_real, '\D', '', 'g') <> regexp_replace(p_cpf_confirmacao, '\D', '', 'g') then
    raise exception 'CPF de confirmação não confere.';
  end if;

  select array_agg(storage_path) into v_storage_paths_documentos
    from documentos where paciente_id = p_paciente_id;

  select array_agg(g.storage_path) into v_storage_paths_gravacoes
    from gravacoes_ia g
    join consultas_iniciais ci on ci.id = g.consulta_inicial_id
    where ci.paciente_id = p_paciente_id and g.storage_path is not null;

  if v_foto_perfil_path is not null then
    v_storage_paths_documentos := coalesce(v_storage_paths_documentos, array[]::text[]) || v_foto_perfil_path;
  end if;

  delete from timeline_eventos where paciente_id = p_paciente_id;
  delete from indicadores where paciente_id = p_paciente_id;
  delete from exames where paciente_id = p_paciente_id;
  delete from sessoes where plano_tratamento_id in (select id from planos_tratamento where paciente_id = p_paciente_id)
                        or agendamento_id in (select id from agendamentos where paciente_id = p_paciente_id);
  delete from agendamentos where paciente_id = p_paciente_id;
  delete from planos_tratamento where paciente_id = p_paciente_id;
  delete from consultas_iniciais where paciente_id = p_paciente_id;
  delete from documentos where paciente_id = p_paciente_id;
  delete from pacientes where id = p_paciente_id;

  return jsonb_build_object(
    'storage_paths_documentos', coalesce(to_jsonb(v_storage_paths_documentos), '[]'::jsonb),
    'storage_paths_gravacoes', coalesce(to_jsonb(v_storage_paths_gravacoes), '[]'::jsonb)
  );
end;
$function$;
