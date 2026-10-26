-- Achado testando a 0040: a tag "Finalizado" (originalmente criada na
-- 0025) não existe mais no banco — ficou de fora dos "5 tags fixas" que o
-- Dr. pediu pra manter na limpeza total de dados de teste (2026-08-21, ver
-- docs/arquitetura.md). Sem essa tag, tanto a auto-finalização por contagem de
-- sessões (concluir_sessao) quanto a nova finalização manual
-- (registrar_desfecho_plano_tratamento, 0040) já rodavam sem erro, mas
-- silenciosamente não aplicavam tag nenhuma no paciente (o código busca
-- `select id into v_tag_finalizado_id from tags where nome = 'Finalizado'`
-- e só insere se achou — sem essa tag existir, o insert nunca roda). Já
-- reinserida ao vivo via SQL direto no momento do achado; esta migration
-- só documenta/reproduz isso pra qualquer ambiente futuro.

insert into tags (nome, cor) values ('Finalizado', '#0D9488')
on conflict (nome) do nothing;
