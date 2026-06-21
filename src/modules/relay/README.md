# Módulo `relay` (módulo de dev — config-driven)

O circuito que corre os **cruzamentos** do pipeline lendo o **config das definições**
(`cruzamentos`: `{principal, validador}` por cruzamento), não código hardcoded. É a versão
parametrizada do par fixo `claude↔codex` que o POC `agentic-kanban` provou.

## Fluxo

definições (`cruzamentos`) → `resolverCruzamento` (resolve quem produz/valida) →
`correrCruzamento` (round-loop: produz → valida → repete até passar ou esgotar rondas) →
`executarCruzamento` (liga aos providers reais pela factory + prompts) →
`correrPipeline` (corre os cruzamentos configurados em estrela, pára num kill switch).

## Convergência (glossário) — nunca por consenso

- **Análise** = gerativo: o validador sugere a próxima melhoria até estabilizar.
- **Dev / Docs / Auditoria** = adversarial: o validador tenta **DERRUBAR**; `parseVeredito` só
  passa com "APROVADO" explícito (default-to-refuted — o erro não escapa por ambiguidade).
- **Estrela:** os cruzamentos de execução leem o output da **Análise** (fonte de verdade), não
  a narrativa do anterior (não propaga a árvore torta).
- **Kill switch:** cruzamento não validado em N rondas → pára (`completo: false`), não finge sucesso.
  - **A DISCUTIR (Carlos):** o "volta ao humano" — como/onde o humano é chamado e o que pode fazer — ainda não está fechado. Por agora só pára.

## Ficheiros

| Ficheiro            | Responsabilidade                                                  |
| ------------------- | ----------------------------------------------------------------- |
| `relay.resolver.ts` | do config → principal/validador (`none`/`self`/`<provider>`)      |
| `relay.runner.ts`   | round-loop puro + `parseVeredito`                                 |
| `relay.executar.ts` | 1 cruzamento e2e: prompts (gerativo/adversarial) + providers reais |
| `relay.pipeline.ts` | o circuito das atividades (estrela, kill switch)                  |

A config vive nas definições (`cruzamentos`). O **trigger** (issue/goal → pipeline) + os handoffs
por comentário são os próximos passos.

## Atualização (2026-06-20)

- **N validadores** (`{principal, validadores: []}`, antes era 1): lista vazia = sem validação; N =
  painel adversarial (qualquer um que derrube = não passou). `self` + providers ATIVOS.
- Os cruzamentos são **config do módulo GitHub** (add-on de dev), não genéricos no kernel: a UI
  vive **dentro da página do módulo GitHub** (gated, com providers ativos), não no menu de topo.

## Orchestrator (2026-06-21) — o motor sobre o miolo

O miolo (#127) é a lógica do circuito, in-memory. O **orchestrator** liga-a ao GitHub: a issue
é trigger + estado, o agente escreve **código de verdade** no working copy preparado (sem clonar
por-issue), e cada substep deixa rasto.

- **`relay.orchestrator.ts`** — `orquestrarDevCom` (lógica, IO injetada = testável) corre o
  cruzamento **Development**: principal escreve (TDD), validadores derrubam o diff, rondas até
  verde. **Handoff assinado POR SUBSTEP** (não no fim). Verde → commit/push/**PR** (`Closes #N`) +
  🟢; kill-switch → 🔴 e pára (sem auto-merge — pára para o smoke do Carlos). `orquestrarDev` é o
  entrypoint real (lê definições → token/path/providers → IO).
- **`escrita-no-repo.ts`** (`src/lib/providers/`) — escrita agêntica: `claude -p
  --permission-mode acceptEdits` / `codex exec --sandbox workspace-write -C <cwd>` DENTRO do repo.
  Só modo `cli` escreve (api → erro). Bypass do sandbox por env em kernels onde o bwrap rebenta.
- **`relay.git.ts`** — branch (Intern Rule)/commit/push/diff no cwd; push com o `GH_TOKEN` do user.
- **`relay.handoff.ts`** — comentário assinado (1ª linha = `— Provider · papel · fase · ronda`).
- **`src/lib/github.ts`** — `verIssue`/`editarLabels` (semáforos 🟠🔴🟢)/`criarPR`.

**Semáforos** (labels): `relay:🟠` processa · `relay:🔴` bloqueado · `relay:🟢` pronto.

**Falta (próximas fatias):** os outros cruzamentos (Análise/Docs/Auditoria reusam o pipeline),
o test-gate externo (correr a suite do repo entre rondas), a retoma do kill-switch via
chat-under-kanban, e o trigger pela UI (arrastar Backlog→Análise). Smoke vivo por fazer.
