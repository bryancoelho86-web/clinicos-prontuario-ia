-- Achado pelo linter de segurança do Supabase (get_advisors) logo após criar
-- a 0014: a função do event trigger não tinha search_path fixo
-- (function_search_path_mutable). Baixo risco na prática (só usa
-- object_identity, que já vem schema-qualificado de
-- pg_event_trigger_ddl_commands()), mas não custa nada seguir a mesma
-- disciplina que o resto do projeto já usa em toda função search_path-sensível.
alter function public.__revoke_public_anon_em_novas_funcoes() set search_path = pg_catalog, public;
