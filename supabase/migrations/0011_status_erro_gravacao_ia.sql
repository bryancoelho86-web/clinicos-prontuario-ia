-- Correção encontrada ao planejar a troca de provedor de IA (Whisper + LLM
-- -> Gemini, ver docs/arquitetura.md):
-- gravacoes_ia não tinha nenhum jeito de persistir o storage_path do áudio
-- bruto nem um estado de erro. Sem isso, a Edge Function não tem como saber
-- qual arquivo reprocessar numa nova tentativa, e uma falha na IA deixaria
-- a gravação travada sem explicação pro médico.

alter type status_gravacao add value 'erro';

alter table gravacoes_ia
  add column erro_detalhe text,
  add column storage_path text;

-- Chamada pelo frontend logo após subir o áudio pro bucket gravacoes-ia,
-- antes de invocar a Edge Function. Só grava se a gravação ainda não foi
-- processada (mesma guarda de padrão das outras funções de IA).
create or replace function registrar_audio_gravacao_ia(
  p_gravacao_id uuid,
  p_storage_path text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update gravacoes_ia
  set storage_path = p_storage_path
  where id = p_gravacao_id and status = 'gravando';

  if not found then
    raise exception 'gravacao_ia % não encontrada ou não está no estado gravando', p_gravacao_id;
  end if;
end;
$$;

revoke execute on function registrar_audio_gravacao_ia(uuid, text) from anon;
