-- Requisito do cliente (2026-08-01): foto de perfil opcional do paciente.
-- Nullable de propósito — quem não usar não é afetado em nada. Reaproveita
-- o bucket privado já existente `documentos-paciente` (sem bucket novo,
-- sem grant/RLS novo — a RLS de `pacientes` já cobre UPDATE da tabela
-- inteira, incluindo essa coluna nova).
alter table public.pacientes add column foto_perfil_path text;
