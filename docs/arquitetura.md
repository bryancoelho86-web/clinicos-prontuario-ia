# ClinicOS — Arquitetura V2 (Schema, API, Eventos, Migração)

Documento único cobrindo: (1) DDL Postgres/Supabase v2, (2) endpoints de API,
(3) eventos de domínio e transações críticas, (4) plano de migração v1 → v2.

Premissas de domínio já validadas nas etapas anteriores:
- `Protocolo` e `Procedimento` são separados; materiais pertencem ao **Procedimento**, não variam por Protocolo.
- "Avulso" = `plano_tratamento` sem `protocolo_id` (procedimentos soltos). "Pacote/Premium" = `plano_tratamento` com `protocolo_id`.
- `Profissional` unifica o que era `medicos` + `perfis`.
- `Timeline` é uma projeção de leitura alimentada por eventos, não uma entidade com regra própria — mas ganha FKs tipadas nesta v2 (uma por tipo de origem, no máximo uma preenchida), em vez de uma referência solta.
- `Foto` deixa de ser tabela própria e vira um `documento` do tipo `foto` — unifica a "biblioteca de documentos" pedida (fotos, exames, termos, contratos) numa única fonte de verdade para arquivos.
- Sem arquivamento/limpeza automática de `movimentacoes_estoque` — mantido como tabela única, particionável no futuro se o volume justificar (ver nota na seção 4).
- Sem coluna `clinica_id` (multi-tenant fica para uma fase futura, por decisão já tomada), mas os nomes/constraints evitam acoplamentos que dificultariam essa migração depois.

---

## 1. Schema SQL v2 (Postgres / Supabase)

```sql
create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- =========================================================
-- 1.1 IDENTIDADE — Profissional (unifica login + agenda)
-- =========================================================
create type papel_profissional as enum ('medico', 'secretaria', 'admin');
create type tema_ui as enum ('claro', 'escuro');

create table profissionais (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) on delete set null, -- nulo até o profissional ter login
  nome text not null,
  especialidade text,
  papel papel_profissional not null default 'medico',
  cor_agenda text not null default '#1A4633',
  tema_preferido tema_ui not null default 'claro',
  google_calendar_sync boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index uq_profissionais_usuario on profissionais (usuario_id) where usuario_id is not null;

-- =========================================================
-- 1.2 PACIENTE
-- =========================================================
create table pacientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text not null,
  data_nascimento date,
  telefone text,
  alergias text[] not null default '{}',
  medicamentos_uso text[] not null default '{}',
  doencas_historico text[] not null default '{}',
  resumo_clinico text,           -- resumo vivo, atualizado após confirmação de IA
  destaques_clinicos text[] not null default '{}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz
);
-- unicidade de CPF só entre registros ativos (corrige o v1)
create unique index uq_pacientes_cpf_ativo on pacientes (cpf) where deletado_em is null;

create table classificacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,     -- Premium / Avulso / Aplicação de Vitaminas — tag de relacionamento, não de cobrança
  cor_dot text not null,
  cor_texto text not null,
  cor_fundo text not null
);

create table paciente_classificacoes (
  paciente_id uuid not null references pacientes(id) on delete cascade,
  classificacao_id uuid not null references classificacoes(id) on delete restrict,
  primary key (paciente_id, classificacao_id)
);

-- =========================================================
-- 1.3 CATÁLOGO — Material, Procedimento, Protocolo
-- =========================================================
create table materiais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade_medida text not null default 'un',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Estoque é 1:1 com material — separa "o que é" de "quanto tem"
create table estoque (
  material_id uuid primary key references materiais(id) on delete restrict,
  quantidade_atual numeric(10,2) not null default 0,
  quantidade_minima numeric(10,2) not null default 0,
  atualizado_em timestamptz not null default now()
);

create table procedimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  duracao_padrao_minutos int not null default 30,
  preco_avulso numeric(10,2), -- preço quando executado fora de um protocolo
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table procedimento_materiais (
  procedimento_id uuid not null references procedimentos(id) on delete cascade,
  material_id uuid not null references materiais(id) on delete restrict,
  quantidade numeric(10,2) not null default 1,
  primary key (procedimento_id, material_id)
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
  frequencia_dias int, -- ex: refazer a cada 90 dias; nulo = uma vez só
  primary key (protocolo_id, nome_exame)
);

-- =========================================================
-- 1.4 PLANO DE TRATAMENTO (instância — paciente + protocolo, ou paciente avulso)
-- =========================================================
create type status_plano as enum ('ativo', 'finalizado', 'cancelado');

create table planos_tratamento (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete restrict,
  protocolo_id uuid references protocolos(id) on delete restrict, -- NULL = avulso
  profissional_responsavel_id uuid references profissionais(id),
  sessoes_contratadas int,      -- nulo quando avulso sem número fixo definido
  sessoes_realizadas int not null default 0,
  status status_plano not null default 'ativo',
  preco_contratado numeric(10,2), -- snapshot do preço no momento da contratação (nunca "herda" reajuste futuro)
  data_inicio date not null default current_date,
  data_fim date,
  criado_em timestamptz not null default now(),
  deletado_em timestamptz,
  constraint chk_sessoes_nao_excedem check (sessoes_contratadas is null or sessoes_realizadas <= sessoes_contratadas)
);
create index idx_planos_paciente on planos_tratamento (paciente_id) where deletado_em is null;

-- =========================================================
-- 1.5 AGENDA
-- =========================================================
create type status_agendamento as enum ('pendente', 'confirmado', 'realizado', 'cancelado', 'faltou');

create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete restrict,
  procedimento_id uuid references procedimentos(id) on delete restrict,   -- quando avulso
  plano_tratamento_id uuid references planos_tratamento(id) on delete restrict, -- quando dentro de um protocolo
  profissional_id uuid not null references profissionais(id) on delete restrict,
  inicio timestamptz not null,
  fim timestamptz not null,
  status status_agendamento not null default 'pendente',
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint chk_agendamento_tem_origem check (procedimento_id is not null or plano_tratamento_id is not null),
  constraint chk_fim_apos_inicio check (fim > inicio)
);
create index idx_agendamentos_profissional_inicio on agendamentos (profissional_id, inicio);
create index idx_agendamentos_paciente on agendamentos (paciente_id);

-- impede dois agendamentos do mesmo profissional em horários sobrepostos (usa timestamptz — sem risco de TZ)
alter table agendamentos add constraint sem_conflito_horario
  exclude using gist (profissional_id with =, tstzrange(inicio, fim) with &&)
  where (status not in ('cancelado'));

-- =========================================================
-- 1.6 SESSÃO + PROCEDIMENTO REALIZADO
-- =========================================================
create table sessoes (
  id uuid primary key default gen_random_uuid(),
  plano_tratamento_id uuid not null references planos_tratamento(id) on delete restrict,
  agendamento_id uuid references agendamentos(id) on delete set null,
  numero_sessao int not null,
  data timestamptz not null default now(),
  observacoes text,
  observacao_final text,
  profissional_id uuid not null references profissionais(id),
  criado_em timestamptz not null default now(),
  deletado_em timestamptz,
  unique (plano_tratamento_id, numero_sessao)
);
create index idx_sessoes_plano on sessoes (plano_tratamento_id) where deletado_em is null;

create table procedimentos_realizados (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references sessoes(id) on delete cascade,
  procedimento_id uuid not null references procedimentos(id) on delete restrict,
  materiais_conforme_padrao boolean not null default true,
  criado_em timestamptz not null default now()
);

create type origem_material as enum ('padrao', 'extra');

create table procedimento_realizado_materiais (
  id uuid primary key default gen_random_uuid(),
  procedimento_realizado_id uuid not null references procedimentos_realizados(id) on delete cascade,
  material_id uuid not null references materiais(id) on delete restrict,
  quantidade numeric(10,2) not null,
  origem origem_material not null default 'padrao'
);

-- =========================================================
-- 1.7 MOVIMENTAÇÃO DE ESTOQUE (ledger único — sem tabela histórica separada)
-- =========================================================
create type tipo_movimentacao as enum ('entrada', 'saida', 'ajuste');

create table movimentacoes_estoque (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materiais(id) on delete restrict,
  tipo tipo_movimentacao not null,
  quantidade numeric(10,2) not null,
  motivo text not null,
  sessao_id uuid references sessoes(id) on delete set null,
  procedimento_realizado_id uuid references procedimentos_realizados(id) on delete set null,
  profissional_id uuid references profissionais(id),
  criado_em timestamptz not null default now()
) partition by range (criado_em); -- pronto para particionamento futuro sem mudar nenhuma query

-- partição inicial "aberta" (ajustar/rotacionar via job mensal se o volume um dia justificar)
create table movimentacoes_estoque_default partition of movimentacoes_estoque default;
create index idx_movimentacoes_material_data on movimentacoes_estoque (material_id, criado_em desc);

-- =========================================================
-- 1.8 BIBLIOTECA DE DOCUMENTOS DO PACIENTE (unifica fotos, exames, termos, contratos)
-- =========================================================
create type tipo_documento as enum ('foto', 'exame', 'termo_consentimento', 'contrato', 'outro');

create table documentos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete restrict,
  sessao_id uuid references sessoes(id) on delete set null, -- preenchido quando é foto de procedimento
  tipo tipo_documento not null,
  storage_path text not null,
  nome_arquivo text,
  criado_em timestamptz not null default now(),
  deletado_em timestamptz
);
create index idx_documentos_paciente on documentos (paciente_id, tipo);

create table exames (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos(id) on delete restrict,
  paciente_id uuid not null references pacientes(id) on delete restrict,
  nome_exame text not null,
  data_exame date not null,
  observacoes_medicas text,
  criado_em timestamptz not null default now(),
  deletado_em timestamptz
);

create table indicadores (
  id uuid primary key default gen_random_uuid(),
  exame_id uuid not null references exames(id) on delete cascade,
  paciente_id uuid not null references pacientes(id) on delete restrict, -- desnormalização proposital: acelera o gráfico por paciente sem join extra
  tipo text not null, -- Ferritina, Vitamina D, Hemoglobina, TSH, Zinco, B12...
  valor numeric(10,2) not null,
  unidade text,
  criado_em timestamptz not null default now()
);
create index idx_indicadores_paciente_tipo on indicadores (paciente_id, tipo, criado_em);

-- =========================================================
-- 1.9 IA — GRAVAÇÃO DA CONSULTA INICIAL
-- =========================================================
create type status_gravacao as enum ('gravando', 'processando', 'concluido', 'descartado');
create type categoria_item_ia as enum ('medicamento', 'alergia', 'doenca', 'queixa', 'fator_risco', 'recomendacao');

create table gravacoes_ia (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete restrict,
  documento_id uuid references documentos(id) on delete set null, -- áudio bruto, se guardado
  duracao_segundos int,
  status status_gravacao not null default 'gravando',
  transcricao text,
  resumo_clinico text,
  confirmado_por_profissional_id uuid references profissionais(id),
  confirmado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index idx_gravacoes_paciente on gravacoes_ia (paciente_id);

-- itens extraídos pela IA, normalizados (em vez de um jsonb solto)
create table resumo_ia_itens (
  id uuid primary key default gen_random_uuid(),
  gravacao_id uuid not null references gravacoes_ia(id) on delete cascade,
  categoria categoria_item_ia not null,
  texto text not null
);
create index idx_resumo_ia_itens_gravacao on resumo_ia_itens (gravacao_id, categoria);

-- =========================================================
-- 1.10 TIMELINE — projeção de leitura, com FKs tipadas (não mais uuid solto)
-- =========================================================
create type tipo_evento_timeline as enum (
  'consulta_inicial', 'sessao', 'exame', 'documento',
  'tratamento_iniciado', 'tratamento_finalizado', 'observacao_livre'
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
  editavel boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint chk_uma_referencia check (
    num_nonnulls(sessao_id, plano_tratamento_id, exame_id, gravacao_id) <= 1
  )
);
create index idx_timeline_paciente_data on timeline_eventos (paciente_id, data desc);

-- =========================================================
-- 1.11 VIEWS DE DASHBOARD (Dashboard nunca guarda dado próprio — é 100% derivado)
-- =========================================================
create or replace view v_pacientes_retorno_atrasado as
select
  pl.paciente_id, p.nome,
  pl.id as plano_tratamento_id,
  coalesce(max(s.data)::date, pl.data_inicio) as referencia,
  (current_date - coalesce(max(s.data)::date, pl.data_inicio)) as dias_sem_retorno
from planos_tratamento pl
join pacientes p on p.id = pl.paciente_id and p.deletado_em is null
left join sessoes s on s.plano_tratamento_id = pl.id and s.deletado_em is null
where pl.status = 'ativo' and pl.deletado_em is null
group by pl.paciente_id, p.nome, pl.id, pl.data_inicio
having (current_date - coalesce(max(s.data)::date, pl.data_inicio)) >= 15;

create or replace view v_estoque_critico as
select m.id as material_id, m.nome, e.quantidade_atual, e.quantidade_minima
from materiais m join estoque e on e.material_id = m.id
where e.quantidade_atual <= e.quantidade_minima and m.ativo;

create or replace view v_agenda_do_dia as
select a.* from agendamentos a where a.inicio::date = current_date and a.status <> 'cancelado';
```

---

## 2. Endpoints de API

Como o backend é Supabase, a maior parte do CRUD já existe automaticamente via
**PostgREST** (ex: `GET /rest/v1/pacientes?select=*&cpf=eq.12345678900`), protegido
por RLS. A lista abaixo documenta o *contrato* que o frontend deve usar — nas
colunas "Implementação" eu marco o que é PostgREST direto vs. o que precisa
virar uma função Postgres exposta como RPC (`/rest/v1/rpc/...`) porque envolve
regra de negócio/transação.

| Rota | Método | Descrição | Implementação |
|---|---|---|---|
| `/rest/v1/pacientes` | GET | Lista/busca pacientes (filtros: `nome`, `cpf`) | PostgREST |
| `/rest/v1/pacientes` | POST | Cria paciente | PostgREST (RLS valida `authenticated`) |
| `/rest/v1/pacientes?id=eq.:id` | PATCH | Atualiza dados cadastrais | PostgREST |
| `/rest/v1/rpc/arquivar_paciente` | POST | Soft delete (`deletado_em`) | RPC — nunca DELETE direto |
| `/rest/v1/agendamentos?inicio=gte...&inicio=lte...` | GET | Agenda por período/profissional | PostgREST |
| `/rest/v1/rpc/criar_agendamento` | POST | Valida conflito de horário e cria | RPC (a EXCLUDE constraint já protege, mas a função devolve erro amigável) |
| `/rest/v1/agendamentos?id=eq.:id` | PATCH | Reagendar / cancelar / marcar falta | PostgREST |
| `/rest/v1/rpc/iniciar_atendimento` | POST | Abre Modo Atendimento (retorna paciente + plano + alergias + resumo) | RPC (agrega múltiplas tabelas) |
| `/rest/v1/rpc/concluir_sessao` | POST | Fluxo transacional completo (seção 3) | RPC — **único** ponto de escrita em `sessoes` |
| `/rest/v1/rpc/iniciar_gravacao_ia` | POST | Cria `gravacoes_ia` com status `gravando` | RPC |
| `/rest/v1/rpc/processar_gravacao_ia` | POST | Chama o agente de IA (Edge Function), grava transcrição + itens sugeridos | RPC/Edge Function |
| `/rest/v1/rpc/confirmar_resumo_ia` | POST | Médico confirma → atualiza paciente + cria evento timeline | RPC |
| `/rest/v1/materiais`, `/rest/v1/estoque` | GET/PATCH | Consulta e ajuste manual de estoque | PostgREST |
| `/rest/v1/rpc/entrada_estoque` | POST | Registra entrada (compra/reposição) | RPC (mantém `estoque` e `movimentacoes_estoque` consistentes) |
| `/rest/v1/documentos` | GET/POST | Biblioteca de documentos do paciente | PostgREST (upload real via Supabase Storage, este endpoint só registra metadado) |
| `/rest/v1/exames`, `/rest/v1/indicadores` | GET/POST | Exames e gráfico de indicadores | PostgREST |
| `/rest/v1/rpc/dashboard_hoje` | GET | Agrega: agenda do dia, retornos atrasados, estoque crítico — tudo via as views da seção 1.11 | RPC (uma única chamada em vez de 4 requests) |
| `/auth/v1/token?grant_type=password` | POST | Login (JWT) — nativo do Supabase Auth | Supabase Auth |

**Webhooks (Supabase Database Webhooks):**
- `INSERT` em `sessoes` → dispara webhook para notificação (ex: WhatsApp futuro do roadmap v2, ou apenas log/analytics)
- `INSERT` em `timeline_eventos` → pode alimentar um índice de busca externo no futuro, sem acoplar o schema a isso hoje

---

## 3. Eventos de domínio e transação crítica

### Eventos de domínio (conceituais — cada um corresponde a uma função/trigger)

| Evento | Disparado por | Efeitos |
|---|---|---|
| `SessaoConcluida` | RPC `concluir_sessao` | Cria sessão + procedimentos realizados; baixa estoque; atualiza `sessoes_realizadas`/`status` do plano; cria evento na timeline; marca agendamento como `realizado` |
| `TratamentoIniciado` | Trigger `AFTER INSERT` em `planos_tratamento` | Cria evento `tratamento_iniciado` na timeline |
| `TratamentoFinalizado` | Trigger `AFTER UPDATE` em `planos_tratamento` quando `status` vira `finalizado` | Cria evento `tratamento_finalizado` na timeline |
| `ExameAnexado` | Trigger `AFTER INSERT` em `exames` | Cria evento `exame` na timeline |
| `ResumoIAConfirmado` | RPC `confirmar_resumo_ia` | Atualiza `pacientes.resumo_clinico`/`destaques_clinicos`; cria evento `consulta_inicial` na timeline |
| `EstoqueAbaixoDoMinimo` | Consultado sob demanda pela view `v_estoque_critico` (não precisa de evento — é derivado em tempo real) | Aparece no Dashboard |

### Pseudocódigo transacional — `concluir_sessao`

```sql
create or replace function concluir_sessao(
  p_plano_tratamento_id uuid,
  p_agendamento_id uuid,
  p_profissional_id uuid,
  p_observacoes text,
  p_observacao_final text,
  p_procedimentos jsonb, -- [{ "procedimento_id": uuid, "materiais_conforme_padrao": bool, "materiais_extra": [{material_id, quantidade}] }]
  p_documentos_paths jsonb -- [{ "tipo": "foto"|"exame"|..., "storage_path": text, "nome_arquivo": text }]
) returns uuid
language plpgsql
security definer -- única forma de escrever em sessoes/movimentacoes_estoque/timeline_eventos (ver GRANT/REVOKE abaixo)
as $$
declare
  v_sessao_id uuid;
  v_numero_sessao int;
  v_sessoes_contratadas int;
  v_paciente_id uuid;
  v_proc jsonb;
  v_proc_realizado_id uuid;
  v_mat jsonb;
begin
  -- BEGIN implícito: se qualquer exceção ocorrer, tudo é revertido (ROLLBACK automático)

  select paciente_id, sessoes_realizadas + 1, sessoes_contratadas
    into v_paciente_id, v_numero_sessao, v_sessoes_contratadas
  from planos_tratamento
  where id = p_plano_tratamento_id
  for update; -- trava a linha, evita duas sessões concorrentes com o mesmo número

  if v_paciente_id is null then
    raise exception 'plano_tratamento % não encontrado', p_plano_tratamento_id;
  end if;

  if v_sessoes_contratadas is not null and v_numero_sessao > v_sessoes_contratadas then
    raise exception 'sessão excede o total contratado (%/%)', v_numero_sessao, v_sessoes_contratadas;
  end if;

  insert into sessoes (plano_tratamento_id, agendamento_id, numero_sessao, observacoes, observacao_final, profissional_id)
  values (p_plano_tratamento_id, p_agendamento_id, v_numero_sessao, p_observacoes, p_observacao_final, p_profissional_id)
  returning id into v_sessao_id;

  -- percorre cada procedimento realizado na sessão
  for v_proc in select * from jsonb_array_elements(p_procedimentos)
  loop
    insert into procedimentos_realizados (sessao_id, procedimento_id, materiais_conforme_padrao)
    values (v_sessao_id, (v_proc->>'procedimento_id')::uuid, (v_proc->>'materiais_conforme_padrao')::boolean)
    returning id into v_proc_realizado_id;

    -- copia os materiais PADRÃO do procedimento e já dá baixa
    insert into procedimento_realizado_materiais (procedimento_realizado_id, material_id, quantidade, origem)
    select v_proc_realizado_id, pm.material_id, pm.quantidade, 'padrao'
    from procedimento_materiais pm
    where pm.procedimento_id = (v_proc->>'procedimento_id')::uuid;

    for v_mat in
      select pm.material_id, pm.quantidade
      from procedimento_materiais pm
      where pm.procedimento_id = (v_proc->>'procedimento_id')::uuid
    loop
      update estoque set quantidade_atual = quantidade_atual - (v_mat->>'quantidade')::numeric,
                          atualizado_em = now()
      where material_id = (v_mat->>'material_id')::uuid;

      insert into movimentacoes_estoque (material_id, tipo, quantidade, motivo, sessao_id, procedimento_realizado_id, profissional_id)
      values ((v_mat->>'material_id')::uuid, 'saida', (v_mat->>'quantidade')::numeric, 'Sessão', v_sessao_id, v_proc_realizado_id, p_profissional_id);
    end loop;

    -- materiais EXTRA informados pelo médico (quando materiais_conforme_padrao = false)
    if (v_proc->'materiais_extra') is not null then
      insert into procedimento_realizado_materiais (procedimento_realizado_id, material_id, quantidade, origem)
      select v_proc_realizado_id, (m->>'material_id')::uuid, (m->>'quantidade')::numeric, 'extra'
      from jsonb_array_elements(v_proc->'materiais_extra') m;

      for v_mat in select * from jsonb_array_elements(v_proc->'materiais_extra')
      loop
        update estoque set quantidade_atual = quantidade_atual - (v_mat->>'quantidade')::numeric, atualizado_em = now()
        where material_id = (v_mat->>'material_id')::uuid;

        insert into movimentacoes_estoque (material_id, tipo, quantidade, motivo, sessao_id, procedimento_realizado_id, profissional_id)
        values ((v_mat->>'material_id')::uuid, 'saida', (v_mat->>'quantidade')::numeric, 'Sessão (material extra)', v_sessao_id, v_proc_realizado_id, p_profissional_id);
      end loop;
    end if;
  end loop;

  -- documentos anexados na sessão (fotos, etc.)
  if p_documentos_paths is not null then
    insert into documentos (paciente_id, sessao_id, tipo, storage_path, nome_arquivo)
    select v_paciente_id, v_sessao_id, (d->>'tipo')::tipo_documento, d->>'storage_path', d->>'nome_arquivo'
    from jsonb_array_elements(p_documentos_paths) d;
  end if;

  -- progresso do plano
  update planos_tratamento
  set sessoes_realizadas = v_numero_sessao,
      status = case when v_sessoes_contratadas is not null and v_numero_sessao >= v_sessoes_contratadas
                    then 'finalizado' else status end,
      data_fim = case when v_sessoes_contratadas is not null and v_numero_sessao >= v_sessoes_contratadas
                       then current_date else data_fim end
  where id = p_plano_tratamento_id;

  -- timeline
  insert into timeline_eventos (paciente_id, tipo, titulo, descricao, data, sessao_id)
  values (v_paciente_id, 'sessao', 'Sessão ' || v_numero_sessao, p_observacao_final, now(), v_sessao_id);

  if p_agendamento_id is not null then
    update agendamentos set status = 'realizado', atualizado_em = now() where id = p_agendamento_id;
  end if;

  return v_sessao_id; -- COMMIT implícito ao final da função, se nada levantou exceção
end;
$$;

-- trava a escrita direta: só a função (security definer) escreve nessas tabelas
revoke insert, update, delete on sessoes, procedimentos_realizados,
  procedimento_realizado_materiais, movimentacoes_estoque, timeline_eventos,
  planos_tratamento, agendamentos, estoque
from authenticated;
grant execute on function concluir_sessao to authenticated;
```

---

## 4. Plano de migração v1 → v2

Assumindo que as migrations `0001_schema_inicial.sql` e `0002_funcoes_triggers_rls.sql`
já foram aplicadas (mesmo sem dado real ainda, o plano abaixo usa `ALTER TABLE`
para não perder nada que já exista em produção):

```sql
-- 4.1 Profissional unifica medicos + perfis
alter table medicos rename to profissionais;
alter table profissionais add column usuario_id uuid references auth.users(id);
alter table profissionais add column papel papel_profissional not null default 'medico';
update profissionais pr set usuario_id = pe.id, papel = pe.papel::papel_profissional
  from perfis pe where pe.nome_exibicao = pr.nome; -- ajuste manual: casar por nome é heurístico, revisar linha a linha
drop table perfis; -- só depois de confirmar que todo dado foi migrado

-- 4.2 Material + Estoque separados de estoque_itens
alter table estoque_itens rename to materiais;
alter table materiais drop column quantidade_atual, drop column quantidade_minima;
create table estoque (
  material_id uuid primary key references materiais(id),
  quantidade_atual numeric(10,2) not null default 0,
  quantidade_minima numeric(10,2) not null default 0,
  atualizado_em timestamptz not null default now()
);
insert into estoque (material_id, quantidade_atual, quantidade_minima)
  select id, quantidade_atual, quantidade_minima from materiais; -- usa os valores antes do drop (rodar em ordem/transação)

-- 4.3 Tratamentos -> separar em Procedimentos + Protocolos (requer curadoria manual)
alter table tratamentos rename to procedimentos;
alter table procedimentos add column preco_avulso numeric(10,2);
update procedimentos set preco_avulso = valor;
alter table procedimentos drop column valor, drop column categoria, drop column cor;
-- criar um Protocolo por combinação de procedimentos que hoje formava um "pacote":
-- isso NÃO dá para automatizar com segurança — precisa de uma sessão com o responsável da clínica
-- revisando quais "tratamentos" antigos eram na verdade pacotes de procedimentos.

-- 4.4 paciente_tratamentos -> planos_tratamento (+ protocolo_id, preco_contratado)
alter table paciente_tratamentos rename to planos_tratamento;
alter table planos_tratamento add column protocolo_id uuid references protocolos(id);
alter table planos_tratamento add column preco_contratado numeric(10,2);
alter table planos_tratamento rename column sessoes_total to sessoes_contratadas;

-- 4.5 Fotos + Exames -> Documentos (biblioteca única)
create table documentos ( ... ); -- DDL da seção 1.8
insert into documentos (paciente_id, sessao_id, tipo, storage_path)
  select s.paciente_id, f.sessao_id, 'foto', f.storage_path
  from fotos f join sessoes s on s.id = f.sessao_id;
insert into documentos (paciente_id, tipo, storage_path)
  select paciente_id, 'exame', storage_path from exames where storage_path is not null;
alter table exames add column documento_id uuid references documentos(id);
-- casar exames.documento_id com o documento recém-criado (via storage_path, que é único por arquivo)
update exames e set documento_id = d.id
  from documentos d where d.storage_path = e.storage_path and d.tipo = 'exame';
alter table exames drop column storage_path;
drop table fotos;

-- 4.6 CPF único só entre ativos
drop index if exists idx_pacientes_cpf;
create unique index uq_pacientes_cpf_ativo on pacientes (cpf) where deletado_em is null;

-- 4.7 Agenda: data+hora (date/time) -> timestamptz único
alter table agendamentos add column inicio timestamptz;
alter table agendamentos add column fim timestamptz;
update agendamentos set inicio = (data + hora_inicio)::timestamptz, fim = (data + hora_fim)::timestamptz;
alter table agendamentos drop column data, drop column hora_inicio, drop column hora_fim;
alter table agendamentos drop constraint sem_conflito_horario_medico;
alter table agendamentos add constraint sem_conflito_horario
  exclude using gist (profissional_id with =, tstzrange(inicio, fim) with &&) where (status not in ('cancelado'));

-- 4.8 Timeline: referencia_id solto -> FKs tipadas
alter table timeline_eventos add column sessao_id uuid references sessoes(id);
alter table timeline_eventos add column plano_tratamento_id uuid references planos_tratamento(id);
alter table timeline_eventos add column exame_id uuid references exames(id);
alter table timeline_eventos add column gravacao_id uuid references gravacoes_ia(id);
update timeline_eventos set sessao_id = referencia_id where tipo = 'sessao';
update timeline_eventos set exame_id = referencia_id where tipo = 'exame';
update timeline_eventos set plano_tratamento_id = referencia_id where tipo in ('tratamento_criado','tratamento_finalizado');
alter table timeline_eventos drop column referencia_id;
alter table timeline_eventos add constraint chk_uma_referencia
  check (num_nonnulls(sessao_id, plano_tratamento_id, exame_id, gravacao_id) <= 1);

-- 4.9 Travar escrita direta nas tabelas transacionais (movido para concluir_sessao)
revoke insert, update, delete on sessoes, movimentacoes_estoque, timeline_eventos, planos_tratamento from authenticated;
grant execute on function concluir_sessao to authenticated;
```

**Nota sobre volume/arquivamento de `movimentacoes_estoque`:** nenhuma limpeza
automática foi implementada. A tabela já nasce com `partition by range (criado_em)`
e uma partição `default` — se o volume um dia justificar (não é o caso hoje, ver
estimativa discutida anteriormente: ~20-27 mil linhas/ano numa clínica só),
basta criar partições mensais (`CREATE TABLE ... PARTITION OF ... FOR VALUES FROM ... TO ...`)
e usar `DETACH PARTITION` para mover dados antigos, sem duplicar fonte de verdade
e sem mudar nenhuma query existente.

**Sobre "não alterar o design das telas atuais":** nenhuma mudança aqui atinge
`src/pages/*` ou `src/components/*` — é só a camada de dados. A troca visível
para quem usa o app é: onde antes o frontend lia de `mockData.js`, passa a
chamar `supabase.from(...)` ou `supabase.rpc(...)` com esses nomes de tabela/função.
