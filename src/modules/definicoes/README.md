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
  vivo, cli), codex, gemini, ollama — `{ativo, modo: cli|api, modelo, esforco,
  apiKey}`. O **FactoryProvider** (`src/lib/providers/factory.ts`, referência:
  `~/src/agent-skills-compare`) distribui; **o chat responde com o provider de
  `chat_provider`** (claude/cli como rede de segurança se o escolhido estiver
  inativo) e o link sobre o botão Enviar mostra/abre a escolha. **Keys cifradas
  at rest** (AES-256-GCM, `src/lib/cripto.ts`, segredo `MEMVECTOR_KEYS_SECRET`)
  e NUNCA voltam ao browser — a vista só leva `temApiKey` + sufixo. Botão
  "Testar ligação" por provider (cli = binário/versão; api = chamada barata).
  Quota/limite dita alto (padrão skills-compare). O agente-autor
  (destilação/contrato) continua claude — tools e envelope afinados para ele.
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
