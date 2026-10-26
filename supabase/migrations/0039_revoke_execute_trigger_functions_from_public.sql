-- Auditoria de seguranca completa (2026-08-21), correcao de acompanhamento
-- a 0037: a migration anterior revogou EXECUTE de anon/authenticated
-- diretamente nas 3 funcoes de trigger, mas isso nao fechou o buraco de
-- verdade -- as 3 funcoes ainda tinham EXECUTE concedido a PUBLIC (grant
-- padrao do Postgres na criacao da funcao, nunca revogado porque essas
-- funcoes sao de 2026-07-30/31, anteriores ao event trigger que fecha
-- EXECUTE de PUBLIC em funcoes novas). anon e authenticated sao membros
-- implicitos de PUBLIC no Postgres, entao herdam o EXECUTE dali mesmo com
-- o REVOKE direto na role especifica. Verificado com
-- has_function_privilege(...) antes/depois desta migration: false pros 3
-- roles (anon/authenticated/public) depois de aplicada, e reconfirmado que
-- os triggers continuam disparando normalmente (o mecanismo de trigger do
-- Postgres nao passa pelo check de EXECUTE normal).

revoke execute on function public.trg_criar_estoque_para_material() from public;
revoke execute on function public.trg_timeline_exame() from public;
revoke execute on function public.trg_timeline_tratamento() from public;
