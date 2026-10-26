-- =========================================================
-- ClinicOS — Schema FINAL v3 (mono-médico, sem tabela de profissionais)
-- Mudanças desta versão (ver relatório de progresso para detalhes):
--   - REMOVIDO: profissionais, papel_profissional, tema_ui, e toda
--     coluna profissional_id/profissional_responsavel_id/confirmado_por_profissional_id
--   - REMOVIDO: classificacoes / paciente_classificacoes (eram tags fixas de paciente)
--   - NOVO: tags + procedimento_tags (tags organizacionais de PROCEDIMENTO, m:n, sem seed)
--   - Agenda: sem profissional_id; conflito de horário é global (uma agenda só)
--   - documentos: metadados completos (titulo, mime_type, tamanho_bytes, data_documento, observacao)
--   - view de retorno atrasado corrigida: exige consulta inicial concluída + pelo
--     menos 1 sessão concluída; sem fallback para data_inicio
-- =========================================================
create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- ---------------------------------------------------------
-- PACIENTE
-- ---------------------------------------------------------
create table pacientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text not null,
  data_nascimento date,
  telefone text,
  medicamentos_uso text[] not null default '{}',
  doencas_historico text[] not null default '{}',
  resumo_clinico text,
  destaques_clinicos text[] not null default '{}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz
);
create unique index uq_pacientes_cpf_ativo on pacientes (cpf) where deletado_em is null;

-- ---------------------------------------------------------
-- CATÁLOGO: Material / Procedimento / Tags / Protocolo
-- ---------------------------------------------------------
create table materiais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade_medida text not null default 'un',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table estoque (
  material_id uuid primary key references materiais(id) on delete restrict,
  quantidade_atual numeric(10,2) not null default 0,
  quantidade_minima numeric(10,2) not null default 0,
  atualizado_em timestamptz not null default now(),
  constraint chk_quantidade_atual_nao_negativa check (quantidade_atual >= 0)
);

create table procedimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  duracao_padrao_minutos int not null default 30,
  preco_avulso numeric(10,2),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table procedimento_materiais (
  procedimento_id uuid not null references procedimentos(id) on delete cascade,
  material_id uuid not null references materiais(id) on delete restrict,
  quantidade numeric(10,2) not null default 1,
  primary key (procedimento_id, material_id),
  constraint chk_quantidade_positiva check (quantidade > 0)
);

-- Tags: organizacionais, do Procedimento — NUNCA definem preço/materiais/protocolo/cobrança.
-- Sem seed: a clínica cria as que quiser pela tela de Procedimentos.
create table tags (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text not null default '#9A9A9A',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table procedimento_tags (
  procedimento_id uuid not null references procedimentos(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (procedimento_id, tag_id)
);

-- Mesma tabela de tags, agora também aplicável ao paciente (reaproveitada, não duplicada)
create table paciente_tags (
  paciente_id uuid not null references pacientes(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (paciente_id, tag_id)
);

-- "O que esse paciente vai fazer depois da consulta inicial" — só organizacional/expectativa,
-- não gera cobrança nem baixa de estoque. O Plano de Tratamento real é que move dinheiro/material.
create table paciente_procedimentos_previstos (
  paciente_id uuid not null references pacientes(id) on delete cascade,
  procedimento_id uuid not null references procedimentos(id) on delete cascade,
  observacao text,
  criado_em timestamptz not null default now(),
  primary key (paciente_id, procedimento_id)
);

create table protocolos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  preco_pacote numeric(10,2),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table protocolo_procedimentos (
  protocolo_id uuid not null references protocolos(id) on delete cascade,
  procedimento_id uuid not null references procedimentos(id) on delete restrict,
  ordem int not null default 1,
  obrigatorio boolean not null default true,
  primary key (protocolo_id, procedimento_id)
);

create table protocolo_exames_recomendados (
  protocolo_id uuid not null references protocolos(id) on delete cascade,
  nome_exame text not null,
  frequencia_dias int,
  primary key (protocolo_id, nome_exame)
);

-- ---------------------------------------------------------
-- CONSULTA INICIAL (sem profissional_id — médico único do sistema)
-- ---------------------------------------------------------
create type status_consulta as enum ('em_andamento', 'concluida', 'cancelada');

create table consultas_iniciais (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete restrict,
  status status_consulta not null default 'em_andamento',
  anamnese text,
  criado_em timestamptz not null default now(),
  concluida_em timestamptz
);
create unique index uq_consulta_inicial_paciente on consultas_iniciais (paciente_id) where status <> 'cancelada';

create table exames_solicitados (
  id uuid primary key default gen_random_uuid(),
  consulta_inicial_id uuid not null references consultas_iniciais(id) on delete cascade,
  nome_exame text not null,
  solicitado_em timestamptz not null default now(),
  atendido boolean not null default false
);

-- ---------------------------------------------------------
-- PLANO DE TRATAMENTO
-- ---------------------------------------------------------
create type status_plano as enum ('ativo', 'finalizado', 'cancelado');

-- Premium / Por Sessão / Homecare deixaram de ser um enum aqui — são tags
-- do paciente (paciente_tags), sem nenhum comportamento especial no banco.
-- Múltiplos planos_tratamento 'ativo' simultâneos são permitidos de propósito
-- (ex: pacote fechado rodando + procedimento avulso em paralelo).
create table planos_tratamento (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete restrict,
  protocolo_id uuid references protocolos(id) on delete restrict,
  origem_consulta_inicial_id uuid references consultas_iniciais(id) on delete set null,
  sessoes_contratadas int,
  sessoes_realizadas int not null default 0,
  status status_plano not null default 'ativo',
  preco_contratado numeric(10,2),
  data_inicio date not null default current_date,
  data_fim date,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  deletado_em timestamptz,
  constraint chk_sessoes_nao_excedem check (sessoes_contratadas is null or sessoes_realizadas <= sessoes_contratadas)
);
create index idx_planos_paciente on planos_tratamento (paciente_id) where deletado_em is null;

-- ---------------------------------------------------------
-- AGENDA (única — sem seleção de profissional)
-- ---------------------------------------------------------
create type status_agendamento as enum ('pendente', 'confirmado', 'realizado', 'cancelado', 'faltou');

create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete restrict,
  procedimento_id uuid references procedimentos(id) on delete restrict,
  plano_tratamento_id uuid references planos_tratamento(id) on delete restrict,
  inicio timestamptz not null,
  fim timestamptz not null,
  status status_agendamento not null default 'pendente',
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint chk_agendamento_tem_origem check (procedimento_id is not null or plano_tratamento_id is not null),
  constraint chk_fim_apos_inicio check (fim > inicio)
);
create index idx_agendamentos_inicio on agendamentos (inicio);
create index idx_agendamentos_paciente on agendamentos (paciente_id);
-- conflito de horário global: só existe uma agenda, então não há partição por profissional
alter table agendamentos add constraint sem_conflito_horario
  exclude using gist (tstzrange(inicio, fim) with &&)
  where (status not in ('cancelado'));

-- ---------------------------------------------------------
-- SESSÃO
-- ---------------------------------------------------------
create type status_sessao as enum ('em_andamento', 'concluida', 'cancelada');

create table sessoes (
  id uuid primary key default gen_random_uuid(),
  plano_tratamento_id uuid not null references planos_tratamento(id) on delete restrict,
  agendamento_id uuid references agendamentos(id) on delete restrict, -- agendamento que já virou sessão real não pode ser apagado fisicamente
  numero_sessao int not null,
  status status_sessao not null default 'em_andamento',
  data timestamptz not null default now(),
  observacoes text,
  observacao_final text,
  rascunho jsonb, -- scratch de UI durante o atendimento; zerado na finalização
  criado_em timestamptz not null default now(),
  concluida_em timestamptz,
  deletado_em timestamptz
);
create index idx_sessoes_plano on sessoes (plano_tratamento_id) where deletado_em is null;
create index idx_sessoes_em_andamento on sessoes (status) where status = 'em_andamento';
create unique index uq_sessoes_plano_numero on sessoes (plano_tratamento_id, numero_sessao) where status <> 'cancelada';

create table procedimentos_realizados (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references sessoes(id) on delete cascade,
  procedimento_id uuid not null references procedimentos(id) on delete restrict,
  materiais_conforme_padrao boolean not null default true,
  criado_em timestamptz not null default now()
);
create index idx_procedimentos_realizados_sessao on procedimentos_realizados (sessao_id);

create type origem_material as enum ('padrao', 'extra');

create table procedimento_realizado_materiais (
  id uuid primary key default gen_random_uuid(),
  procedimento_realizado_id uuid not null references procedimentos_realizados(id) on delete cascade,
  material_id uuid not null references materiais(id) on delete restrict,
  quantidade numeric(10,2) not null,
  origem origem_material not null default 'padrao',
  constraint chk_quantidade_positiva check (quantidade > 0)
);
create index idx_proc_realizado_materiais_proc on procedimento_realizado_materiais (procedimento_realizado_id);
create index idx_proc_realizado_materiais_material on procedimento_realizado_materiais (material_id);

-- ---------------------------------------------------------
-- ESTOQUE (ledger único, sem particionamento)
-- ---------------------------------------------------------
create type tipo_movimentacao as enum ('entrada', 'saida', 'ajuste');

create table movimentacoes_estoque (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materiais(id) on delete restrict,
  tipo tipo_movimentacao not null,
  quantidade numeric(10,2) not null,
  motivo text not null,
  sessao_id uuid references sessoes(id) on delete set null,
  procedimento_realizado_id uuid references procedimentos_realizados(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint chk_quantidade_valida check (
    (tipo in ('entrada','saida') and quantidade > 0)
    or (tipo = 'ajuste' and quantidade <> 0)
  )
);
create index idx_movimentacoes_material_data on movimentacoes_estoque (material_id, criado_em desc);

-- ---------------------------------------------------------
-- BIBLIOTECA DE DOCUMENTOS (metadados completos)
-- ---------------------------------------------------------
create type tipo_documento as enum ('foto', 'exame', 'formulacao', 'tricoscopia', 'documento_financeiro', 'outro');

create table documentos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete restrict,
  sessao_id uuid references sessoes(id) on delete set null, -- fotos pertencem exclusivamente à sessão
  tipo tipo_documento not null,
  titulo text,
  storage_path text not null,
  nome_arquivo text not null,
  mime_type text,
  tamanho_bytes bigint,
  data_documento date,     -- data do documento em si (ex: data da nota fiscal), quando fizer sentido
  observacao text,
  criado_em timestamptz not null default now(),
  deletado_em timestamptz  -- soft delete — fotos e demais documentos nunca são apagados fisicamente pela interface
);
create index idx_documentos_paciente on documentos (paciente_id, tipo) where deletado_em is null;
create index idx_documentos_sessao on documentos (sessao_id) where deletado_em is null;

create table exames (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos(id) on delete restrict,
  paciente_id uuid not null references pacientes(id) on delete restrict,
  solicitacao_id uuid references exames_solicitados(id) on delete restrict, -- solicitação já atendida não pode ser apagada fisicamente
  nome_exame text not null,
  data_exame date not null,
  observacoes_medicas text,
  criado_em timestamptz not null default now(),
  deletado_em timestamptz
);
create index idx_exames_documento on exames (documento_id);

create table indicadores (
  id uuid primary key default gen_random_uuid(),
  exame_id uuid not null references exames(id) on delete cascade,
  paciente_id uuid not null references pacientes(id) on delete restrict, -- denormalização intencional (acelera gráfico)
  tipo text not null,
  valor numeric(10,2) not null,
  unidade text,
  criado_em timestamptz not null default now()
);
create index idx_indicadores_paciente_tipo on indicadores (paciente_id, tipo, criado_em);

-- ---------------------------------------------------------
-- IA (sem "confirmado por profissional" — só um médico usa o sistema)
-- ---------------------------------------------------------
create type status_gravacao as enum ('gravando', 'processando', 'concluido', 'descartado');
create type categoria_item_ia as enum ('medicamento', 'alergia', 'doenca', 'hipotese', 'queixa', 'fator_risco', 'recomendacao');

create table gravacoes_ia (
  id uuid primary key default gen_random_uuid(),
  consulta_inicial_id uuid not null references consultas_iniciais(id) on delete cascade,
  documento_id uuid references documentos(id) on delete set null, -- áudio bruto, se guardado
  duracao_segundos int,
  status status_gravacao not null default 'gravando',
  transcricao text,
  resumo_clinico text,
  confirmado boolean not null default false,
  confirmado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index idx_gravacoes_consulta on gravacoes_ia (consulta_inicial_id);

create table resumo_ia_itens (
  id uuid primary key default gen_random_uuid(),
  gravacao_id uuid not null references gravacoes_ia(id) on delete cascade,
  categoria categoria_item_ia not null,
  texto text not null
);
create index idx_resumo_ia_itens_gravacao on resumo_ia_itens (gravacao_id, categoria);

-- ---------------------------------------------------------
-- PERFIL INTELIGENTE DO PACIENTE
-- ---------------------------------------------------------
-- Leitura derivada, gerada por IA, NÃO é fonte de verdade — quem continua sendo
-- fonte de verdade é pacientes/sessões/exames/timeline. Regenerado por inteiro
-- (delete+insert dos itens) a cada atualização, sem histórico de versões antigas
-- (mono-médico, sem necessidade de auditoria corporativa).
create type categoria_perfil_inteligente as enum (
  'marco_tratamento', 'historico_farmacologico', 'indicador_clinico',
  'resposta_protocolo', 'pendencia', 'observacao'
);

create table perfil_inteligente_paciente (
  paciente_id uuid primary key references pacientes(id) on delete cascade,
  versao int not null default 1,
  modelo_ia text,
  gerado_em timestamptz not null default now()
);

create table perfil_inteligente_itens (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  categoria categoria_perfil_inteligente not null,
  texto text not null,
  ordem int not null default 1
);
create index idx_perfil_inteligente_itens_paciente on perfil_inteligente_itens (paciente_id, ordem);

-- ---------------------------------------------------------
-- CHECKLIST DO DASHBOARD (bloco de notas/tarefas compartilhado)
-- ---------------------------------------------------------
create table tarefas (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  concluida boolean not null default false,
  paciente_id uuid references pacientes(id) on delete set null, -- opcional: lembrete pode ou não ser sobre um paciente
  criado_em timestamptz not null default now(),
  concluida_em timestamptz
);
create index idx_tarefas_pendentes on tarefas (criado_em) where concluida = false;

-- ---------------------------------------------------------
-- TIMELINE (CHECK valida tipo <-> referência)
-- ---------------------------------------------------------
create type tipo_evento_timeline as enum (
  'consulta_inicial', 'sessao', 'exame', 'documento',
  'tratamento_iniciado', 'tratamento_finalizado', 'tratamento_cancelado', 'observacao_livre'
);

create table timeline_eventos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete restrict,
  tipo tipo_evento_timeline not null,
  titulo text not null,
  descricao text,
  data timestamptz not null default now(),
  sessao_id uuid references sessoes(id) on delete cascade,
  plano_tratamento_id uuid references planos_tratamento(id) on delete cascade,
  exame_id uuid references exames(id) on delete cascade,
  gravacao_id uuid references gravacoes_ia(id) on delete cascade,
  consulta_inicial_id uuid references consultas_iniciais(id) on delete cascade,
  editavel boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint chk_referencia_bate_tipo check (
    (tipo = 'sessao' and sessao_id is not null and plano_tratamento_id is null and exame_id is null and gravacao_id is null and consulta_inicial_id is null)
    or (tipo = 'exame' and exame_id is not null and sessao_id is null and plano_tratamento_id is null and gravacao_id is null and consulta_inicial_id is null)
    or (tipo in ('tratamento_iniciado','tratamento_finalizado','tratamento_cancelado') and plano_tratamento_id is not null and sessao_id is null and exame_id is null and gravacao_id is null and consulta_inicial_id is null)
    or (tipo = 'consulta_inicial' and consulta_inicial_id is not null and sessao_id is null and plano_tratamento_id is null and exame_id is null and gravacao_id is null)
    or (tipo in ('documento','observacao_livre') and sessao_id is null and plano_tratamento_id is null and exame_id is null and gravacao_id is null and consulta_inicial_id is null)
  )
);
create index idx_timeline_paciente_data on timeline_eventos (paciente_id, data desc);

-- ---------------------------------------------------------
-- VIEWS
-- ---------------------------------------------------------
create or replace view v_atendimentos_em_andamento as
select s.id as sessao_id, s.plano_tratamento_id, pl.paciente_id, s.criado_em
from sessoes s join planos_tratamento pl on pl.id = s.plano_tratamento_id
where s.status = 'em_andamento' and s.deletado_em is null;

-- Regra corrigida: exige consulta inicial CONCLUÍDA e pelo menos 1 sessão CONCLUÍDA
-- (sem fallback para data_inicio — paciente sem sessão concluída nunca aparece aqui)
create or replace view v_pacientes_retorno_atrasado as
select
  pl.paciente_id, p.nome, pl.id as plano_tratamento_id,
  max(s.data)::date as ultima_sessao_concluida,
  (current_date - max(s.data)::date) as dias_sem_retorno
from planos_tratamento pl
join pacientes p on p.id = pl.paciente_id and p.deletado_em is null
join consultas_iniciais ci on ci.paciente_id = pl.paciente_id and ci.status = 'concluida'
join sessoes s on s.plano_tratamento_id = pl.id and s.status = 'concluida' and s.deletado_em is null
where pl.status = 'ativo' and pl.deletado_em is null
group by pl.paciente_id, p.nome, pl.id
having (current_date - max(s.data)::date) >= 15;

create or replace view v_estoque_critico as
select m.id as material_id, m.nome, e.quantidade_atual, e.quantidade_minima
from materiais m join estoque e on e.material_id = m.id
where e.quantidade_atual <= e.quantidade_minima and m.ativo;

create or replace view v_agenda_do_dia as
select * from agendamentos where inicio::date = current_date and status <> 'cancelado';

create or replace view v_documentos_financeiros_paciente as
select * from documentos where tipo = 'documento_financeiro' and deletado_em is null;

-- Só pacientes que já passaram da Consulta Inicial (concluída) aparecem aqui
create or replace view v_aniversariantes_mes as
select p.id as paciente_id, p.nome, p.data_nascimento
from pacientes p
join consultas_iniciais ci on ci.paciente_id = p.id and ci.status = 'concluida'
where p.deletado_em is null
  and extract(month from p.data_nascimento) = extract(month from current_date);
