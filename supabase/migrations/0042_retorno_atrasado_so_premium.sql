-- Requisito do cliente (2026-08-25): o card "Retornos em atraso" do Dashboard
-- usava uma regra fixa de 15 dias pra QUALQUER plano ativo, sem
-- distinguir tipo — mas o Avulso tem um ciclo natural de retorno de 4
-- em 4 meses (bem diferente de 15 dias), então aparecia sempre
-- "atrasado" mesmo dentro do esperado. Decisão final: o card vira
-- exclusivo do plano Premium (que espera contato frequente,
-- independente de sessão), e os outros tipos saem por completo — sem
-- lembrete automático nenhum pra eles, fica a cargo do Dr. pela Agenda.
--
-- Duas mudanças de regra junto:
-- 1. Filtro por tag_id = tag "Premium" (antes: qualquer plano ativo).
-- 2. Premium sem nenhuma sessão concluída ainda também pode aparecer —
--    antes o join interno com `sessoes` exigia pelo menos 1 sessão
--    concluída; agora é left join, e a data de referência cai pra
--    `data_inicio` do plano quando não há sessão concluída ainda.
create or replace view v_pacientes_retorno_atrasado as
select
  pl.paciente_id, p.nome, pl.id as plano_tratamento_id,
  max(s.data)::date as ultima_sessao_concluida,
  (current_date - coalesce(max(s.data)::date, pl.data_inicio)) as dias_sem_retorno
from planos_tratamento pl
join pacientes p on p.id = pl.paciente_id and p.deletado_em is null
join consultas_iniciais ci on ci.paciente_id = pl.paciente_id and ci.status = 'concluida'
join tags t on t.id = pl.tag_id and t.nome = 'Premium'
left join sessoes s on s.plano_tratamento_id = pl.id and s.status = 'concluida' and s.deletado_em is null
where pl.status = 'ativo' and pl.deletado_em is null
group by pl.paciente_id, p.nome, pl.id, pl.data_inicio
having (current_date - coalesce(max(s.data)::date, pl.data_inicio)) >= 15;
