# ClinicOS

**Sistema de gestão clínica com prontuário assistido por IA.** Ele cobre agenda, pacientes, planos de tratamento, estoque e timeline clínica. Um módulo de transcrição transforma o áudio da consulta em anamnese estruturada.

Desenvolvido para uso real em uma clínica de tricologia (saúde capilar). Os requisitos vieram direto da rotina de atendimento e foram implementados de forma incremental, em 40+ migrations versionadas.

> Este repositório é uma versão pública para portfólio. Dados, credenciais e identidade visual do cliente foram removidos.

---

## Destaques

- **Prontuário com IA:** o áudio da consulta é transcrito e resumido pelo Google Gemini em Edge Functions (Deno/TypeScript). A saída segue um formato estruturado de anamnese, com status de processamento e reprocessamento em caso de erro.
- **Segurança no banco:**
  - Row Level Security em todas as tabelas.
  - `REVOKE` de execução pública em funções e um *event trigger* que fecha o acesso a funções novas automaticamente.
  - Correções de auditoria documentadas nas migrations.
- **Regras de negócio no Postgres:** triggers e funções para baixa automática de estoque, timeline do paciente, finalização de planos por contagem de sessões, *soft delete* de agendamentos e registros retroativos.
- **Frontend responsivo:**
  - Agenda com visões de dia, semana, mês e lista, com *drag & resize*.
  - Modo Atendimento.
  - Perfil do paciente com gráficos de evolução de exames.
  - Navegação mobile dedicada.
- **Estoque com rastreabilidade:** movimentações, extrato, estoque crítico e preço unitário.

## Stack

| Camada | Tecnologias |
|---|---|
| Frontend (`apps/web`) | React 18, Vite, Tailwind CSS, shadcn/ui (Radix), TanStack Query, React Router, Recharts |
| Backend | Supabase: PostgreSQL, Auth, Storage, Row Level Security, Edge Functions (Deno + TypeScript) |
| IA | Google Gemini (`@google/genai`): transcrição de áudio e geração de resumos clínicos |
| Portal de transcrição (`apps/transcricao`) | React 19 + TypeScript, Vite, Tailwind v4, Express + Multer |
| Deploy | Vercel (frontends), Supabase (banco e funções) |

## Arquitetura

```
┌───────────────────────┐        ┌──────────────────────────────────────┐
│  apps/web (React)     │──SDK──▶│  Supabase                            │
│  Agenda · Pacientes   │        │  ├─ Postgres + RLS + triggers        │
│  Estoque · Atendimento│        │  ├─ Storage (áudios, fotos, exames)  │
└──────────┬────────────┘        │  └─ Edge Functions ──▶ Gemini API    │
           │ link                └──────────────────────────────────────┘
┌──────────▼────────────┐
│ apps/transcricao      │──▶ Express /api/process-audio ──▶ Gemini API
│ Gravação/upload áudio │     (retorna anamnese pronta para colar no prontuário)
└───────────────────────┘
```

Detalhes de schema, endpoints, eventos de domínio e plano de migração v1 → v2 estão em [`docs/arquitetura.md`](docs/arquitetura.md).

## Estrutura

```
apps/
  web/            # Sistema principal (SPA React)
  transcricao/    # Portal de transcrição de consultas com IA
supabase/
  migrations/     # 43 migrations SQL: schema, RLS, triggers, grants
  functions/      # processar_gravacao_ia, gerar_resumo_completo_paciente
docs/
  arquitetura.md
```

## Como rodar

**Pré-requisitos:** Node 20+, conta Supabase e chave da API Gemini.

```bash
# 1. Banco
supabase link --project-ref <seu-projeto>
supabase db push
supabase secrets set GEMINI_API_KEY=<sua-chave>
supabase functions deploy processar_gravacao_ia
supabase functions deploy gerar_resumo_completo_paciente

# 2. Sistema principal
cd apps/web
cp .env.example .env.local   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install && npm run dev

# 3. Portal de transcrição
cd ../transcricao
cp .env.example .env         # preencha GEMINI_API_KEY
npm install && npm run dev   # http://localhost:3000
```

## Módulos

- **Dashboard:** agenda do dia, retornos em atraso, aniversariantes e estoque crítico.
- **Agenda:** criação, edição e arraste de agendamentos, com *soft delete* para que nada desapareça sem rastro.
- **Pacientes:** cadastro com validação de CPF, foto de perfil, tags, planos de tratamento, investimentos com notas fiscais e documentos.
- **Modo Atendimento:** sessão guiada, fotos, materiais usados (com baixa de estoque) e gravação para a IA.
- **Tratamentos e Protocolos:** procedimentos, materiais padrão e exames recomendados.
- **Estoque:** entradas, saídas, extrato e alertas de mínimo.

---

Desenvolvido por **Bryan Coelho**, estudante de Engenharia de Software · [LinkedIn](https://www.linkedin.com/in/bryan-coelho-130466305)
