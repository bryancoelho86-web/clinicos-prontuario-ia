-- Auditoria de seguranca completa (2026-08-21): as funcoes de trigger
-- trg_criar_estoque_para_material(), trg_timeline_exame() e
-- trg_timeline_tratamento() sao SECURITY DEFINER e so deveriam rodar como
-- trigger, mas tinham EXECUTE concedido a anon e authenticated -- expostas
-- como endpoints RPC publicos (/rest/v1/rpc/trg_...) chamaveis sem login.
-- Na pratica o Postgres bloqueia a execucao direta de funcoes RETURNS
-- TRIGGER fora de contexto de trigger (nao exploravel de fato), mas a
-- concessao em si era desnecessaria -- e o que o advisor de seguranca do
-- Supabase sinaliza como ma pratica. Revoga dos dois roles especificos
-- (ver 0039 para o REVOKE de PUBLIC, necessario pra fechar de verdade).

revoke execute on function public.trg_criar_estoque_para_material() from anon, authenticated;
revoke execute on function public.trg_timeline_exame() from anon, authenticated;
revoke execute on function public.trg_timeline_tratamento() from anon, authenticated;
