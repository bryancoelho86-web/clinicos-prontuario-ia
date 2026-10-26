-- Ajuste logo depois da 0043: o "valor pago" deixa de
-- ser um campo manual solto no card de investimento — passa a ser
-- digitado junto com cada nota fiscal enviada, e o progresso de
-- pagamento vira a soma dos valores das notas fiscais (calculado no
-- client, não guardado). `valor_pago` em `investimentos` nunca chegou a
-- ser usado de verdade (achado durante o ajuste: só existia 1 linha real
-- em produção, criada em teste, valor_pago ainda em 0 — apagada via
-- remover_documento()/soft-delete direto, paciente preservado) — sai do
-- schema.
--
-- `valor` fica nullable (não NOT NULL) porque não há garantia de que
-- toda nota fiscal futura precise ter valor preenchido no banco (mesma
-- filosofia de `documentos.observacao`/`data_documento`, sempre
-- nullable) — a obrigatoriedade de preencher ao enviar é regra de
-- frontend, não constraint de banco.
alter table investimentos drop column valor_pago;
alter table notas_fiscais_investimento add column valor numeric(10,2);
