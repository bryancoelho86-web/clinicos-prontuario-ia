-- Registro retroativo na Timeline do paciente (Consulta / Sessão) + vínculo
-- de fotos órfãs a uma sessão. Requisito da clínica:
-- pacientes já em tratamento avançado (ex: 8ª de 10 sessões) sem histórico
-- no sistema, só fotos soltas marcadas "sem sessão vinculada". Precisa de
-- um jeito de documentar manualmente, com data retroativa, tanto uma
-- "Sessão" real (conta pra progresso do plano, numeração manual escolhida
-- pelo Dr., pode receber fotos) quanto uma "Consulta"/nota livre (sem
-- numeração).
--
-- Nota: esta migration já reflete a versão final corrigida — a primeira
-- tentativa aplicada ao vivo usava p_data como `date` e fazia
-- `p_data::timestamptz` no servidor, que usa o timezone da sessão do
-- Postgres (UTC) e por isso exibia a data um dia antes em qualquer fuso
-- atrás de UTC (Manaus, UTC-4) — mesma classe de bug já documentada no
-- docs/arquitetura.md pra `data_nascimento`. Corrigido trocando p_data para
-- `timestamptz`: o frontend calcula a meia-noite LOCAL antes de mandar pro
-- banco (mesmo padrão que `adicionar_observacao_timeline` já usa desde a
-- migration 0009), o backend só usa o valor como veio.

alter table sessoes add column if not exists ativos_utilizados text[];

create or replace function registrar_sessao_retroativa(
  p_plano_tratamento_id uuid,
  p_numero_sessao int,
  p_data timestamptz,
  p_ativos_utilizados text[],
  p_observacoes text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_status status_plano;
  v_sessoes_contratadas int;
  v_tag_id uuid;
  v_paciente_id uuid;
  v_sessao_id uuid;
  v_tag_finalizado_id uuid;
  v_finalizou boolean;
  v_titulo_timeline text;
begin
  select status, sessoes_contratadas, tag_id, paciente_id
    into v_status, v_sessoes_contratadas, v_tag_id, v_paciente_id
  from planos_tratamento where id = p_plano_tratamento_id
  for update;

  if v_paciente_id is null then
    raise exception 'plano_tratamento % não encontrado', p_plano_tratamento_id;
  end if;
  if v_status = 'cancelado' then
    raise exception 'plano_tratamento % está cancelado — não é possível registrar sessão retroativa', p_plano_tratamento_id;
  end if;
  if v_sessoes_contratadas is not null and p_numero_sessao > v_sessoes_contratadas then
    raise exception 'sessão % excede o total contratado (%)', p_numero_sessao, v_sessoes_contratadas;
  end if;
  if p_numero_sessao < 1 then
    raise exception 'número da sessão deve ser maior que zero';
  end if;

  -- Checagem explícita antes do insert (mesmo padrão de iniciar_sessao()) —
  -- evita deixar vazar a violação crua do índice único uq_sessoes_plano_numero.
  if exists (
    select 1 from sessoes
    where plano_tratamento_id = p_plano_tratamento_id
      and numero_sessao = p_numero_sessao
      and status <> 'cancelada'
  ) then
    raise exception 'já existe uma sessão número % registrada para este plano', p_numero_sessao;
  end if;

  insert into sessoes (
    plano_tratamento_id, numero_sessao, status, data,
    observacoes, observacao_final, ativos_utilizados, concluida_em
  ) values (
    p_plano_tratamento_id, p_numero_sessao, 'concluida', p_data,
    p_observacoes, p_observacoes, p_ativos_utilizados, p_data
  )
  returning id into v_sessao_id;

  -- greatest() em vez de atribuição absoluta: numeração é manual, o Dr.
  -- pode preencher fora de ordem (ex: sessão 5 antes da 3).
  v_finalizou := v_status = 'ativo' and v_sessoes_contratadas is not null and p_numero_sessao >= v_sessoes_contratadas;

  update planos_tratamento
  set sessoes_realizadas = greatest(sessoes_realizadas, p_numero_sessao),
      status = case when v_finalizou then 'finalizado' else status end,
      data_fim = case when v_finalizou then p_data::date else data_fim end
  where id = p_plano_tratamento_id;

  -- Mesma lógica de troca de tag que concluir_sessao() já usa (migration 0025).
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
    v_titulo_timeline := 'Sessão ' || p_numero_sessao;
  else
    v_titulo_timeline := 'Atendimento';
  end if;

  -- data = p_data (histórica), não now() — pra timeline ordenar certo.
  insert into timeline_eventos (paciente_id, tipo, titulo, descricao, data, sessao_id)
  values (v_paciente_id, 'sessao', v_titulo_timeline, p_observacoes, p_data, v_sessao_id);

  return v_sessao_id;
end;
$$;

-- documentos não tem RLS de UPDATE pra authenticated (só INSERT/SELECT,
-- confirmado ao vivo) — vincular uma foto avulsa a uma sessão retroativa
-- precisa passar por função dedicada.
create or replace function vincular_foto_a_sessao(
  p_documento_id uuid,
  p_sessao_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_doc_paciente_id uuid;
  v_sessao_paciente_id uuid;
begin
  select paciente_id into v_doc_paciente_id
  from documentos
  where id = p_documento_id and tipo = 'foto' and deletado_em is null;

  if v_doc_paciente_id is null then
    raise exception 'documento % não encontrado ou não é uma foto', p_documento_id;
  end if;

  select pt.paciente_id into v_sessao_paciente_id
  from sessoes s
  join planos_tratamento pt on pt.id = s.plano_tratamento_id
  where s.id = p_sessao_id;

  if v_sessao_paciente_id is null then
    raise exception 'sessão % não encontrada', p_sessao_id;
  end if;

  if v_sessao_paciente_id <> v_doc_paciente_id then
    raise exception 'a foto e a sessão pertencem a pacientes diferentes';
  end if;

  update documentos set sessao_id = p_sessao_id where id = p_documento_id;
end;
$$;

-- Ganha p_data opcional (default null -> now()) pra permitir notas
-- retroativas do tipo "Consulta" — create or replace com parâmetro novo no
-- final e default é seguro, não quebra a chamada antiga do frontend.
create or replace function adicionar_observacao_timeline(
  p_paciente_id uuid,
  p_titulo text,
  p_descricao text,
  p_data timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
begin
  insert into timeline_eventos (paciente_id, tipo, titulo, descricao, data, editavel)
  values (p_paciente_id, 'observacao_livre', p_titulo, p_descricao, coalesce(p_data, now()), true)
  returning id into v_id;
  return v_id;
end;
$$;
