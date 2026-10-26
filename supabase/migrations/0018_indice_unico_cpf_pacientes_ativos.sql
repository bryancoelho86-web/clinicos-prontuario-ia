-- Requisito do cliente (2026-08-01): CPF passa a ser usado como identificador do
-- paciente, então dois pacientes não podem ter o mesmo CPF. Confirmado
-- antes de aplicar: nenhum CPF duplicado nos dados atuais.
--
-- Índice único parcial (não um CONSTRAINT UNIQUE simples) porque
-- `pacientes` tem soft delete (`deletado_em`) — um UNIQUE comum bloquearia
-- para sempre o recadastro de alguém cujo registro antigo foi só
-- soft-deletado, mesmo que o CPF esteja livre na prática. A condição
-- `WHERE deletado_em IS NULL` garante que a unicidade só vale entre
-- pacientes ativos.
create unique index pacientes_cpf_ativos_uidx
  on public.pacientes (cpf)
  where deletado_em is null;
