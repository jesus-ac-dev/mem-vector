# Módulo `relay` (módulo de dev — config-driven)

O circuito que corre os **cruzamentos** do pipeline lendo o **config das definições**
(`cruzamentos`: `{principal, validador}` por cruzamento), não código hardcoded. É a versão
parametrizada do par fixo `claude↔codex` que o POC `agentic-kanban` provou.

## Fluxo

definições (`cruzamentos`) → `resolverCruzamento` (resolve quem produz/valida) →
`correrCruzamento` (round-loop: produz → valida → repete até passar ou esgotar rondas) →
`executarCruzamento` (liga aos providers reais pela factory + prompts) →
`correrPipeline` (corre as fases do relay em estrela, pára num kill switch).

## Convergência (glossário)

- **Análise** = gerativo: o validador sugere a próxima melhoria do plano até estabilizar.
- **Dev / Testes / Docs** = cada validador repo-writer faz o seu melhor e **ESCREVE por cima** + dá
  veredito; **converge quando TODOS CONCORDAM** (aprovam). `parseVeredito` só passa com "APROVADO"
  explícito (default-to-refuted — o erro não escapa por ambiguidade).
- **Auditoria** = adversarial read-only: o validador tenta **DERRUBAR** (não escreve).
- **Estrela:** os cruzamentos de execução leem o output da **Análise** (fonte de verdade), não
  a narrativa do anterior (não propaga a árvore torta).
- **Kill switch:** não convergido em N rondas (máx. configurável) → **🔴 humano** (split = "sem
  consenso", os dois lados); o humano comenta na issue e **re-dispara** (a retoma relê e integra).

## Ficheiros

| Ficheiro            | Responsabilidade                                                   |
| ------------------- | ------------------------------------------------------------------ |
| `relay.resolver.ts` | do config → principal/validador (`none`/`self`/`<provider>`)       |
| `relay.runner.ts`   | round-loop puro + `parseVeredito`                                  |
| `relay.executar.ts` | 1 cruzamento e2e: prompts (gerativo/adversarial) + providers reais |
| `relay.pipeline.ts` | o circuito das atividades (estrela, kill switch)                   |

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

- **`relay.orchestrator.ts`** — corre o **pipeline completo** (Análise→Dev→Testes→Docs) via
  `correrPipeline` (estrela: a execução lê o goal da Análise; kill-switch no 1.º que não valida).
  No caminho real, o orchestrator normaliza o relay para as fases canónicas e corre **todos os
  providers ativos** sequencialmente em cada fase: cada provider atua como principal uma vez, e os
  restantes não só validam — **fazem o seu melhor e ESCREVEM por cima** (o relay a sério: cada
  corredor melhora a perna do anterior, como um review que também corrige). Em fases que escrevem
  ficheiros, só providers com execução no repo é que escrevem (como principal OU validador); um
  provider sem execução (ex.: `api`) participa sempre read-only. A fase **converge quando CONCORDAM**
  (todos aprovam); senão roda até ao máx. de rondas → 🔴 humano (split = "sem consenso", os dois lados).
  O **test-gate** corre DEPOIS de todos escreverem (julga o trabalho acumulado).
  **Override real por fase:** se o utilizador **declarar** uma fase nas Definições (`cruzamentos`:
  principal + validadores), essa fase usa a declaração dele (1 principal escolhido + os validadores
  escolhidos) em vez da rotação (`fasesConfiguradas`); as fases NÃO declaradas rodam todos os ativos.
  A fase **Testes** = regressão/integração (confirma que o Dev respeita a Análise + não partiu o
  resto da app), distinta do TDD do Dev e da segurança da Auditoria.
    - `orquestrarCruzamentoCom` — 1 cruzamento com **handoff assinado POR SUBSTEP** (não no fim).
      Dev/Testes/Docs **escrevem** (principal em modo escrita; validadores repo-writer escrevem
      por cima e validadores sem escrita revêem o **diff** read-only); Análise/Auditoria são
      **read-only** (validam o **output**). Análise é gerativa, os outros adversariais.
    - `orquestrarCom` — branch (Intern Rule) → pipeline → verde com código: commit/push/**PR**
      (`Closes #N`) + 🟢; verde sem código: 🟢 sem PR; kill-switch: 🔴 e pára (sem auto-merge).
    - `orquestrar` — entrypoint real (lê definições → token/path/providers → IO via `construirIo`);
      `montarSpec` junta os **comentários humanos** ao goal = a **retoma** (pós-🔴, comentas e
      re-disparas; o pipeline relê e integra a correção).
- **`relay.actions.ts`** — `dispararRelay(repo, issue)`: o **trigger**. Valida cedo e corre o
  orchestrator em **background** (`after`) — o estado vive na issue, a resposta volta logo.
- **`escrita-no-repo.ts`** (`src/lib/providers/`) — escrita agêntica: `claude -p
--permission-mode bypassPermissions` / `codex exec --sandbox workspace-write -C <cwd>` DENTRO do repo.
  Só modo `cli` escreve (api → erro). Bypass do sandbox por env em kernels onde o bwrap rebenta.
  Antes de lançar o provider, o relay injeta wrappers temporários no `PATH` para bloquear red-lines
  comuns a Claude/Codex: `supabase db reset` (incluindo `npx`/`npm exec`/`pnpm dlx`/`yarn dlx`),
  `git reset --hard`, `git clean -fd`, `git checkout --` e `rm -rf` contra diretórios críticos.
  Limite honesto: isto protege invocações via `PATH`; chamadas por caminho absoluto continuam fora
  desta guarda e devem ser tratadas por ambiente descartável/sandbox.
- **`relay.git.ts`** — branch (Intern Rule)/commit/push/diff no cwd; ramo default REAL (não assume
  `main`); push com o `GH_TOKEN` do user. **`correrTestes`** = test-gate (`RELAY_TEST_CMD`, default
  `npm test`): a suite do repo é o juiz objetivo antes do validador-LLM (vermelho devolve já ao principal).
- **`relay.handoff.ts`** — comentário assinado (1ª linha = `— Provider · papel · fase · ronda`).
- **`relay.actions.ts`** — `dispararRelay` (trigger, com **lock** de um-relay-por-repo) ·
  `promoverTarefa` (cartão→issue).
- **`src/lib/github.ts`** — `verIssue` (+ comentários)/`editarLabels` (fase+cor)/`criarPR`/`ramoPrincipal`/`numeroDoUrl`.

**Progresso GitHub** (labels): estado ativo único em formato curto `<fase>:<cor>`, por exemplo
`analise:laranja`, `dev:vermelho`, `pr:verde`.

## Trigger no kanban (2026-06-21) — o fluxo do Carlos

- **Promoção** (conversa OU cartão → issue + cartão): o agente do chat tem a tool **`promover_a_issue`**
  (propõe→confirmas → cria a issue E o cartão Backlog ligado); ou, num cartão de Backlog, **⤴ promover
  a issue**. Liga `tarefas.repo_github`/`issue_github`.
- **Arrastar Backlog→Análise** dispara o relay para a issue ligada (checa precedências; cartões leves
  só mudam de coluna).
- Cartão ligado mostra link para issue/PR e, se o repo tiver path local nas Definições, link **VS Code**
  para abrir o working copy.
- Cartão bloqueado (`<fase>:vermelho`) aceita **duplo clique**: **auto-envia** ao chat do rodapé um prompt
  de recuperação (tarefa, repo, issue, fase, PR, working copy) — fatia C (#M7). O agente diagnostica porque
  bloqueou + a ação mínima para retomar sem reiniciar; o humano decide e o agente re-dispara (retoma). Não
  auto-resolve a escalada — o humano é o juiz.
- Disparo alternativo direto: página do módulo GitHub (Definições) — repo + nº da issue + **⚡ Disparar**.
- O estado vive na issue (handoffs + label fase+cor); a **vista kanban segue** via
  `tarefas.relay_estado`/`relay_fase`/`relay_pr_url`, escritos pelo orchestrator. Enquanto houver
  cartão `processando`, o kanban faz refresh periódico; quando o PR abre, o cartão fica em
  **Documentação** e aponta diretamente para o PR. Um relay crashado (restart/OOM) ficaria preso em
  `processando`; o **heartbeat** (`relay_heartbeat`, batido a cada progresso) + o sweeper no load do kanban
  (`varrerRelaysOrfaosCom`) marcam-no `bloqueado` (órfão) → recuperável pela fatia C (#M7-D). A marcação
  é condicional ao heartbeat lido para não transformar em bloqueado um relay vivo que acabou de progredir.

## Fidelidade ao desenho (2026-06-21)

- **Todas as fases leem o método da casa:** principais e validadores recebem um subset bounded do
  **Kernel** focado em método/regras/voz/prioridades (`blocoKernelRelayCom`), para herdar a craft
  sem multiplicar o Kernel inteiro por fase/ronda/provider.
- **Docs de volta no SaaS:** no verde, o orchestrator escreve uma **nota no projeto** (vectorizada) com
  a issue + o PR — não só os `docs/` do repo (`registarNoSaasCom`).
- **Vista kanban ↔ labels:** a label `<fase>:<cor>` espelha-se no cartão (`relay_estado`,
  `relay_fase`, `relay_pr_url`) e empurra a coluna: Análise → Desenvolvimento → Testes →
  Documentação/PR.
- **Agregação fina:** os **N providers configurados debatem** nas rondas — any-rejeita move-as (uma
  objeção não é votada para fora; um validador a apanhar um bug real não é silenciado). Se ao fim das
  rondas (N, configurável por `maxRondas`) os N agentes **não chegam a consenso**, é "sem consenso" →
  🔴 → **o humano decide** (a paragem do kill-switch). Um **split** (uns aprovam, outros objetam) chega
  rotulado **"SEM CONSENSO"** com os dois lados. NÃO há maioria nem um 4.º agente a desempatar.
- **Retoma cirúrgica:** o kill-switch grava a fase na label ativa (`<fase>:vermelho`); o
  re-disparo recomeça **nessa fase** (não na Análise), reusando o goal da Análise dos comentários
  (`faseDeRetoma`/`goalDaAnalise`/`correrPipeline({desde, analiseInicial})`). Sem goal guardado →
  recomeça do início.
  Na retoma a `abrirBranch` **continua** o branch (`buildRetomaArgs`: não reseta de base) — o trabalho
  não-commitado da fase anterior fica no working tree do disco (commit só no verde; o lock impede outro
  relay no mesmo path). Resetar apagava-o (achado do Audit).

**Um relay de cada vez por repo:** o working copy é partilhado (`checkout -B` + `add -A`); um
`Set` em memória trava disparos concorrentes no mesmo path.

**Falta:** **skills por fase reais** (do [[agent-skills-compare]] — hoje prompts inline); o
**smoke vivo** end-to-end.
