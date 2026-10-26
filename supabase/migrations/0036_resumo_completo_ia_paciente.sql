-- Coluna nova pra suportar o resumo clínico completo gerado por IA (spec:
-- gerar_resumo_completo_paciente, Edge Function nova) — dispara depois de
-- concluir_sessao()/concluir_consulta_inicial(), sintetiza anamnese + todas
-- as sessões concluídas num único resumo_clinico atualizado.
--
-- resumo_ia_atualizado_em: carimba quando o resumo_clinico foi (re)gerado
-- automaticamente pela IA. Nullable — fica null pra pacientes que nunca
-- tiveram um resumo gerado por IA, e é explicitamente zerado por
-- useUpdatePacienteResumo() (usePacientePerfil.js) sempre que o Dr. edita o
-- resumo_clinico manualmente pela tela — sinaliza pra UI (ResumoCard,
-- PacientePerfil.jsx) que o texto atual não é mais garantidamente o output
-- puro da IA, então o rótulo "Atualizado por IA em ..." some.
alter table public.pacientes add column resumo_ia_atualizado_em timestamptz;

-- Mesmo padrão de grant por coluna da 0001/0021 — pacientes usa UPDATE por
-- coluna pra authenticated, não table-level (só
-- nome/telefone/data_nascimento/cpf/resumo_clinico/foto_perfil_path tinham
-- UPDATE liberado até aqui). useUpdatePacienteResumo() escreve nessa coluna
-- direto do client autenticado (pra zerá-la ao salvar uma edição manual) —
-- sem este grant explícito, a mesma falha 42501 "permission denied for
-- table pacientes" já documentada na migration 0021 se repetiria.
-- gerar_resumo_completo_paciente (Edge Function) usa o service_role, que já
-- tem UPDATE irrestrito por padrão — não depende deste grant.
grant update (resumo_ia_atualizado_em) on public.pacientes to authenticated;
