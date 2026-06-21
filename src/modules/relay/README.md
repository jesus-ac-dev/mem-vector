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

- **`relay.orchestrator.ts`** — corre o **pipeline completo** (Análise→Dev→Docs→Auditoria) via
  `correrPipeline` (estrela: a execução lê o goal da Análise; kill-switch no 1.º que não valida).
  - `orquestrarCruzamentoCom` — 1 cruzamento com **handoff assinado POR SUBSTEP** (não no fim).
    Dev/Docs **escrevem** (principal em modo escrita; validadores validam o **diff**); Análise/
    Auditoria são **read-only** (validam o **output**). Análise é gerativa, os outros adversariais.
  - `orquestrarCom` — branch (Intern Rule) → pipeline → verde com código: commit/push/**PR**
    (`Closes #N`) + 🟢; verde sem código: 🟢 sem PR; kill-switch: 🔴 e pára (sem auto-merge).
  - `orquestrar` — entrypoint real (lê definições → token/path/providers → IO via `construirIo`);
    `montarSpec` junta os **comentários humanos** ao goal = a **retoma** (pós-🔴, comentas e
    re-disparas; o pipeline relê e integra a correção).
- **`relay.actions.ts`** — `dispararRelay(repo, issue)`: o **trigger**. Valida cedo e corre o
  orchestrator em **background** (`after`) — o estado vive na issue, a resposta volta logo.
- **`escrita-no-repo.ts`** (`src/lib/providers/`) — escrita agêntica: `claude -p
  --permission-mode acceptEdits` / `codex exec --sandbox workspace-write -C <cwd>` DENTRO do repo.
  Só modo `cli` escreve (api → erro). Bypass do sandbox por env em kernels onde o bwrap rebenta.
- **`relay.git.ts`** — branch (Intern Rule)/commit/push/diff no cwd; ramo default REAL (não assume
  `main`); push com o `GH_TOKEN` do user. **`correrTestes`** = test-gate (`RELAY_TEST_CMD`, default
  `npm test`): a suite do repo é o juiz objetivo antes do validador-LLM (vermelho devolve já ao principal).
- **`relay.handoff.ts`** — comentário assinado (1ª linha = `— Provider · papel · fase · ronda`).
- **`relay.actions.ts`** — `dispararRelay` (trigger, com **lock** de um-relay-por-repo) ·
  `promoverTarefa` (cartão→issue) · `comentarERetomar` (retoma) · `lerComentariosRelay`.
- **`src/lib/github.ts`** — `verIssue` (+ comentários)/`editarLabels` (semáforos)/`criarPR`/`ramoPrincipal`/`numeroDoUrl`.

**Semáforos** (labels): `relay:🟠` processa · `relay:🔴` bloqueado · `relay:🟢` pronto.

## Trigger no kanban (2026-06-21) — o fluxo do Carlos

- **Promoção** (cartão→issue): num cartão de Backlog, **⤴ promover a issue** cria a issue do
  título+descrição e liga o cartão (`tarefas.repo_github`/`issue_github`).
- **Arrastar Backlog→Análise** dispara o relay para a issue ligada (cartões leves só mudam de coluna).
- **Retoma** (chat-under-kanban): num cartão ligado, **↻ retomar** mostra os comentários da issue +
  caixa de correção → comenta como humano e re-dispara (o `montarSpec` relê e integra).
- Disparo alternativo direto: página do módulo GitHub (Definições) — repo + nº da issue + **⚡ Disparar**.
- O estado vive na issue (handoffs + semáforos); a UI só dispara e segue-se no GitHub.

**Um relay de cada vez por repo:** o working copy é partilhado (`checkout -B` + `add -A`); um
`Set` em memória trava disparos concorrentes no mesmo path (v1 single-process). Lock durável
quando o relay for distribuído.

**Falta:** a promoção **proativa** pelo agente no chat (propõe→confirma — hoje a promoção é o
botão do cartão); o smoke vivo end-to-end.
