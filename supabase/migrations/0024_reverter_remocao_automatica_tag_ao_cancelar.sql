-- Reversão de decisão (2026-08-02): a 0023 fazia cancelar_plano_tratamento()
-- remover a tag do paciente quando o plano cancelado era o último ativo
-- daquele tipo. Descoberto na revisão final: paciente_tags não distingue
-- "tag veio de um plano" de "tag atribuída manualmente" (o modal "Novo
-- Paciente" em Pacientes.jsx deixa o Dr. atribuir qualquer tag, incluindo
-- as 5 de tipo de plano, na Classificação — sem nenhum vínculo com plano).
-- Cancelar um plano poderia apagar silenciosamente uma tag atribuída por
-- outro motivo. Decisão do Dr.: nunca remover tag automaticamente — tags
-- só acumulam (mesma regra já valia antes da 0023). tag_id na linha do
-- plano continua existindo (ainda usado pra exibir o badge do tipo do
-- plano na UI), só a exclusão de paciente_tags foi revertida.
create or replace function cancelar_plano_tratamento(p_plano_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update planos_tratamento
  set status = 'cancelado', data_fim = current_date, motivo_cancelamento = p_motivo
  where id = p_plano_id and status = 'ativo';

  if not found then
    raise exception 'plano_tratamento % não encontrado ou não está ativo', p_plano_id;
  end if;
end;
$$;
