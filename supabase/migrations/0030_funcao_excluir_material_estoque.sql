-- Requisito do cliente (2026-08-04): poder excluir um item de estoque de verdade
-- (não só desativar). `materiais` é referenciado com `on delete restrict`
-- por `estoque`, `procedimento_materiais`, `procedimento_realizado_materiais`
-- e `movimentacoes_estoque` — qualquer material que já teve movimentação
-- (entrada/saída/ajuste, sempre registrada) ou já foi vinculado a um
-- procedimento nunca pode ser apagado sem perder histórico. Esta função
-- checa cada vínculo explicitamente e bloqueia com uma mensagem clara em
-- vez de deixar vazar o erro cru de foreign key do Postgres.
create or replace function excluir_material_estoque(p_material_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_nome text;
begin
  select nome into v_nome from materiais where id = p_material_id;
  if v_nome is null then
    raise exception 'Material não encontrado.';
  end if;

  if exists (select 1 from procedimento_materiais where material_id = p_material_id) then
    raise exception 'Não é possível excluir "%": está vinculado a um ou mais procedimentos.', v_nome;
  end if;

  if exists (select 1 from procedimento_realizado_materiais where material_id = p_material_id) then
    raise exception 'Não é possível excluir "%": já foi usado em atendimentos realizados.', v_nome;
  end if;

  if exists (select 1 from movimentacoes_estoque where material_id = p_material_id) then
    raise exception 'Não é possível excluir "%": já tem movimentações de estoque registradas.', v_nome;
  end if;

  delete from estoque where material_id = p_material_id;
  delete from materiais where id = p_material_id;
end;
$$;
