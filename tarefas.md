# tarefas

Ultima atualizacao: 2026-06-22

## Retoma rapida

- Branch: `feat/issue-150`.
- Objetivo ativo: **#19 FECHADO 2026-06-10 — M0 fechado.** Próxima frente: #21 (placement de tarefas na destilação). Branch `fix/smoke-tests-and-others` pronto para PR/merge (decisão Carlos).
- App local: `http://localhost:2500`; Supabase local esperado em `npm run db:status` (`mem-vector`, portas 560xx).
- Ultima validação 2026-06-22: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:run` (81 files / 635 testes), `npm run build` e smoke dev tema+calendário verdes.
- Smokes: TODOS fechados (Explorer/`[[` 2026-06-09; destilação pós-chat 2026-06-10). Backlog separado, não bloqueante: share no header (`5.1`). Animação do grafo (`9.3`) FEITA 2026-06-10 (timelapse cronológico à Obsidian).
- Antes de mexer: `git status --short`, reler esta secção e o issue #19 com comentários (o relay de diagnóstico vive lá).

## Em Progresso

- [x] **Destilacao pos-chat duravel** — job durável ✅; intenção declarativa = facto ✅ (`chat.intencao.ts`); janela de conversa ✅; update>create por id ✅; contrato de estilo no prompt ✅ (re-smoke pendente). ✅ 2026-06-10 — #19 fechado com todos os critérios provados (1 create + 2 updates, prosa wiki, trivial sem escrita, proveniência agent/user, RAG em sessão nova). Placement de tarefas → #21. Ref: `src/modules/chat/chat.turno.ts`, `src/modules/chat/chat.actions.ts`, `src/modules/knowledge/knowledge.continuar.ts`.

## Pendentes — Alta

Sem pendentes de alta prioridade.

## Pendentes — Media

- [ ] **Higienizar ambiente dos runners locais** — `next build` falha com falso negativo se a shell herdar `NODE_ENV=development` e variáveis internas `NEXT_PRIVATE_*`; validar scripts/relay com ambiente limpo antes de correr build. Ref: `package.json`.

## Pendentes — Baixa

- [ ] **Alinhar docs/skills de stack sem React Hook Form** — depois de remover a dependência directa, o padrão "Forms = RHF + Zod" continua escrito como instrução **operativa** nas skills que os agentes seguem antes de construir forms: `.claude/skills/padroes-ui.md` e `.codex/skills/padroes-ui/SKILL.md` (ambas mandam `@hookform/resolvers/zod`). O próximo form seguiria a skill e importaria deps já fora do `package.json` — partia. Prioridade: as duas skills (são prescritivas); depois as menções descritivas em `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/GRUPOS-PROTECTED.md` e `docs/AUTH-E-SHELL.md`. Decisão do humano: ou reintroduzir RHF+resolvers quando houver forms novos, ou trocar o padrão por `Form` shadcn nativo/estado próprio e actualizar skills+docs em conjunto. Ref: `.claude/skills/padroes-ui.md`, `.codex/skills/padroes-ui/SKILL.md`, `CLAUDE.md`.
- [ ] #mem-vector Automatizar regressão FilePane login+abrir ficheiro: e2e permanente para abrir `Arquivo FP 85142`/nota seeded, confirmar `GET /api/file` 200 e zero `window.__MEM_VECTOR_ERRORS__`. 🔽 ➕ 2026-06-09 🆔 mem-vector-filepane-smoke-e2e-20260609

## Concluidas Recentemente

- [x] **Ponytail audit: dependências directas removidas**: removidas `react-hook-form`, `@hookform/resolvers` e `date-fns` de `dependencies`; lockfile regenerado; `date-fns` fica apenas transitiva de `react-day-picker`. Validado em 2026-06-22 com format/lint/typecheck/Vitest 635/build e smoke dev tema+calendário. Ref: `package.json`, `package-lock.json`.
- [x] **Chat trace — provider/modelo auditável** — cada resposta guarda `provider`, modelo pedido, modelo efetivo, latência, custo e fontes em `messages`; o chat mostra um chip junto à textarea e um inspector lateral com timeline da conversa. Divergência de modelo aparece como aviso informativo, sem bloquear a resposta. Ref: `src/modules/chat/chat.service.ts`, `src/modules/chat/chat.actions.ts`, `src/modules/chat/chat.conversas.ts`, `src/components/layout/chat-content.tsx`, `supabase/migrations/20260612230000_messages_model_trace.sql`.
- [x] **Chat composer — controlos inline** — o chip do trace e a escolha de provider/modelo/esforço passaram para uma faixa inline debaixo da textarea; a mini-modal de escolha deixou de ser usada no composer. Rótulos do inspector afinados: `modelo pedido`, `modelo efetivo` e `não reportado pelo provider`. Ref: `src/components/layout/chat-content.tsx`, `src/modules/chat/chat.trace.ts`.
- [x] **Kanban — refresh após tarefas criadas pelo chat** — loaders do kanban e do painel de tarefas ignoram respostas antigas fora de ordem, evitando que um load stale sobrescreva a lista nova depois da destilação criar tarefas. Ref: `src/components/layout/kanban-board.tsx`, `src/components/layout/tarefas-panel.tsx`.
- [x] **FilePane — leitura de ficheiro por API estável** — o pane deixou de depender de Server Action chamada em `useEffect` para carregar conteúdo; nova rota `GET /api/file` devolve knowledge/daily por `id` quando existe, mantendo `lerFicheiro` como compatibilidade. Adicionado retry/helper testado para erro transiente de Server Action e smoke autenticado sem logs client-side. Ref: `src/app/api/file/route.ts`, `src/modules/workspace/workspace.files.ts`, `src/components/layout/file-pane.tsx`, `src/lib/client-error-log.test.ts`.
- [x] **Client error logging** — adicionado log estruturado para `error`/`unhandledrejection` e wrapper `runClientAction` nas server actions/handlers async principais. Logs saem como `[mem-vector/client-error]` e ficam em `window.__MEM_VECTOR_ERRORS__` para debug rápido. Ref: `src/lib/client-error-log.ts`, `src/components/layout/client-error-listener.tsx`.
- [x] **Explorer — smokes de árvore fechados** — headers `16px`, itens de 1.º nível `36px`, filhos `64px`; criar pasta/nota abre `Knowledge` ou pasta selecionada quando collapsed; pasta selecionada usa border e ficheiro selecionado usa background; drag/drop move notas e pastas entre pastas/raiz; drop no Archive marca a pasta/subpastas como arquivadas, arquiva as notas descendentes e não devolve ficheiros à raiz. Ref: `src/components/layout/file-explorer.tsx`, `src/components/layout/workspace-shell.tsx`, `src/modules/folders/folders.service.ts`.
- [x] **Identidade por id + paths Obsidian / `[[` fechados** — tabs, explorer, grafo, editor, histórico, guardar e fontes do chat usam `id` quando disponível; `slug` de knowledge é único por pasta; `[[` com paths/homónimos/chooser/criação na pasta atual foi aceite como fechado nos smokes de 2026-06-09. Ref: `src/components/layout/workspace-context.tsx`, `src/modules/knowledge/knowledge.links.ts`, `src/modules/workspace/wikilink-autocomplete.ts`, `supabase/migrations/20260607203000_folder_scoped_knowledge_slugs.sql`.
- [x] **Correções pós-smoke do workspace** — removido o console error ao alternar arquivados; header do explorer reordenado e sem ações de criar em modo arquivados; chat icon só fica selected quando o chat está aberto; arquivar ganhou confirmação e estado visual; repor usa estado visual de sucesso; nome da nota passou a vir do primeiro `#` do markdown com validação no guardar; duplo-clique no explorer volta como atalho que altera esse H1; criar pasta passa a respeitar a pasta selecionada; drag/save/archive notificam explorer/sidebar/grafo; `[[` mostra caminho e insere alvo com path para homónimos; links com path resolvem o destino certo; notas criadas por `[[` nascem na pasta atual; grafo 2D ganhou links mais visíveis, tamanho por grau e destaque do nó ativo; título de conversa ficou resumido; prompt deixou de sugerir Obsidian/CLI; UI mostra `jobId` curto enquanto a destilação corre. Ref: `src/components/layout/*`, `src/modules/workspace/workspace.actions.ts`, `src/modules/knowledge/knowledge.links.ts`, `src/modules/chat/*`.
Fatias anteriores (jobs duráveis, transações/RPC, identidade por id, paths Obsidian, driver CLI, projector, chunks de chat): ver git history deste ficheiro.

## Notas

- Branch atual: `feat/issue-150` em `38d20df` (WIP de várias sessões por commitar — commit em blocos lógicos é o fecho do M0).
- Histórico de validações por fatia e relatório de audit 2026-06-07 (8 pontos, todos resolvidos): ver git history deste ficheiro.
