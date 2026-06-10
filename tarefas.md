# tarefas

Ultima atualizacao: 2026-06-09

## Retoma rapida

- Branch: `fix/smoke-tests-and-others`.
- Objetivo ativo: Explorer e `[[` fechados; bug FilePane `fetchServerAction` corrigido; próxima frente: bugs pequenos do File/editor.
- App local: `http://localhost:2500`; Supabase local esperado em `npm run db:status` (`mem-vector`, portas 560xx).
- Ultima validação: FilePane passou a ler conteúdo por `GET /api/file`; `npm run verify` (29 files / 161 tests), `npx playwright test e2e/home.spec.ts`, `npm run build` e smoke Playwright autenticado verdes.
- Smokes ainda abertos: `[?] Destilacao pos-chat duravel`. Fechados nesta ronda: Explorer, drag/drop, archive de pastas, `[[` autocomplete/paths/chooser/criação. Restam como backlog separado, não bloqueante: share no header (`5.1`) e animação do grafo (`9.3`).
- Antes de mexer: `git status --short`, reler esta secção e `docs/plans/smoke-tests-tarefas-validacao-2026-06-07.md`.

## Em Progresso

- [?] **Destilacao pos-chat duravel** — job server-side criado dentro de `ask()`; UI processa por `jobId`; migration aplicada localmente. Falta smoke real no browser/Claude CLI. Ref: `src/modules/chat/chat.actions.ts`, `src/modules/chat/chat.jobs.ts`, `supabase/migrations/20260607193000_agent_jobs.sql`.

## Pendentes — Alta

Sem pendentes de alta prioridade.

## Pendentes — Media

Sem pendentes de média.

## Pendentes — Baixa

- [ ] #mem-vector Automatizar regressão FilePane login+abrir ficheiro: e2e permanente para abrir `Arquivo FP 85142`/nota seeded, confirmar `GET /api/file` 200 e zero `window.__MEM_VECTOR_ERRORS__`. 🔽 ➕ 2026-06-09 🆔 mem-vector-filepane-smoke-e2e-20260609

## Concluidas Recentemente

- [x] **FilePane — leitura de ficheiro por API estável** — o pane deixou de depender de Server Action chamada em `useEffect` para carregar conteúdo; nova rota `GET /api/file` devolve knowledge/daily por `id` quando existe, mantendo `lerFicheiro` como compatibilidade. Adicionado retry/helper testado para erro transiente de Server Action e smoke autenticado sem logs client-side. Ref: `src/app/api/file/route.ts`, `src/modules/workspace/workspace.files.ts`, `src/components/layout/file-pane.tsx`, `src/lib/client-error-log.test.ts`.
- [x] **Client error logging** — adicionado log estruturado para `error`/`unhandledrejection` e wrapper `runClientAction` nas server actions/handlers async principais. Logs saem como `[mem-vector/client-error]` e ficam em `window.__MEM_VECTOR_ERRORS__` para debug rápido. Ref: `src/lib/client-error-log.ts`, `src/components/layout/client-error-listener.tsx`.
- [x] **Explorer — smokes de árvore fechados** — headers `16px`, itens de 1.º nível `36px`, filhos `64px`; criar pasta/nota abre `Knowledge` ou pasta selecionada quando collapsed; pasta selecionada usa border e ficheiro selecionado usa background; drag/drop move notas e pastas entre pastas/raiz; drop no Archive marca a pasta/subpastas como arquivadas, arquiva as notas descendentes e não devolve ficheiros à raiz. Ref: `src/components/layout/file-explorer.tsx`, `src/components/layout/workspace-shell.tsx`, `src/modules/folders/folders.service.ts`.
- [x] **Identidade por id + paths Obsidian / `[[` fechados** — tabs, explorer, grafo, editor, histórico, guardar e fontes do chat usam `id` quando disponível; `slug` de knowledge é único por pasta; `[[` com paths/homónimos/chooser/criação na pasta atual foi aceite como fechado nos smokes de 2026-06-09. Ref: `src/components/layout/workspace-context.tsx`, `src/modules/knowledge/knowledge.links.ts`, `src/modules/workspace/wikilink-autocomplete.ts`, `supabase/migrations/20260607203000_folder_scoped_knowledge_slugs.sql`.
- [x] **Correções pós-smoke do workspace** — removido o console error ao alternar arquivados; header do explorer reordenado e sem ações de criar em modo arquivados; chat icon só fica selected quando o chat está aberto; arquivar ganhou confirmação e estado visual; repor usa estado visual de sucesso; nome da nota passou a vir do primeiro `#` do markdown com validação no guardar; duplo-clique no explorer volta como atalho que altera esse H1; criar pasta passa a respeitar a pasta selecionada; drag/save/archive notificam explorer/sidebar/grafo; `[[` mostra caminho e insere alvo com path para homónimos; links com path resolvem o destino certo; notas criadas por `[[` nascem na pasta atual; grafo 2D ganhou links mais visíveis, tamanho por grau e destaque do nó ativo; título de conversa ficou resumido; prompt deixou de sugerir Obsidian/CLI; UI mostra `jobId` curto enquanto a destilação corre. Ref: `src/components/layout/*`, `src/modules/workspace/workspace.actions.ts`, `src/modules/knowledge/knowledge.links.ts`, `src/modules/chat/*`.
- [x] **Paridade Codex/Claude de skills e agentes** — `.codex/skills` cobre as 6 skills; `.codex/agents`, `.codex/routing-map.json` e hooks shim espelham o routing Claude. Skills passaram no `quick_validate.py`; routing JSON e scripts Codex validados com `node`. Ref: `.codex/`.
- [x] **Projector de indices derivados** — writes de knowledge/daily enfileiram `agent_jobs(type='derived_index_entity')` e processam já chunks/embeddings/edges; se falhar, fica retryable. Migration aplicada localmente. Ref: `src/modules/workspace/index-projector.ts`, `supabase/migrations/20260607204000_derived_index_jobs.sql`.
- [x] **Chooser para wikilinks ambiguos** — clique em `[[slug]]` e forward links com varios alvos mostram escolha explícita em vez de abrir/criar a raiz. Ref: `src/components/layout/file-pane.tsx`, `src/components/layout/workspace-shell.tsx`.
- [x] **Metadata rica em chunks de chat** — user+assistant passam a ser indexados com `conversation_id`, `message_id`, `role`, `created_at` e pruning dos 80 chunks mais recentes por conversa. Ref: `src/modules/chat/chat.indexing.ts`, `src/modules/chat/chat.actions.ts`.
- [x] **Driver Claude CLI robusto — fila/input** — `generate()` usa prompt por stdin, `CLAUDE_CONCURRENCY` com semaforo (default 1) e mantém timeout/kill. Ref: `src/lib/claude.ts`.
- [x] **Testes de gaps criticos** — retry real de `agent_jobs` coberto em integração RLS; rollback de restore após falha de reindex coberto por unit test. Ref: `src/tests/chat-jobs-rls.test.ts`, `src/modules/knowledge/knowledge.restore.test.ts`.
- [x] **Refresh pos-guardar no editor** — guardar ficheiro dispara invalidação do workspace, `router.refresh()` e reload de sidebar direita/grafo. Ref: `src/components/layout/workspace-context.tsx`, `src/components/layout/file-pane.tsx`, `src/components/layout/workspace-graph.tsx`.
- [x] **Aliases de wikilinks** — `[[alvo|texto]]` suportado; parser usa o alvo para edges/href, renderer mostra o alias, rename preserva alias explícito. Ref: `src/modules/knowledge/knowledge.links.ts`, `src/components/ui/markdown.tsx`.
- [x] **Append atomico do daily** — `append_daily_entry` serializa por `(owner,dia)`, grava `dailies` + `file_versions` no mesmo statement e teste concorrente garante que duas linhas nao se perdem. Ref: `supabase/migrations/20260607194000_append_daily_entry.sql`.
- [x] **Knowledge + versão transacionais** — `write_knowledge_entry` serializa por `(owner,slug)`, grava `knowledge` + `file_versions` no mesmo statement e devolve `previous_content_md` para diff sob lock. Ref: `supabase/migrations/20260607195000_write_knowledge_entry.sql`.
- [x] **Archive knowledge transacional** — `archive_knowledge_entry` marca `archived=true` e apaga chunks no mesmo statement; `npm run arquivo` verde. Ref: `supabase/migrations/20260607200000_archive_knowledge_entry.sql`.
- [x] **Rename/restore knowledge endurecidos** — `rename_knowledge_entry` atualiza nota, versao, chunks metadata e edges de destino no mesmo statement; reescrita de backlinks passou a `author='user'` e retry idempotente; `restore_knowledge_entry` tem compensacao para voltar a arquivar se a reindexacao falhar. Ref: `supabase/migrations/20260607201000_rename_restore_knowledge_entry.sql`.
- [x] **Workspace tabs/editor por id** — `FicheiroAberto` ganhou `id`, `tabKey` usa `tipo:id`, actions leem/guardam/historico por id e novas RPCs `write_knowledge_entry_by_id`/`replace_daily_entry_by_id` evitam guardar a entidade errada em colisao slug/dia. Ref: `supabase/migrations/20260607202000_write_entities_by_id.sql`.
- [x] **Fontes do chat preservam id** — `sourceHref` acrescenta `?id=<entity_id>` para knowledge/daily, e as paginas `/knowledge/[slug]`/`/daily/[dia]` preferem `id` quando presente sem quebrar URLs antigas. Ref: `src/modules/chat/chat.provenance.ts`.
- [x] **Slug scoped por pasta** — removida a unicidade global `(owner,slug)` em knowledge; nova unicidade `(owner,folder_id,slug)`; criar nota em pasta escreve diretamente nessa pasta; edges de wikilink ambiguo ficam pendentes (`to_id=null`) em vez de apontarem ao alvo errado. Ref: `supabase/migrations/20260607203000_folder_scoped_knowledge_slugs.sql`.
- [x] **Comentarios stale corrigidos** — daily ja escreve edges, mas a sidebar mostra so outline; `getSupabaseAdmin` e service role para scripts/testes. Ref: `src/modules/workspace/workspace.actions.ts`, `src/lib/supabase-admin.ts`.
- [x] **Timeout do Claude CLI** — `generate()` mata o processo com `SIGTERM` após `CLAUDE_TIMEOUT_MS` (default 120s) e teste unitário cobre fallback/env. Ref: `src/lib/claude.ts`.

## Notas

- Branch atual: `fix/smoke-tests-and-others`.
- Ultimo commit observado: `9d69110 chore(docs): remove planos/specs de features entregues + ignora docs/superpowers`.
- Estado antes desta sessao: `README.md` ja modificado por alteracao minima/alheia.
- Validacoes do audit: `format:check`, `lint`, `typecheck`, `test:run` (20 files / 106 tests) e `build` verdes. Build emitiu warning Turbopack/NFT ligado a `src/lib/claude.ts`.
- Validacoes da fatia jobs: `format:check`, `lint`, `typecheck`, `test:run` (21 files / 108 tests) e `build` verdes. `supabase migration up` aplicado localmente.
- Validacoes da fatia append atomico: `daily-rls.test.ts` verde (5 testes), `format:check`, `lint`, `typecheck`, `test:run` (21 files / 109 tests) e `build` verdes. `supabase migration up` aplicado localmente.
- Validacoes da fatia knowledge transacional: `knowledge-rls.test.ts` verde (3 testes), `format:check`, `lint`, `typecheck`, `test:run` (21 files / 109 tests) e `build` verdes. `supabase migration up` aplicado localmente.
- Validacoes da fatia archive transacional: `npm run arquivo` verde, `format:check`, `lint`, `typecheck`, `test:run` (21 files / 109 tests) e `build` verdes. `supabase migration up` aplicado localmente.
- Validacoes da fatia timeout CLI: `claude.test.ts` verde, `format:check`, `lint`, `typecheck`, `test:run` (22 files / 111 tests) e `build` verdes.
- Validacoes da fatia rename/restore: `npm run folders-rename` verde (5 eixos), `npm run arquivo` verde (6 eixos), `format:check`, `lint`, `typecheck` e `test:run` (22 files / 111 tests) verdes. `supabase migration up` aplicado localmente.
- Validacoes da fatia workspace por id: `format:check`, `lint`, `typecheck`, `test:run` (22 files / 112 tests) e `build` verdes. `supabase migration up` aplicado localmente.
- Validacoes da fatia fontes por id: `format:check`, `lint`, `typecheck`, `test:run` (22 files / 112 tests) e `build` verdes.
- Validacoes da fatia Obsidian paths: `npm run folders-rename`, `npm run arquivo`, `knowledge-rls.test.ts`, `format:check`, `lint`, `typecheck`, `test:run` (22 files / 113 tests) e `build` verdes; teste cobre mesmo slug em raiz+pasta e edge ambiguo pendente. `supabase migration up` aplicado localmente.
- Validacoes da fatia pendentes em aberto: `npm run verify` verde (26 files / 129 tests) e `npm run build` verde. Build manteve warning Turbopack/NFT ja observado no import trace de `src/lib/claude.ts`.
- Validacoes da fatia projector + chooser: `supabase migration up`, `daily-rls.test.ts`, `knowledge-rls.test.ts`, `chat-jobs-rls.test.ts`, `npm run verify` (26 files / 129 tests) e `npm run build` verdes. Build manteve o warning Turbopack/NFT ja observado.
- Validacoes da ronda pos-smoke 2026-06-08: `npm run typecheck`, testes focados de chat title/prompt/wikilinks/markdown/autocomplete/folders (47 testes), `npm run lint`, `npm run verify` (27 files / 136 tests), `npm run build` e `npx playwright test e2e/home.spec.ts` verdes. Smoke Playwright autenticado ad hoc: login dev, alternar arquivados, criar actions escondidas/visíveis e zero console/page errors. Build manteve o warning Turbopack/NFT ja observado.
- Validacao da regra H1->nome 2026-06-08: `knowledge.title.test.ts` verde (7 testes), `npm run verify` verde (28 files / 143 tests) e `npm run build` verde. Build manteve o warning Turbopack/NFT ja observado.
- Validacao do fix key autocomplete 2026-06-08: `wikilink-autocomplete.test.ts` verde (9 testes), `npm run typecheck`, `npm run lint` e `npm run verify` verdes (28 files / 144 tests).
- Validacao do polish editor/sidebar 2026-06-08: `Esc` no editor cancela e sai da edição; outgoing links no painel direito mostram estado (`Nota existente`, `Vários destinos`, `Link por criar`). `npm run typecheck`, `npm run lint` e `npm run verify` verdes (28 files / 144 tests).
- Validacao do fix links por path 2026-06-08: `parseWikilinkTargets` preserva path, o projector resolve `edges.to_id` por pasta/título, `forwardLinksDeCom` respeita `to_id` antes de marcar ambiguidade e backlinks filtram edges resolvidas pela nota exacta. `knowledge.links.test.ts` verde (17 testes), `knowledge-rls.test.ts` verde (5 testes), `npm run verify` verde (28 files / 148 tests) e `npm run build` verde. Build manteve o warning Turbopack/NFT ja observado.
- Validacao do polish de rename 2026-06-08: rename de nota remove alias redundante em links sem path (`[[Velho|Velho]]` -> `[[Novo]]`), mas em links com path renova o alias curto (`[[pasta/Velho|Velho]]` -> `[[pasta/Novo|Novo]]`); alias custom é preservado, path de pasta é preservado e só se reescreve o homónimo certo quando há links para várias pastas. Rename de pasta reescreve prefixes de wikilinks (`[[Antiga/Nota]]` -> `[[Nova/Nota]]`) sem mexer em pastas parecidas; o pane aberto recarrega ao receber `workspaceVersion`, sem exigir F5. Backlinks são regravados por `id`, não por slug. `knowledge.links.test.ts` verde (24 testes), `knowledge-rls.test.ts` verde (5 testes), `npm run verify` verde (28 files / 155 tests) e `npm run build` verde. Build manteve o warning Turbopack/NFT ja observado.

- Validação do alinhamento do explorer 2026-06-09: smoke Playwright autenticado mediu headers `paddingLeft=16px`, itens de 1.º nível `36px`, filhos `64px`, com zero console/page errors; smoke real criou pasta raiz + subpasta com `parent_id` correto e limpou os IDs criados; screenshot guardada em `/tmp/mem-vector-explorer-padding-36-64.png`. `npm run verify` verde (28 files / 155 tests), `npx playwright test e2e/home.spec.ts` verde e `npm run build` verde com o warning Turbopack/NFT já conhecido.
- Validação DnD/selected do explorer 2026-06-09: smoke Playwright/Supabase descartável passou root Knowledge force-open ao criar pasta, pasta selecionada com `border-primary` sem selected de ficheiro, ficheiro selecionado com `bg-accent`, nota root -> pasta -> root (`knowledge.folder_id`), pasta root -> pasta -> root (`folders.parent_id`) e nota -> Archive (`archived=true`); cleanup removeu notas/pastas de smoke. `npm run verify` verde (28 files / 156 tests), `npx playwright test e2e/home.spec.ts` verde e `npm run build` verde; build manteve o warning Turbopack/NFT já conhecido.
- Validação final do explorer 2026-06-09: smoke Playwright/Supabase descartável passou criar nota com `Knowledge` collapsed (fica visível a `36px`), criar nota dentro de pasta collapsed (fica visível a `64px`) e pasta -> Archive corrigido em regressão posterior para marcar pasta/subpastas como `archived=true`, arquivar notas descendentes e remover chunks sem mostrar ficheiros na raiz. `knowledge-rls.test.ts` cobre `arquivarPastaCom` com reescrita de wikilinks por path; `npm run verify` verde (28 files / 157 tests), `npx playwright test e2e/home.spec.ts` verde e smoke Playwright/Supabase descartável confirmou folder -> Archive com zero erros browser.
- Validação folder archive 2026-06-09: regressão corrigida; drop de pasta no Archive marca pasta/subpastas como arquivadas, arquiva notas descendentes, remove chunks e não reinjecta ficheiros na raiz. `knowledge-rls.test.ts` verde (7 testes), `npm run verify` verde (28 files / 157 tests), `npx playwright test e2e/home.spec.ts` verde, `npm run build` verde com warning Turbopack/NFT conhecido, e smoke Playwright/Supabase descartável passou com reload, pasta `archived=true`, nota ainda scoped à pasta arquivada, zero `console.error`/`window.__MEM_VECTOR_ERRORS__`.
- Validação do logging client-side 2026-06-09: server actions/handlers async principais passaram por `runClientAction`; listener global captura `error` e `unhandledrejection`; `npm run verify` verde (28 files / 157 tests), `npx playwright test e2e/home.spec.ts` verde e `npm run build` verde; build manteve o warning Turbopack/NFT já conhecido.
- Validação do FilePane/API 2026-06-09: erro `fetchServerAction` ao ler `Arquivo FP 85142` mitigado movendo o load para `GET /api/file`; `npm run verify` verde (29 files / 161 tests), `npx playwright test e2e/home.spec.ts` verde, `npm run build` verde com warning Turbopack/NFT conhecido e smoke Playwright autenticado confirmou `/api/file` 200, conteúdo visível e zero `pageerror`/`console.error`/`window.__MEM_VECTOR_ERRORS__`.

## Relatorio de Audit

Resumo do audit feito em 2026-06-07:

1. **Alto — memoria pos-chat best-effort.** A UI chama `destilarTurno(question, res.answer)` em background depois de renderizar a resposta. Se a tab fechar, houver refresh, navegacao ou falha de rede, o turno pode nunca escrever daily/knowledge.
2. **Alto — daily sujeito a lost updates.** `acrescentarAoDailyCom` le o conteudo atual, concatena em memoria e faz upsert. Dois turnos simultaneos podem perder uma entrada.
3. **Alto — writes compostos sem transacao.** Knowledge e daily fazem upsert -> versao -> chunks -> edges em passos separados. Archive/restore/rename tambem podem deixar RAG, grafo e versoes divergentes.
4. **Medio/Alto — `protected` colide com chave por slug/dia.** A RLS permite ver conteudo de outros donos via grupo, mas UI/actions ainda abrem e guardam por `slug`/`dia`, que so sao unicos por owner.
5. **Medio — chunks de chat sem proveniencia suficiente.** Perguntas entram no RAG como prompts soltos, sem metadata de conversa/mensagem e sem resposta do assistente.
6. **Medio — Claude CLI e choke-point.** `spawn(claude -p prompt)` nao tem timeout/fila e pode sofrer com prompt grande ou processo preso.
7. **Medio — rename de nota parcial.** Atualiza metadata de chunks sem verificar erro e reescreve backlinks como `agent`.
8. **Baixo/Medio — UI stale depois de guardar.** Editor atualiza pane local mas nao invalida explorer/sidebar/grafo.

Prioridade recomendada: job server-side duravel para destilacao -> append atomico do daily -> transacoes/RPC para writes -> identidade por `id` -> driver CLI robusto.
