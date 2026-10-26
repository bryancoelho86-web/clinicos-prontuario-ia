-- Requisito do cliente (2026-08-01): exclusão permanente e irreversível de um
-- paciente, confirmada digitando o CPF dele (o identificador oficial).
-- Apaga em cascata tudo que está ligado ao paciente, na ordem certa pra
-- não esbarrar nas travas de integridade existentes (várias tabelas têm
-- ON DELETE RESTRICT em paciente_id, então precisam ser esvaziadas
-- explicitamente antes de apagar a linha de pacientes — ver o spec em
-- a especificação interna de exclusão de paciente pra a
-- análise completa de todas as foreign keys envolvidas).
--
-- Movimentações de estoque geradas por sessões do paciente NÃO são
-- apagadas (ficam no histórico, só perdem o vínculo com a sessão via
-- sessao_id = NULL) — decisão do Dr., já que o material foi realmente
-- consumido e apagar o registro deixaria a contabilidade do estoque
-- incoerente.
--
-- O banco não consegue apagar arquivo físico do Storage sozinho (mesma
-- limitação da migration 0007/remover_foto()) — a função só apaga as
-- linhas do banco e devolve os storage_path coletados ANTES de apagar,
-- pro frontend remover de verdade via Storage API.
--
-- Nenhum grant manual necessário: o event trigger da migration 0014 já
-- revoga public/anon e libera authenticated/service_role automaticamente
-- em toda função nova (confirmado: anon sem EXECUTE, authenticated com).
create or replace function public.excluir_paciente_definitivamente(
  p_paciente_id uuid,
  p_cpf_confirmacao text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_cpf_real text;
  v_storage_paths_documentos text[];
  v_storage_paths_gravacoes text[];
begin
  select cpf into v_cpf_real from pacientes where id = p_paciente_id;
  if v_cpf_real is null then
    raise exception 'Paciente não encontrado.';
  end if;
  if regexp_replace(v_cpf_real, '\D', '', 'g') <> regexp_replace(p_cpf_confirmacao, '\D', '', 'g') then
    raise exception 'CPF de confirmação não confere.';
  end if;

  select array_agg(storage_path) into v_storage_paths_documentos
    from documentos where paciente_id = p_paciente_id;

  select array_agg(g.storage_path) into v_storage_paths_gravacoes
    from gravacoes_ia g
    join consultas_iniciais ci on ci.id = g.consulta_inicial_id
    where ci.paciente_id = p_paciente_id and g.storage_path is not null;

  delete from timeline_eventos where paciente_id = p_paciente_id;
  delete from indicadores where paciente_id = p_paciente_id;
  delete from exames where paciente_id = p_paciente_id;
  delete from sessoes where plano_tratamento_id in (select id from planos_tratamento where paciente_id = p_paciente_id)
                        or agendamento_id in (select id from agendamentos where paciente_id = p_paciente_id);
  delete from agendamentos where paciente_id = p_paciente_id;
  delete from planos_tratamento where paciente_id = p_paciente_id;
  delete from consultas_iniciais where paciente_id = p_paciente_id;
  delete from documentos where paciente_id = p_paciente_id;
  delete from pacientes where id = p_paciente_id;

  return jsonb_build_object(
    'storage_paths_documentos', coalesce(to_jsonb(v_storage_paths_documentos), '[]'::jsonb),
    'storage_paths_gravacoes', coalesce(to_jsonb(v_storage_paths_gravacoes), '[]'::jsonb)
  );
end;
$$;
