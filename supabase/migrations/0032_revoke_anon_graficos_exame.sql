-- Achado na revisão da Task 1 (2026-08-04): anon tinha grant de tabela
-- completo (SELECT/INSERT/UPDATE/DELETE) em graficos_exame e
-- graficos_exame_pontos — o revoke original (migration 0002) só cobria
-- as tabelas que existiam naquele momento, não tabelas novas criadas
-- depois. Mesma classe de bug já encontrada e corrigida pra funções
-- (migrations 0012-0014, EXECUTE vazando via PUBLIC). RLS já bloqueava
-- acesso de verdade (policy exige auth.role() = 'authenticated'), mas
-- os grants crus continuavam existindo, quebrando a defesa em
-- profundidade que o resto do projeto mantém.
revoke all on graficos_exame from anon, public;
revoke all on graficos_exame_pontos from anon, public;
