-- Requisito do cliente (2026-08-04): a aba "Perfil Inteligente" nunca funcionou
-- de verdade (dependia de uma Edge Function de IA nunca implementada —
-- a tela sempre mostrava só a mensagem de "ainda não implementado").
-- Substituída por gráficos nomeados, editáveis à mão, de evolução de
-- exame. Remove a infraestrutura antiga do banco (nunca usada) junto.

drop function if exists atualizar_perfil_inteligente(uuid, jsonb, text);
drop table if exists perfil_inteligente_itens;
drop table if exists perfil_inteligente_paciente;
drop type if exists categoria_perfil_inteligente;

create table graficos_exame (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now()
);
create index idx_graficos_exame_paciente on graficos_exame (paciente_id);

create table graficos_exame_pontos (
  id uuid primary key default gen_random_uuid(),
  grafico_id uuid not null references graficos_exame(id) on delete cascade,
  data date not null,
  valor numeric not null,
  observacao text,
  criado_em timestamptz not null default now()
);
create index idx_graficos_exame_pontos_grafico on graficos_exame_pontos (grafico_id);

alter table graficos_exame enable row level security;
alter table graficos_exame_pontos enable row level security;

grant select, insert, update, delete on graficos_exame to authenticated;
grant select, insert, update, delete on graficos_exame_pontos to authenticated;

create policy graficos_exame_all on graficos_exame
  for all using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');
create policy graficos_exame_pontos_all on graficos_exame_pontos
  for all using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');
