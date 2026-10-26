-- =========================================================
-- ClinicOS — Funções, Triggers, RLS e Storage (FINAL v3)
-- Depende de: 0001_schema_final.sql
-- Mono-médico: nenhuma função recebe profissional_id.
-- Toda função security definer fixa search_path (proteção contra
-- search_path hijacking) e tem EXECUTE revogado de PUBLIC antes do
-- GRANT explícito para authenticated.
-- =========================================================

-- ---------------------------------------------------------
-- 1. SESSÃO — ciclo de vida em duas fases
-- ---------------------------------------------------------
create or replace function iniciar_sessao(
  p_plano_tratamento_id uuid,
  p_agendamento_id uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
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

  insert into sessoes (plano_tratamento_id, agendamento_id, numero_sessao, status)
  values (p_plano_tratamento_id, p_agendamento_id, v_numero_sessao, 'em_andamento')
  returning id into v_sessao_id;

  if p_agendamento_id is not null then
    update agendamentos set status = 'confirmado', atualizado_em = now() where id = p_agendamento_id;
  end if;

  return v_sessao_id;
end;
$$;

create or replace function salvar_rascunho_sessao(
  p_sessao_id uuid,
  p_observacoes text,
  p_rascunho jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update sessoes
  set observacoes = coalesce(p_observacoes, observacoes),
      rascunho = coalesce(p_rascunho, rascunho)
  where id = p_sessao_id and status = 'em_andamento';

  if not found then
    raise exception 'sessão % não existe ou já foi concluída/cancelada', p_sessao_id;
  end if;
end;
$$;

create or replace function cancelar_sessao(p_sessao_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update sessoes set status = 'cancelada' where id = p_sessao_id and status = 'em_andamento';
  if not found then
    raise exception 'sessão % não existe ou não está em andamento', p_sessao_id;
  end if;
end;
$$;

create or replace function concluir_sessao(
  p_sessao_id uuid,
  p_observacao_final text,
  p_procedimentos jsonb, -- [{ procedimento_id, materiais_conforme_padrao, materiais_extra:[{material_id,quantidade}] }]
  p_documentos_paths jsonb -- [{ tipo, storage_path, nome_arquivo, mime_type, tamanho_bytes }]
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_plano_id uuid;
  v_paciente_id uuid;
  v_agendamento_id uuid;
  v_numero_sessao int;
  v_sessoes_contratadas int;
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

  select paciente_id, sessoes_contratadas into v_paciente_id, v_sessoes_contratadas
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
      select pm.material_id, pm.quantidade
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

  update planos_tratamento
  set sessoes_realizadas = v_numero_sessao,
      status = case when v_sessoes_contratadas is not null and v_numero_sessao >= v_sessoes_contratadas
                    then 'finalizado' else status end,
      data_fim = case when v_sessoes_contratadas is not null and v_numero_sessao >= v_sessoes_contratadas
                       then current_date else data_fim end
  where id = v_plano_id;

  -- "Sessão N" só faz sentido quando existe um pacote fechado (sessoes_contratadas definido —
  -- Premium/Por Sessão). Sem pacote fechado (Homecare, avulso), a timeline mostra os
  -- procedimentos feitos no dia, não um número de sessão.
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

-- ---------------------------------------------------------
-- 2. DOCUMENTOS — foto (hard delete) vs. demais (soft delete)
-- ---------------------------------------------------------
create or replace function remover_foto(p_documento_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_tipo tipo_documento;
  v_path text;
begin
  select tipo, storage_path into v_tipo, v_path from documentos where id = p_documento_id;

  if v_tipo is null then
    raise exception 'documento % não encontrado', p_documento_id;
  end if;
  if v_tipo <> 'foto' then
    raise exception 'remover_foto só pode ser usada para documentos do tipo foto (este é %)', v_tipo;
  end if;

  -- remove o objeto físico do Storage (storage.objects é uma tabela real do Postgres no Supabase)
  delete from storage.objects where bucket_id = 'documentos-paciente' and name = v_path;

  -- remove a linha do banco de verdade — sem soft delete para fotos
  delete from documentos where id = p_documento_id;
end;
$$;

create or replace function remover_documento(p_documento_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_tipo tipo_documento;
begin
  select tipo into v_tipo from documentos where id = p_documento_id;

  if v_tipo is null then
    raise exception 'documento % não encontrado', p_documento_id;
  end if;
  if v_tipo = 'foto' then
    raise exception 'use remover_foto() para remover fotos (hard delete), não remover_documento()';
  end if;

  update documentos set deletado_em = now() where id = p_documento_id;

  -- mantém exames.deletado_em sincronizado — sem isso, o exame ficava "ativo"
  -- mesmo com o documento (arquivo) já removido da biblioteca
  if v_tipo = 'exame' then
    update exames set deletado_em = now() where documento_id = p_documento_id;
  end if;
end;
$$;

-- ---------------------------------------------------------
-- 3. CONSULTA INICIAL + IA
-- ---------------------------------------------------------
create or replace function iniciar_consulta_inicial(p_paciente_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  insert into consultas_iniciais (paciente_id, status)
  values (p_paciente_id, 'em_andamento')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function cancelar_consulta_inicial(p_consulta_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update consultas_iniciais set status = 'cancelada' where id = p_consulta_id and status = 'em_andamento';
  if not found then
    raise exception 'consulta_inicial % não existe ou não está em andamento', p_consulta_id;
  end if;
end;
$$;

-- Chamada pelo frontend ao clicar "Gravar Consulta Inicial" — só cria a linha;
-- quem faz upload do áudio e chama a transcrição é a Edge Function (fora do banco).
create or replace function iniciar_gravacao_ia(p_consulta_inicial_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_status status_consulta;
begin
  select status into v_status from consultas_iniciais where id = p_consulta_inicial_id;
  if v_status is null then
    raise exception 'consulta_inicial % não encontrada', p_consulta_inicial_id;
  end if;
  -- permite 'em_andamento' (gravação da própria consulta) e 'concluida' (adicionar
  -- áudio depois, mesmo já concluída); só bloqueia consulta cancelada.
  if v_status = 'cancelada' then
    raise exception 'consulta_inicial % está cancelada — não é possível gravar áudio para ela', p_consulta_inicial_id;
  end if;

  insert into gravacoes_ia (consulta_inicial_id, status)
  values (p_consulta_inicial_id, 'gravando')
  returning id into v_id;
  return v_id;
end;
$$;

-- Chamada pela Edge Function depois que a IA (fora do banco) processa o áudio.
-- O banco só ARMAZENA o resultado — nenhuma inteligência roda aqui dentro.
create or replace function registrar_transcricao_ia(
  p_gravacao_id uuid,
  p_transcricao text,
  p_resumo_clinico text,
  p_itens jsonb -- [{ categoria, texto }]
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from gravacoes_ia where id = p_gravacao_id) then
    raise exception 'gravacao_ia % não encontrada', p_gravacao_id;
  end if;

  -- guard atômico real: a condição "confirmado = false" está no WHERE do próprio
  -- UPDATE, não numa SELECT separada — sob concorrência, a segunda transação que
  -- tentar isso após um confirmar_resumo_ia() já commitado simplesmente não
  -- encontra a linha (confirmado já é true) e cai no "not found" abaixo.
  update gravacoes_ia
  set status = 'concluido', transcricao = p_transcricao, resumo_clinico = p_resumo_clinico
  where id = p_gravacao_id and confirmado = false;

  if not found then
    raise exception 'gravacao_ia % já foi confirmada — não pode mais ser editada/reprocessada', p_gravacao_id;
  end if;

  -- Idempotente e chamável repetidamente: serve tanto para o resultado da IA quanto
  -- para o autosave enquanto o médico revisa/edita a transcrição e o resumo antes de confirmar.
  delete from resumo_ia_itens where gravacao_id = p_gravacao_id;
  insert into resumo_ia_itens (gravacao_id, categoria, texto)
  select p_gravacao_id, (i->>'categoria')::categoria_item_ia, i->>'texto'
  from jsonb_array_elements(p_itens) i;
end;
$$;

-- Único ponto que escreve o resumo/hipóteses no prontuário. Nada entra
-- automaticamente — só quando o médico chama esta função explicitamente.
-- Alergias não têm mais coluna própria: entram junto com hipótese/fator de
-- risco/recomendação em destaques_clinicos (texto livre), sem destaque especial.
create or replace function confirmar_resumo_ia(p_gravacao_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_consulta_id uuid;
  v_paciente_id uuid;
  v_medicamentos text[];
  v_doencas text[];
  v_destaques text[];
begin
  select consulta_inicial_id into v_consulta_id from gravacoes_ia where id = p_gravacao_id;
  if v_consulta_id is null then
    raise exception 'gravacao_ia % não encontrada', p_gravacao_id;
  end if;

  -- guard atômico real: só passa se conseguir virar confirmado=false -> true agora
  -- mesmo. Sob concorrência, só uma das chamadas simultâneas consegue casar essa
  -- condição; a outra bate em "not found" e nunca chega a duplicar o restante.
  update gravacoes_ia set confirmado = true, confirmado_em = now()
  where id = p_gravacao_id and confirmado = false;

  if not found then
    raise exception 'gravacao_ia % já foi confirmada anteriormente — confirmar_resumo_ia não pode rodar duas vezes', p_gravacao_id;
  end if;

  select paciente_id into v_paciente_id from consultas_iniciais where id = v_consulta_id;

  select array_agg(texto) into v_medicamentos from resumo_ia_itens where gravacao_id = p_gravacao_id and categoria = 'medicamento';
  select array_agg(texto) into v_doencas from resumo_ia_itens where gravacao_id = p_gravacao_id and categoria = 'doenca';
  select array_agg(texto) into v_destaques from resumo_ia_itens where gravacao_id = p_gravacao_id and categoria in ('alergia','hipotese','fator_risco','recomendacao');

  update pacientes
  set medicamentos_uso = coalesce(v_medicamentos, medicamentos_uso),
      doencas_historico = coalesce(v_doencas, doencas_historico),
      destaques_clinicos = coalesce(v_destaques, destaques_clinicos),
      resumo_clinico = (select resumo_clinico from gravacoes_ia where id = p_gravacao_id),
      atualizado_em = now()
  where id = v_paciente_id;

  insert into timeline_eventos (paciente_id, tipo, titulo, data, consulta_inicial_id)
  values (v_paciente_id, 'consulta_inicial', 'Consulta inicial registrada', now(), v_consulta_id);
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
  v_plano_id uuid;
begin
  update consultas_iniciais
  set status = 'concluida', anamnese = p_anamnese, concluida_em = now()
  where id = p_consulta_id and status = 'em_andamento'
  returning paciente_id into v_paciente_id;

  if v_paciente_id is null then
    raise exception 'consulta_inicial % não encontrada ou não está em andamento', p_consulta_id;
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

  return v_plano_id;
end;
$$;

-- Novo tratamento para paciente que JÁ passou pela consulta inicial antes
-- (fluxo mais comum do dia a dia: paciente antigo volta e começa outro plano)
create or replace function criar_plano_tratamento(
  p_paciente_id uuid,
  p_protocolo_id uuid,
  p_sessoes_contratadas int,
  p_preco_contratado numeric
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_plano_id uuid;
begin
  insert into planos_tratamento (paciente_id, protocolo_id, sessoes_contratadas, preco_contratado)
  values (p_paciente_id, p_protocolo_id, p_sessoes_contratadas, p_preco_contratado)
  returning id into v_plano_id;
  return v_plano_id;
end;
$$;

create or replace function cancelar_plano_tratamento(p_plano_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update planos_tratamento
  set status = 'cancelado', data_fim = current_date, motivo_cancelamento = p_motivo
  where id = p_plano_id and status = 'ativo';

  if not found then
    raise exception 'plano_tratamento % não encontrado ou não está ativo', p_plano_id;
  end if;
end;
$$;

-- ---------------------------------------------------------
-- 4. ESTOQUE — entrada controlada (ledger obrigatório)
-- ---------------------------------------------------------
create or replace function entrada_estoque(
  p_material_id uuid,
  p_quantidade numeric,
  p_motivo text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_quantidade <= 0 then
    raise exception 'quantidade de entrada deve ser positiva';
  end if;

  update estoque set quantidade_atual = quantidade_atual + p_quantidade, atualizado_em = now()
  where material_id = p_material_id;

  if not found then
    raise exception 'material % não encontrado no estoque', p_material_id;
  end if;

  insert into movimentacoes_estoque (material_id, tipo, quantidade, motivo)
  values (p_material_id, 'entrada', p_quantidade, p_motivo);
end;
$$;

-- Ajuste por contagem física (inventário): informa-se quanto EXISTE de verdade,
-- não a diferença — evita erro de conta feita de cabeça na hora de bater o estoque.
create or replace function ajustar_estoque(
  p_material_id uuid,
  p_quantidade_contada numeric,
  p_motivo text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_atual numeric;
  v_diferenca numeric;
begin
  select quantidade_atual into v_atual from estoque where material_id = p_material_id for update;
  if v_atual is null then
    raise exception 'material % não encontrado no estoque', p_material_id;
  end if;

  v_diferenca := p_quantidade_contada - v_atual;
  if v_diferenca = 0 then
    return; -- nada a ajustar
  end if;

  update estoque set quantidade_atual = p_quantidade_contada, atualizado_em = now()
  where material_id = p_material_id;

  insert into movimentacoes_estoque (material_id, tipo, quantidade, motivo)
  values (p_material_id, 'ajuste', v_diferenca, coalesce(p_motivo, 'Ajuste de inventário'));
end;
$$;

-- ---------------------------------------------------------
-- 5. PERFIL INTELIGENTE — atualizado pela Edge Function, nunca pelo banco sozinho
-- ---------------------------------------------------------
create or replace function atualizar_perfil_inteligente(
  p_paciente_id uuid,
  p_itens jsonb, -- [{ categoria, texto, ordem }]
  p_modelo_ia text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into perfil_inteligente_paciente (paciente_id, versao, modelo_ia, gerado_em)
  values (p_paciente_id, 1, p_modelo_ia, now())
  on conflict (paciente_id) do update
    set versao = perfil_inteligente_paciente.versao + 1,
        modelo_ia = excluded.modelo_ia,
        gerado_em = now();

  delete from perfil_inteligente_itens where paciente_id = p_paciente_id;
  insert into perfil_inteligente_itens (paciente_id, categoria, texto, ordem)
  select p_paciente_id, (i->>'categoria')::categoria_perfil_inteligente, i->>'texto',
         coalesce((i->>'ordem')::int, 1)
  from jsonb_array_elements(p_itens) i;
end;
$$;

-- ---------------------------------------------------------
-- 6. TRIGGERS de timeline automática
-- ---------------------------------------------------------
create or replace function trg_timeline_exame() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  insert into timeline_eventos (paciente_id, tipo, titulo, descricao, data, exame_id, editavel)
  values (new.paciente_id, 'exame', 'Exame: ' || new.nome_exame, new.observacoes_medicas, new.data_exame::timestamptz, new.id, false);
  return new;
end;
$$;
create trigger t_timeline_exame after insert on exames for each row execute function trg_timeline_exame();

create or replace function trg_timeline_tratamento() returns trigger
language plpgsql set search_path = public, pg_temp as $$
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
create trigger t_timeline_tratamento after insert or update on planos_tratamento
  for each row execute function trg_timeline_tratamento();

create or replace function trg_set_atualizado_em() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin new.atualizado_em = now(); return new; end;
$$;
create trigger t_pacientes_atualizado_em before update on pacientes
  for each row execute function trg_set_atualizado_em();

-- Garante que concluida_em sempre reflita concluida, mesmo com CRUD livre na tabela
-- (Grupo A) — evita concluida=true com concluida_em nulo, ou o contrário.
create or replace function trg_tarefas_concluida_em() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.concluida and (tg_op = 'INSERT' or not old.concluida) then
    new.concluida_em := now();
  elsif not new.concluida then
    new.concluida_em := null;
  end if;
  return new;
end;
$$;
create trigger t_tarefas_concluida_em before insert or update on tarefas
  for each row execute function trg_tarefas_concluida_em();

-- ---------------------------------------------------------
-- 7. GRANTS DAS FUNÇÕES — revoga de PUBLIC antes de conceder a authenticated
-- ---------------------------------------------------------
do $$
declare f text;
begin
  for f in select unnest(array[
    'iniciar_sessao(uuid,uuid)',
    'salvar_rascunho_sessao(uuid,text,jsonb)',
    'cancelar_sessao(uuid)',
    'concluir_sessao(uuid,text,jsonb,jsonb)',
    'remover_foto(uuid)',
    'remover_documento(uuid)',
    'iniciar_consulta_inicial(uuid)',
    'cancelar_consulta_inicial(uuid)',
    'iniciar_gravacao_ia(uuid)',
    'registrar_transcricao_ia(uuid,text,text,jsonb)',
    'confirmar_resumo_ia(uuid)',
    'concluir_consulta_inicial(uuid,text,boolean,uuid,int,numeric)',
    'criar_plano_tratamento(uuid,uuid,int,numeric)',
    'cancelar_plano_tratamento(uuid,text)',
    'entrada_estoque(uuid,numeric,text)',
    'ajustar_estoque(uuid,numeric,text)',
    'atualizar_perfil_inteligente(uuid,jsonb,text)'
  ])
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------
-- Revoga tudo primeiro (Supabase concede ALL a anon/authenticated por padrão
-- no schema public — sem isso, os grants restritos abaixo não têm efeito real)
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

do $$
declare t text;
begin
  for t in select unnest(array[
    'pacientes','materiais','estoque','procedimentos','procedimento_materiais',
    'tags','procedimento_tags','paciente_tags','paciente_procedimentos_previstos',
    'protocolos','protocolo_procedimentos','protocolo_exames_recomendados',
    'consultas_iniciais','exames_solicitados','planos_tratamento','agendamentos',
    'sessoes','procedimentos_realizados','procedimento_realizado_materiais',
    'movimentacoes_estoque','documentos','exames','indicadores',
    'gravacoes_ia','resumo_ia_itens','timeline_eventos','tarefas',
    'perfil_inteligente_paciente','perfil_inteligente_itens'
  ])
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Grupo A: CRUD livre para authenticated — catálogo/organizacional, sem risco de integridade
do $$
declare t text;
begin
  for t in select unnest(array[
    'materiais','procedimentos','procedimento_materiais','tags','procedimento_tags',
    'paciente_tags','paciente_procedimentos_previstos','protocolos',
    'protocolo_procedimentos','protocolo_exames_recomendados','agendamentos',
    'exames_solicitados','tarefas'
  ])
  loop
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('create policy %I on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t||'_all', t);
  end loop;
end $$;

-- Grupo B: leitura livre + escrita restrita
do $$
declare t text;
begin
  for t in select unnest(array['pacientes','documentos','estoque','exames','indicadores'])
  loop
    execute format('grant select on %I to authenticated', t);
    execute format('create policy %I on %I for select using (auth.role() = ''authenticated'')', t||'_select', t);
  end loop;
end $$;

grant insert on pacientes to authenticated;
create policy pacientes_insert on pacientes for insert with check (auth.role() = 'authenticated');
-- só colunas cadastrais + resumo_clinico editáveis direto — o Dr pode escrever a
-- observação manualmente quando não usar áudio/IA (resumo_clinico não fica mais
-- travado só para confirmar_resumo_ia). medicamentos_uso/doencas_historico/
-- destaques_clinicos continuam só via confirmar_resumo_ia quando o áudio é usado.
grant update (nome, telefone, data_nascimento, cpf, resumo_clinico) on pacientes to authenticated;
create policy pacientes_update on pacientes for update using (auth.role() = 'authenticated');

grant insert on documentos to authenticated;
create policy documentos_insert on documentos for insert with check (auth.role() = 'authenticated');
-- sem update/delete direto: remover_foto() e remover_documento() são os únicos caminhos

grant update (quantidade_minima) on estoque to authenticated;
create policy estoque_update on estoque for update using (auth.role() = 'authenticated');
-- quantidade_atual só muda via concluir_sessao()/entrada_estoque()

grant insert, update on exames to authenticated;
create policy exames_insert on exames for insert with check (auth.role() = 'authenticated');
create policy exames_update on exames for update using (auth.role() = 'authenticated');

grant insert, update on indicadores to authenticated;
create policy indicadores_insert on indicadores for insert with check (auth.role() = 'authenticated');
create policy indicadores_update on indicadores for update using (auth.role() = 'authenticated');

-- Grupo C: só select — escrita 100% via função security definer
do $$
declare t text;
begin
  for t in select unnest(array[
    'sessoes','procedimentos_realizados','procedimento_realizado_materiais',
    'movimentacoes_estoque','timeline_eventos','planos_tratamento',
    'consultas_iniciais','gravacoes_ia','resumo_ia_itens',
    'perfil_inteligente_paciente','perfil_inteligente_itens'
  ])
  loop
    execute format('grant select on %I to authenticated', t);
    execute format('create policy %I on %I for select using (auth.role() = ''authenticated'')', t||'_select', t);
  end loop;
end $$;

-- ---------------------------------------------------------
-- 9. STORAGE
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('documentos-paciente', 'documentos-paciente', false),
  ('gravacoes-ia', 'gravacoes-ia', false)
on conflict (id) do nothing;

create policy "acesso autenticado documentos" on storage.objects for all
  using (bucket_id = 'documentos-paciente' and auth.role() = 'authenticated')
  with check (bucket_id = 'documentos-paciente' and auth.role() = 'authenticated');

create policy "acesso autenticado gravacoes" on storage.objects for all
  using (bucket_id = 'gravacoes-ia' and auth.role() = 'authenticated')
  with check (bucket_id = 'gravacoes-ia' and auth.role() = 'authenticated');
