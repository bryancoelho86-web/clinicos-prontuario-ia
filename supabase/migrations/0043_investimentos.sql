-- Requisito do cliente (2026-08-25): acompanhar, por paciente, um valor total de
-- investimento combinado + valor já pago (opcional por paciente — só
-- existe quando o Dr. "inicia" um), com upload de notas fiscais de
-- pagamento (data + arquivo), igual já é feito pra exames hoje. Reabre a
-- regra de domínio antes fechada de "sem financeiro operacional" (ver
-- docs/arquitetura.md) — decisão revista a pedido explícito do cliente
--
-- Segue exatamente o padrão já usado por `exames`: uma tabela de domínio
-- pequena referenciando um registro em `documentos` (que guarda o
-- arquivo em si). O enum tipo_documento já tinha 'documento_financeiro'
-- desde a migration 0001, nunca usado até hoje.

create table investimentos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete restrict,
  valor_total numeric(10,2) not null,
  valor_pago numeric(10,2) not null default 0,
  criado_em timestamptz not null default now(),
  deletado_em timestamptz
);
create index idx_investimentos_paciente on investimentos (paciente_id) where deletado_em is null;

create table notas_fiscais_investimento (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos(id) on delete restrict,
  investimento_id uuid not null references investimentos(id) on delete restrict,
  paciente_id uuid not null references pacientes(id) on delete restrict,
  data_nota date not null,
  criado_em timestamptz not null default now(),
  deletado_em timestamptz
);
create index idx_notas_fiscais_investimento_documento on notas_fiscais_investimento (documento_id);
create index idx_notas_fiscais_investimento_investimento on notas_fiscais_investimento (investimento_id) where deletado_em is null;

alter table investimentos enable row level security;
alter table notas_fiscais_investimento enable row level security;

grant select, insert, update on investimentos to authenticated;
create policy investimentos_select on investimentos for select using (auth.role() = 'authenticated');
create policy investimentos_insert on investimentos for insert with check (auth.role() = 'authenticated');
create policy investimentos_update on investimentos for update using (auth.role() = 'authenticated');

grant select, insert, update on notas_fiscais_investimento to authenticated;
create policy notas_fiscais_investimento_select on notas_fiscais_investimento for select using (auth.role() = 'authenticated');
create policy notas_fiscais_investimento_insert on notas_fiscais_investimento for insert with check (auth.role() = 'authenticated');
create policy notas_fiscais_investimento_update on notas_fiscais_investimento for update using (auth.role() = 'authenticated');

-- Mesmo padrão já usado pra 'exame' — sincroniza a tabela de domínio
-- quando o documento (arquivo) é removido da biblioteca.
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

  if v_tipo = 'exame' then
    update exames set deletado_em = now() where documento_id = p_documento_id;
  elsif v_tipo = 'documento_financeiro' then
    update notas_fiscais_investimento set deletado_em = now() where documento_id = p_documento_id;
  end if;
end;
$$;

-- excluir_paciente_definitivamente() precisa aprender as duas tabelas
-- novas (on delete restrict, mesmo problema que exames/documentos já
-- tinham) -- entram na cascata antes de documentos (notas_fiscais
-- referencia documento_id) e antes de investimentos (notas_fiscais
-- referencia investimento_id). Corpo idêntico ao da migration 0034 fora
-- essas duas linhas novas.
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
  delete from notas_fiscais_investimento where paciente_id = p_paciente_id;
  delete from investimentos where paciente_id = p_paciente_id;
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
