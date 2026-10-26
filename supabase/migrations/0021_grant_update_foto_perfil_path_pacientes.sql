-- Bugfix real encontrado testando o upload de foto de perfil (2026-08-01):
-- `pacientes` usa GRANTs de UPDATE por coluna pra authenticated (não
-- table-level) — só nome/cpf/data_nascimento/telefone/resumo_clinico
-- tinham UPDATE liberado. A coluna nova `foto_perfil_path` (migration
-- 0020) nasceu só com INSERT/SELECT (herdados do grant da tabela toda),
-- sem UPDATE — toda tentativa de salvar o path da foto falhava com
-- "permission denied for table pacientes" (42501), com o hint do próprio
-- Postgres apontando exatamente o grant que faltava.
grant update (foto_perfil_path) on public.pacientes to authenticated;
