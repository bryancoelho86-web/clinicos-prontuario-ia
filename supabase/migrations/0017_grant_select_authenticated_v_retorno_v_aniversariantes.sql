-- Mesma classe de bug da 0016, nas outras duas views criadas junto na
-- 0001_schema_final sem grant algum pra authenticated: v_pacientes_retorno_atrasado
-- (card "Retornos em atraso" do Dashboard) e v_aniversariantes_mes (que
-- ainda nem tem card no frontend — ver docs/arquitetura.md).
grant select on public.v_pacientes_retorno_atrasado to authenticated;
grant select on public.v_aniversariantes_mes to authenticated;
