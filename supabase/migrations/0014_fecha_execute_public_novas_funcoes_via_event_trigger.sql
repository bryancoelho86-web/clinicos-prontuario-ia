-- Achado ao VERIFICAR ao vivo a migration 0013 (que revogou o privilégio
-- padrão de EXECUTE de 'anon' via `alter default privileges ... revoke
-- execute on functions from anon`): mesmo com 0012 (revoke ... from public)
-- e 0013 (revoke ... from anon) as duas aplicadas, uma função nova criada
-- do zero AINDA tinha has_function_privilege('anon', ..., 'EXECUTE') = true.
--
-- Causa raiz, confirmada por teste isolado e reprodutível nesta instância
-- (Postgres 17.6 gerenciado pelo Supabase): `alter default privileges ...
-- revoke execute on functions from public` NÃO FUNCIONA — é efetivamente
-- um no-op. O Postgres aplica o EXECUTE implícito pro pseudo-role PUBLIC em
-- toda função nova (comportamento embutido do CREATE FUNCTION), e esse
-- comportamento embutido NÃO é suprimível via `alter default privileges`
-- direcionado a PUBLIC — só via revoke explícito na função já criada
-- (`revoke execute on function <func> from public;`, que é exatamente o
-- padrão que a 0012 já usa nas 3 funções que existiam na época). Isso foi
-- verificado com um teste limpo (role dedicada, sem nenhuma outra
-- interferência): mesmo revogando de PUBLIC via default privileges (várias
-- formas testadas), toda função nova continuava nascendo com
-- `=X/<owner>` (PUBLIC=EXECUTE) na sua ACL.
--
-- E como qualquer role — inclusive 'anon' — automaticamente herda tudo que
-- é concedido a PUBLIC (independente de grants/revokes específicos daquele
-- role), o revoke de 'anon' feito pela 0013 (que esse sim funciona de
-- verdade, confirmado) não tem efeito prático: 'anon' continua executando
-- a função pela via de PUBLIC.
--
-- Fix real: um event trigger que roda em CREATE FUNCTION (cobre também
-- CREATE OR REPLACE FUNCTION, mesma tag de comando) e revoga EXECUTE de
-- PUBLIC e de 'anon' explicitamente em toda função recém-criada em
-- qualquer schema, fechando a lacuna pra sempre sem depender de nenhuma
-- migration futura lembrar de fazer isso manualmente. 'authenticated' e
-- 'service_role' não são tocados — continuam recebendo o privilégio padrão
-- que a plataforma Supabase já concede (via a linha própria de
-- pg_default_acl da role `postgres`), que é o comportamento correto e
-- esperado pro caso de uso deste projeto (funções de negócio pra uso
-- autenticado).
--
-- Verificado ao vivo após esta migration: uma função nova criada do zero
-- tem has_function_privilege('anon', ..., 'EXECUTE') = false,
-- has_function_privilege('public', ..., 'EXECUTE') = false, e
-- has_function_privilege('authenticated', ..., 'EXECUTE') = true,
-- has_function_privilege('service_role', ..., 'EXECUTE') = true — tanto
-- pra CREATE FUNCTION quanto pra CREATE OR REPLACE FUNCTION.
create or replace function public.__revoke_public_anon_em_novas_funcoes()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands() where object_type = 'function'
  loop
    execute format('revoke execute on function %s from public, anon', obj.object_identity);
  end loop;
end;
$$;

revoke all on function public.__revoke_public_anon_em_novas_funcoes() from public;

create event trigger revoke_public_anon_em_novas_funcoes
  on ddl_command_end
  when tag in ('CREATE FUNCTION')
  execute function public.__revoke_public_anon_em_novas_funcoes();
