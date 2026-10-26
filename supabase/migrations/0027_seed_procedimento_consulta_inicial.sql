-- Requisito do cliente (2026-08-03): o perfil do paciente novo e o cadastro de
-- paciente passam a oferecer agendar a Consulta Inicial direto, com o
-- tratamento já pré-selecionado. `procedimentos.nome` não tem `unique`,
-- então usa `where not exists` em vez de `on conflict` pra idempotência.
insert into procedimentos (nome, descricao, duracao_padrao_minutos, ativo)
select 'Consulta Inicial', 'Primeira consulta do paciente — anamnese, avaliação inicial.', 45, true
where not exists (select 1 from procedimentos where nome = 'Consulta Inicial');
