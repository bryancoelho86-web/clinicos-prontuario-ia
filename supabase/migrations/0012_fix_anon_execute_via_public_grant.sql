-- Achado ao revisar a Task 1 do plano de IA (Gemini): revoke execute ... from
-- anon não é suficiente para bloquear anon quando a função também recebe
-- EXECUTE via o pseudo-role PUBLIC (concedido automaticamente pelo Postgres
-- na criação de toda função, a menos que privilégios padrão digam o
-- contrário). A migration 0003 revogou isso das 17 funções de negócio que
-- existiam na época, mas não alterou o privilégio padrão do schema — então
-- toda função criada depois (0009: adicionar_observacao_timeline,
-- editar_descricao_timeline; 0011: registrar_audio_gravacao_ia) reabriu a
-- mesma brecha sem ninguém perceber. Confirmado ao vivo antes desta
-- migration: has_function_privilege('anon', 'adicionar_observacao_timeline(uuid,text,text)', 'EXECUTE')
-- retornava true (deveria ser false) — anon conseguia chamar essas funções
-- security definer via REST sem autenticação.

revoke all on function adicionar_observacao_timeline(uuid, text, text) from public;
revoke all on function editar_descricao_timeline(uuid, text) from public;
revoke all on function registrar_audio_gravacao_ia(uuid, text) from public;

grant execute on function adicionar_observacao_timeline(uuid, text, text) to authenticated;
grant execute on function editar_descricao_timeline(uuid, text) to authenticated;
grant execute on function registrar_audio_gravacao_ia(uuid, text) to authenticated;

-- Fecha a causa raiz pra qualquer função futura: sem isso, toda nova função
-- criada em migrations futuras reabriria a mesma brecha de novo.
alter default privileges in schema public revoke execute on functions from public;
