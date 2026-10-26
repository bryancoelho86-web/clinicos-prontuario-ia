-- Auditoria de seguranca completa (2026-08-21): pacientes tinha 2 indices
-- unicos parciais idênticos em cpf (where deletado_em is null) --
-- pacientes_cpf_ativos_uidx e uq_pacientes_cpf_ativo. Confirmado que
-- nenhum dos dois sustenta uma constraint formal. Remove o duplicado mais
-- recente, mantendo uq_pacientes_cpf_ativo (segue a convencao de nome do
-- projeto, criado na migration indice_unico_cpf_pacientes_ativos).

drop index if exists public.pacientes_cpf_ativos_uidx;
