# tarefas

Ultima atualizacao: 2026-06-10

## Retoma rapida

- Branch: `fix/smoke-tests-and-others`.
- Objetivo ativo: **#19 FECHADO 2026-06-10 — M0 fechado.** Próxima frente: #21 (placement de tarefas na destilação). Branch `fix/smoke-tests-and-others` pronto para PR/merge (decisão Carlos).
- App local: `http://localhost:2500`; Supabase local esperado em `npm run db:status` (`mem-vector`, portas 560xx).
- Ultima validação 2026-06-10: `npm run verify` (36 files / 226 tests), `npx playwright test e2e/home.spec.ts` e `npm run build` verdes.
- Smokes: TODOS fechados (Explorer/`[[` 2026-06-09; destilação pós-chat 2026-06-10). Backlog separado, não bloqueante: share no header (`5.1`). Animação do grafo (`9.3`) FEITA 2026-06-10 (timelapse cronológico à Obsidian).
- Antes de mexer: `git status --short`, reler esta secção e o issue #19 com comentários (o relay de diagnóstico vive lá).

## Em Progresso

- [x] **Destilacao pos-chat duravel** — job durável ✅; intenção declarativa = facto ✅ (`chat.intencao.ts`); janela de conversa ✅; update>create por id ✅; contrato de estilo no prompt ✅ (re-smoke pendente). ✅ 2026-06-10 — #19 fechado com todos os critérios provados (1 create + 2 updates, prosa wiki, trivial sem escrita, proveniência agent/user, RAG em sessão nova). Placement de tarefas → #21. Ref: `src/modules/chat/chat.turno.ts`, `src/modules/chat/chat.actions.ts`, `src/modules/knowledge/knowledge.continuar.ts`.

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
Fatias anteriores (jobs duráveis, transações/RPC, identidade por id, paths Obsidian, driver CLI, projector, chunks de chat): ver git history deste ficheiro.

## Notas

- Branch atual: `fix/smoke-tests-and-others` (WIP de várias sessões por commitar — commit em blocos lógicos é o fecho do M0).
- Histórico de validações por fatia e relatório de audit 2026-06-07 (8 pontos, todos resolvidos): ver git history deste ficheiro.
