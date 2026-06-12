# Módulo `definicoes`

> Definições por utilizador (#60): a mega modal do badge — Comportamento, Agentes e Módulos.

## O que faz

Guarda as opções do workspace (1 linha por utilizador; **sem linha = defaults** — o
utilizador novo não precisa de seed). A UI é a mega modal aberta pela dropdown do
badge: menu lateral à esquerda (Principais: Agentes, Módulos; grupo "Módulos ativos"
com a página de cada módulo ligado), forms à direita, gravação imediata.

## Secções e opções

- **Comportamento** — COMO o agente-autor age; a secção ACUMULA (ver memória
  `definicoes-comportamento-acumula`): hoje `metodo_destilacao` (`one-shot`
  default, decisão #38 — ¼ do custo / `agentic`), lido por `chat.postturno.ts`;
  a env `MEMVECTOR_AGENTIC_DISTILL=1` continua como **override** (evals).
  A entrar: proatividade, estilo, personalidade.
- **Agentes** — os providers/orquestradores (`agentes` jsonb): claude (default
  vivo, cli), codex, gemini, ollama — `{ativo, modo: cli|api, apiKey}`. Quem
  consome é o relay/orquestração. Keys em plaintext na BD local: encriptar
  antes de multi-tenant.
- **Módulos** (`modulos_ativos`) — toggles: `github` (disponível), `emails`,
  `google-workspace`, `campanhas` (reservados, do roadmap do brief §5 + visão
  do calendário).

## Ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `definicoes.schema.ts` | enums (`METODOS_DESTILACAO`, `MODULOS`), `DefinicoesSchema`, defaults |
| `definicoes.service.ts` | `lerDefinicoesCom` (parse tolerante — valores velhos não rebentam a modal) + `gravarDefinicoesCom` (upsert) |
| `definicoes.actions.ts` | Server Actions finas |

UI: `src/components/layout/definicoes-modal.tsx` (aberta pelo `profile-menu.tsx`).

## Modelo de dados

Tabela `definicoes` (migração `20260612200000`): `owner_id` (PK, FK auth.users),
`metodo_destilacao` (check), `modulos_ativos text[]`, `updated_at`. RLS só-dono
(definições não se partilham com grupos).
