-- Requisito do cliente (2026-08-25): um extrato de estoque, tipo extrato
-- bancário, mostrando só as entradas (não as saídas), filtrável por
-- dia/semana/mês/personalizado, pra acompanhar quando e quanto entrou de
-- estoque. Junto, a entrada manual de estoque ganha um campo opcional de
-- "valor gasto", pra ele acompanhar os gastos também.
--
-- `movimentacoes_estoque` já é o ledger completo (entrada/saída/ajuste,
-- append-only, nunca teve UI que lesse ele de volta até agora) — só
-- faltava a coluna de valor. `entrada_estoque()` ganha um parâmetro novo
-- com default null (opcional, retrocompatível com qualquer chamada
-- antiga que não passe esse campo).

alter table movimentacoes_estoque add column valor_gasto numeric(10,2);

create or replace function entrada_estoque(
  p_material_id uuid,
  p_quantidade numeric,
  p_motivo text,
  p_valor_gasto numeric default null
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_quantidade <= 0 then
    raise exception 'quantidade de entrada deve ser positiva';
  end if;

  update estoque set quantidade_atual = quantidade_atual + p_quantidade, atualizado_em = now()
  where material_id = p_material_id;

  if not found then
    raise exception 'material % não encontrado no estoque', p_material_id;
  end if;

  insert into movimentacoes_estoque (material_id, tipo, quantidade, motivo, valor_gasto)
  values (p_material_id, 'entrada', p_quantidade, p_motivo, p_valor_gasto);
end;
$$;
