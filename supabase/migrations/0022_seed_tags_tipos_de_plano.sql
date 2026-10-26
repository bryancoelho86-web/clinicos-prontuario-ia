-- Requisito do cliente (2026-08-01): os planos de tratamento passam a ser
-- exatamente estes 5 tipos fixos, e viram tags também — ao entrar num
-- plano, o paciente recebe a tag correspondente automaticamente (ver
-- useCriarPlanoTratamento em usePacientePerfil.js). Tabela `tags` estava
-- vazia (nenhuma UI de criar tag existe no frontend ainda), então essas
-- 5 são o cadastro inicial.
--
-- Cores escolhidas evitando o verde escuro da marca (--green-primary)
-- puro como cor de tag — o mesmo problema de contraste no modo escuro já
-- corrigido em outros lugares desta sessão (STATUS_STYLES.confirmed
-- virou #2F7D5A pelo mesmo motivo). Todas as 5 cores abaixo têm brilho
-- médio o suficiente pra funcionar como texto tanto no tema claro quanto
-- no escuro.
insert into tags (nome, cor) values
  ('Avulso', '#6B7280'),
  ('Premium', '#C9A24D'),
  ('Por Sessão', '#3B82F6'),
  ('Home Care', '#2F7D5A'),
  ('Manutenção', '#8B5CF6');
