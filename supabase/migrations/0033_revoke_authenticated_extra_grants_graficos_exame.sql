-- Achado na revisão final da branch (2026-08-04): authenticated ainda tinha
-- os privilégios default do Postgres (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN)
-- em graficos_exame e graficos_exame_pontos — a migration 0032 revogou os
-- grants de anon/public nessas tabelas, mas não tocou nos extras de
-- authenticated. As outras 29 tabelas do schema já tinham só
-- SELECT/INSERT/UPDATE/DELETE pra authenticated; essas duas ficaram
-- inconsistentes. TRUNCATE em particular ignora as checagens de RLS. Sem
-- exposição real (RLS já restringe acesso, e authenticated já tem DELETE
-- irrestrito nessas tabelas de qualquer forma), mas fecha a defesa em
-- profundidade pro mesmo padrão do resto do schema.
revoke truncate, references, trigger, maintain on graficos_exame from authenticated;
revoke truncate, references, trigger, maintain on graficos_exame_pontos from authenticated;
