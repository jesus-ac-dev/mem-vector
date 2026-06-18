# Módulo `definicoes`

> Definições por utilizador (#60): a mega modal do badge — Comportamento, Agentes e Módulos.

## O que faz

Guarda as opções do workspace (1 linha por utilizador; **sem linha = defaults** — o
utilizador novo não precisa de seed). A UI é a mega modal aberta pela dropdown do
badge: menu lateral à esquerda (Principais: Agentes, Módulos; grupo "Módulos ativos"
com a página de cada módulo ligado), forms à direita e **botão Guardar explícito** —
ao guardar, só os providers **ligados nesta sessão** e ainda não testados são **testados à
força** (teste vermelho = não grava; desativar ou só mudar modelo/key não dispara teste —
o utilizador testa à mão se quiser). O teste corre contra a config PENDENTE do form, key
incluída (r9 matou o bypass das keys novas). A ESCOLHA de quem responde ao chat vive na
**mini-modal do link sobre o Enviar** (`escolha-modelo-modal.tsx`) — essa sim grava
onChange, só entre providers já parametrizados.

## Secções e opções

- **Comportamento** — COMO o agente-autor age; a secção ACUMULA (ver memória
  `definicoes-comportamento-acumula`): hoje `metodo_destilacao` (`one-shot`
  default, decisão #38 — ¼ do custo / `agentic`), lido por `chat.postturno.ts`;
  a env `MEMVECTOR_AGENTIC_DISTILL=1` continua como **override** (evals).
  E `match_count` (#67): nº de fontes do retrieval do chat (1..50, default 5;
  antes fixo no código), lido no `respond` via `providerDoChatCom`. A rede de
  candidatos do agente-autor é separada (`CANDIDATOS_DESTILACAO`, interna).
  E `web_habilitada` (#45, default false): liga a **pesquisa na internet** na
  resposta do chat. **Two-phase (#85):** com web ON, o turno corre primeiro o
  caminho rápido (streaming, com RAG) e só escala para o agente-com-tools
  (`src/agent/responder-tools.ts`) se o modelo emitir `[[ESCALAR]]` — para factos
  do mundo (web) ou para ir buscar algo que o RAG por semelhança não traz (daily
  por data via `ler_daily`, nota/tarefa nomeada). Perguntas gerais respondem-se
  rápido sem escalar. **Sem key = DuckDuckGo** (grátis, flaky → erro lembra a key).
  A **key Tavily** (grátis 1k/mês, sem cartão, feita p/ agentes; campo neutro
  `web_key_cifrada`, cifrada at rest como as keys dos providers, máscara na vista)
  configura-se aqui no toggle, com link para a obter; `MEMVECTOR_AGENT_WEB_KEY` no
  env fica como fallback de operação. A key segue ao `responderComToolsCom` via
  `providerDoChatCom`.
  A entrar: proatividade, estilo, personalidade.
- **Agentes** — os providers/orquestradores (`agentes` jsonb): claude (default
  vivo, cli), codex, gemini, ollama — `{ativo, modo, modelo, esforco, apiKey}`.
  **O `modo` é real por provider** (r9/r10, `MODOS_POR_PROVIDER`): claude/codex/gemini =
  cli (subscrição/login do próprio binário) ou api (Anthropic `/v1/messages` ·
  OpenAI `/v1/chat/completions` · Google `generateContent`, key obrigatória);
  ollama = só daemon local (sem key). A UI só oferece os modos que o factory
  implementa. O gemini/cli fala com o binário oficial `@google/gemini-cli`
  (headless `-p` + `--output-format json`; contrato verificado nas docs do repo, r10). O **FactoryProvider**
  (`src/lib/providers/factory.ts`, referência: `~/src/agent-skills-compare`)
  distribui **lendo o modo**; **o chat responde com o provider de
  `chat_provider`** (claude/cli como rede de segurança se o escolhido estiver
  inativo) e o link sobre o botão Enviar mostra/abre a escolha. **Keys cifradas
  at rest** (AES-256-GCM, `src/lib/cripto.ts`, segredo `MEMVECTOR_KEYS_SECRET`)
  e NUNCA voltam ao browser — a vista só leva `temApiKey` + sufixo. Botão
  "Testar ligação" por provider — **a sério** (r8/r9): corre contra a config
  PENDENTE do form (key nova incluída) e faz uma mini-geração pelo MESMO caminho
  do chat (cli: auth/flags/trusted-dir rebentam no teste; api: a key prova-se na
  listagem de modelos E na geração — uma key ao calhas dá vermelho); o detalhe
  mostra o **modelo REAL** (envelope no cli, campo `model` na api), porque o
  auto-relato dos modelos mente. O chat também mostra "modelo: <real>" junto ao custo.
  Quota/limite dita alto (padrão skills-compare). **O teste com sucesso DESCOBRE a
  lista de modelos do provider e persiste-a** (#60 r5 — gemini/api e ollama via API
  real; claude/cli e gemini/cli = nomes documentados do binário (nenhum expõe
  listagem — verificado nas docs, r6/r10); codex/cli = `codex debug
models`, solução do Carlos r6; claude/codex em api = `/v1/models` real): as
  dropdowns da escolha ficam vivas — modelo novo nas notícias → Testar ligação →
  aparece. Modelo e esforço escolhem-se SEMPRE na mini-modal (nunca nas Definições,
  sem texto livre). O agente-autor com tools (destilação agentic/contrato e
  resposta escalada) continua Claude CLI + MCP — tools e envelope afinados para
  ele. A matriz de capacidades vive em `docs/ORQUESTRADORES.md`; provider de chat
  não implica runner agentic.
- **Módulos** (`modulos_ativos`) — toggles: `github` (disponível), `emails`,
  `google-workspace`, `campanhas` (reservados, do roadmap do brief §5 + visão
  do calendário).

## Ficheiros

| Ficheiro                | Responsabilidade                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `definicoes.schema.ts`  | enums (`METODOS_DESTILACAO`, `MODULOS`), `DefinicoesSchema`, defaults                                       |
| `definicoes.service.ts` | `lerDefinicoesCom` (parse tolerante — valores velhos não rebentam a modal) + `gravarDefinicoesCom` (upsert) |
| `definicoes.actions.ts` | Server Actions finas                                                                                        |

UI: `src/components/layout/definicoes-modal.tsx` (aberta pelo `profile-menu.tsx`).

## Modelo de dados

Tabela `definicoes` (migração `20260612200000`): `owner_id` (PK, FK auth.users),
`metodo_destilacao` (check), `modulos_ativos text[]`, `updated_at`. RLS só-dono
(definições não se partilham com grupos).
