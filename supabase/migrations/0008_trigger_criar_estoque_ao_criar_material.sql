-- Sem essa migration, não havia forma de criar a linha de `estoque` correspondente
-- quando um material novo é cadastrado: RLS de `estoque` só permite SELECT/UPDATE
-- (nunca INSERT), e entrada_estoque()/ajustar_estoque() exigem que a linha já exista.
create or replace function trg_criar_estoque_para_material()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into estoque (material_id, quantidade_atual, quantidade_minima)
  values (new.id, 0, 0)
  on conflict (material_id) do nothing;
  return new;
end;
$$;

create trigger trg_materiais_criar_estoque
after insert on materiais
for each row execute function trg_criar_estoque_para_material();
