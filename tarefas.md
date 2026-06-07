# tarefas

Ultima atualizacao: 2026-06-07

## Em Progresso

- [?] **Destilacao pos-chat duravel** — job server-side criado dentro de `ask()`; UI processa por `jobId`; migration aplicada localmente. Falta smoke real no browser/Claude CLI. Ref: `src/modules/chat/chat.actions.ts`, `src/modules/chat/chat.jobs.ts`, `supabase/migrations/20260607193000_agent_jobs.sql`.
- [?] **Identidade por id + paths Obsidian** — tabs, explorer, grafo, editor, historico, guardar e fontes do chat usam `id` quando disponivel; `slug` de knowledge passou a ser unico por pasta, nao global por dono; chooser de wikilinks ambiguos implementado. Falta smoke manual. Ref: `src/components/layout/workspace-context.tsx`, `supabase/migrations/20260607203000_folder_scoped_knowledge_slugs.sql`.

## Pendentes — Alta

Sem pendentes de alta prioridade.

## Pendentes — Media

Sem pendentes de média.

## Pendentes — Baixa

Sem pendentes de baixa prioridade.

## Concluidas Recentemente

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
