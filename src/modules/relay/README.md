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
  Se o principal repete o mesmo output e o validador continua a rejeitar, o runner marca **stall** e
  corta cedo, deixando o bloqueio explícito em vez de gastar as rondas restantes.

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
é trigger + estado, o agente escreve **código de verdade** num **`git worktree` isolado por run**
(partilha só o `.git`, nunca a working-copy do user), e cada substep deixa rasto.

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
  `git reset --hard`, `git clean -fd`, `git checkout --`, `rm -rf` contra diretórios críticos, matar
  processos/desligar a máquina (`kill`/`pkill`/`killall`/`reboot`/`shutdown`/`poweroff`/`halt`,
  `systemctl` destrutivo) e `sudo`. Limite honesto: isto protege invocações via `PATH`; builtins do
  shell e chamadas por caminho absoluto continuam fora desta guarda e devem ser tratadas por ambiente
  descartável/sandbox.
- **`relay.git.ts`** — **worktree isolado por run** (`prepararWorktree`/`worktreeDir`/`removerWorktree`:
  cada issue no seu dir sob `RELAY_WORKTREE_ROOT` — default irmão do repo —, a partilhar só o `.git`;
  `node_modules`/`.env*` ligados por symlink; criado fresco do base remoto, removido no verde, reusado
  na retoma); usa um branch local interno no worktree para não colidir com o branch que o humano possa
  ter aberto na working-copy, mas faz push para o branch público da PR (`feat/issue-N`); diff nesse cwd;
  ramo default REAL (não assume `main`); push com o `GH_TOKEN` do user. **`correrTestes`** =
  test-gate AFETADO: por default corre só os testes ligados ao diff (`vitest related` sobre
  `arquivosAlterados`), não a suite inteira a cada ronda — corta o tempo e não bloqueia num teste
  alheio. `RELAY_TEST_CMD` é o override total (suite/outro runner). O ANSI do vitest é limpo
  (`limparAnsi`) antes de ir para o comentário. Juiz objetivo antes do validador-LLM (vermelho
  devolve já ao principal).
- **`relay.handoff.ts`** — comentário assinado (1ª linha = `— Provider · papel · fase · ronda`).
- **`relay.actions.ts`** — `dispararRelay` (trigger, com **fila** por-repo — FIFO/dedup; o 2º
  disparo enfileira) · `promoverTarefa` (cartão→issue).
- **`relay.runs.ts`** — **run-ledger** (#observability): um registo por corrida
  (estado/fase/PR/timing) em `relay_runs`; escrita best-effort, RLS por owner e checks básicos
  (`estado`, issue positiva, datas coerentes); a tool `ler_runs_relay` lê o histórico no chat.
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
- **Duplo clique num cartão ligado a issue** (qualquer, não só bloqueado) abre o **modal da corrida**
  (#129): timeline de eventos + custo + steering (ver §Corrida transparente). Num cartão **bloqueado**
  (`<fase>:vermelho`), o modal traz o botão **Diagnosticar no chat** — auto-envia ao chat do rodapé o
  prompt de recuperação (tarefa, repo, issue, fase, PR, working copy) — fatia C (#M7). O agente
  diagnostica porque bloqueou + a ação mínima para retomar sem reiniciar; o humano decide e o agente
  re-dispara (retoma). Não auto-resolve a escalada — o humano é o juiz. O prompt e a tool
  `ler_estado_relay` expõem ainda um `motivo` derivado de `relay_fase`: `erro`, `orfao` ou
  `sem-consenso` (sem coluna nova). Quando o cartão está bloqueado, `ler_estado_relay` também traz o
  trace real dos comentários da issue, porque é aí que o relay publica análises, handoffs e erros
  concretos.
- Disparo alternativo direto: página do módulo GitHub (Definições) — repo + nº da issue + **⚡ Disparar**.
- O estado vive na issue (handoffs + label fase+cor); a **vista kanban segue** via
  `tarefas.relay_estado`/`relay_fase`/`relay_pr_url`, escritos pelo orchestrator. Enquanto houver
  cartão `processando`, o kanban faz refresh periódico; quando o PR abre, o cartão fica em
  **Documentação** e aponta diretamente para o PR. Um relay crashado (restart/OOM) ficaria preso em
  `processando`; o **heartbeat** (`relay_heartbeat`, batido a cada progresso) + o sweeper no load do kanban
  (`varrerRelaysOrfaosCom`) marcam-no `bloqueado` (órfão) → recuperável pela fatia C (#M7-D). A marcação
  é condicional ao heartbeat lido para não transformar em bloqueado um relay vivo que acabou de progredir.
- **Sub-progresso LIVE** (`tarefas.relay_progresso`, via `io.progresso`/`textoProgresso`): a `relay_fase`
  só muda nas transições; ENTRE elas (vários spawns de CLI + a suite de testes) o cartão ficava 3-5 min
  no escuro. O orchestrator escreve o passo fino a cada substep — `<fase> · ronda N · <provider> a
trabalhar/validar` ou `... a correr testes` — e o cartão mostra-o (com o provider, #160) enquanto
  `processando`. Efémero (sem histórico — o run-ledger trata disso) e bate o heartbeat (fases longas
  deixam de parecer congeladas ao sweeper de órfãos).

## Corrida transparente (2026-07-01) — #129

Ver e guiar uma corrida em curso — os dois partials do Battle-Plan_v1 (observability
custo+transcript e human-steering mid-run) fechados numa fatia:

- **Event-stream por corrida** (`relay.eventos.ts` → tabela `relay_eventos`, append-only, RLS por
  dono): cada passo gravado NO MOMENTO — `passo` (provider, papel, veredito, **custo USD, modelo,
  duração**), `testes` (gate), `transicao` (fase·semáforo), `steering`, `fim`. Correlacionados por
  `run_id` gerado no arranque de `orquestrar` (sem FK para `relay_runs` de propósito: se o processo
  morrer, os eventos sobrevivem e contam a história). Emissão via `io.evento` (best-effort — a
  corrida nunca cai por causa da observabilidade; o owner resolve-se 1× por corrida). O `relay_runs`
  ganha `custo_usd`/`custo_estimado` agregados e o `id` passa a ser o `run_id` (correlação eventos
  ↔ ledger). O custo soma-se na **fonte** (`aoCusto` por resposta de provider, em `construirIo`),
  não reconstruído do event-stream — billing e observabilidade não se acoplam; `null` no ledger =
  corrida sem passos medidos (≠ $0.00). A timeline da UI mostra no máx. 200 eventos e diz quando
  trunca (sem cortes mudos; o histórico completo vive na issue).
- **Modal da corrida** (`kanban-corrida-modal.tsx`, GET `/api/relay-corrida`): duplo clique em
  qualquer cartão com issue → timeline (corridas anteriores colapsadas, última aberta, refresh 5s
  enquanto processa), total gasto, links issue/PR, e o diagnóstico do kill-switch como botão quando
  bloqueado. É o "ver o CLI" pedido no #129 — cada spawn de provider e cada test-gate com duração e
  resultado; o texto completo continua nos comentários da issue (o GitHub é a verdade auditável).
- **Steering a quente** (`relay.steering.ts` → tabela `relay_steering` + action `guiarRelay`):
  escreve-se orientação COM a corrida a meio; o orchestrator **consome as pendentes no próximo
  passo de produção** (o principal integra-as com prioridade, como integra objeções), deixa
  comentário assinado `— Humano · steering · <fase> · ronda N` na issue e regista o evento. O
  consumo é em **dois tempos** (achado do Audit): lê pendentes antes de produzir, **marca
  consumidas só depois do provider correr** — se o passo falhar (GitHub 500, CLI a rebentar), a
  orientação fica pendente e o retry reaplica-a, nunca se perde. Uma orientação escrita entre
  corridas fica pendente e entra na próxima; para guiar uma fase futura, escreve-a quando a fase
  chegar (a orientação aplicada na Análise propaga às fases seguintes pela estrela). O kill-switch
  deixa de ser a única alavanca humana. (O comentário começa por `—` de propósito: o `montarSpec`
  da retoma não o re-injeta — já foi integrado quando foi consumido.)
- Prova headless: `npx tsx scripts/probes/relay-corrida.ts` (steering guarda→pendente→consumido +
  eventos em ordem com custo, sob a sessão RLS do dev user).
- Fora da fatia: alimentar `ler_estado_relay` com os eventos (follow-up natural).

### Ronda 2 do smoke (2026-07-01, noite) — matar o blackout

O smoke do Carlos expôs o buraco: um passo de Análise é UM spawn de CLI de 3-4 min e nada mexia
durante esse tempo (o "live" era live entre passos, cego dentro deles). Fix:

- **Narração DENTRO do spawn**: o claude passou a correr `--output-format stream-json --verbose`
  em vez do envelope único; `interpretarLinhaRepoClaude` traduz cada linha em ação humana —
  `a ler a issue e o repo` (init), `thinking` (system/thinking_tokens, verificado no stream real),
  `a ler o código`/`a escrever código`/`a correr comandos` (tool_use → `labelPassoRepo`),
  `a escrever o relatório` (texto). O codex narra por padrões de linha (`thinking`, `exec` →
  comandos). O `onPasso` (dedupe de ações consecutivas) sobe por `io.correr` até
  `tarefas.relay_progresso` → o cartão e o modal mostram `<fase> · ronda N · <provider> <ação>`
  ao vivo, e cada update bate o heartbeat.
- **Custo sem assimetria**: o `codex exec` não reporta custo (`costUsd 0` estimado) — a timeline
  mostra **`custo n/d`** explícito (`custoDoPasso`), nunca célula vazia ao lado do $ do claude.
- Por fazer (decisões de design do Carlos em aberto): a observability mudar do modal para o **chat
  do rodapé** (feed de mensagens da corrida + animação das proporções verticais kanban↔chat com
  toggle no canto direito).

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
  Na retoma o worktree da issue é **reusado** (não recriado) — o trabalho não-commitado da fase
  anterior fica lá no disco (commit só no verde). Recriar de base apagava-o (achado do Audit).

**Isolamento por run (worktree):** cada run vive no seu `git worktree`, não na working-copy
partilhada — o relay deixou de roubar o branch do tree que o dev server serve / o humano edita
(a colisão que se via). Em ficheiros, dois runs de issues diferentes já não conflituam.
**Serialização por repo (fila FIFO):** mantida — mas a razão mudou: já não é o lock da working-copy
(resolvido pelo worktree), é a **DB de testes partilhada**. O gate já corre só os testes afetados
(não a suite inteira), mas quando o diff toca um módulo com RLS esses testes batem no mesmo Supabase
→ dois runs em paralelo poluir-se-iam. Concorrência real entre issues fica para quando o gate isolar
também a DB (ou só correr os afetados não-integração).

**Falta:** **skills por fase reais** (do [[agent-skills-compare]] — hoje prompts inline); o
**smoke vivo** end-to-end.
