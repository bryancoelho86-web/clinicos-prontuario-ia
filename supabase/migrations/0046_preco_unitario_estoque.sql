-- Requisito da clínica: não existe campo de preço unitário no
-- cadastro de insumo, ele anotava "do lado" (fora do sistema). Nullable de
-- propósito (mesma filosofia de notas_fiscais_investimento.valor, migration
-- 0044 — obrigatoriedade de preencher é regra de frontend, não constraint de
-- banco, já que os 39 materiais ativos existentes não têm esse valor ainda e
-- não devem quebrar). Alimenta, no futuro, um cálculo de gasto mensal
-- (preco_unitario × quantidade usada nas saídas de estoque) — não implementado
-- agora, só o dado fica disponível.
alter table public.estoque add column preco_unitario numeric(10,2);

-- Mesmo padrão de grant por coluna que quantidade_minima já tinha (migration
-- 0002) — estoque é Grupo B (leitura livre, escrita restrita por coluna).
-- Sem isso, editar o preço direto do client autenticado falharia com
-- "permission denied for table estoque" (42501), mesma pegadinha já
-- documentada em 0021/0036 para pacientes.
grant update (preco_unitario) on public.estoque to authenticated;
