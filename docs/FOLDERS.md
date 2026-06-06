# Pastas (file explorer)

Modelo de pastas reais para o knowledge. Notas vivem opcionalmente numa pasta;
o Daily fica de fora (grupo à parte no explorer).

## Dados

- **`folders`** (`migrations/20260606160000_folders.sql`): `id`, `owner_id`,
  `name`, `parent_id` (null = raiz, FK self, `on delete cascade`), `color` (para
  as cores do grafo, ainda não usada na UI), `created_at`. RLS por dono. Nome
  único por nível (`owner_id` + `parent_id` + `lower(name)`).
- **`knowledge.folder_id`** (uuid null → raiz; FK `folders`, `on delete set
null`): apagar uma pasta devolve as notas à raiz.

## Código

- `src/modules/folders/folders.service.ts` — `criarPasta`/`listarPasta` (+ `Com`
  para sessão injetada). Server action `novaPasta` em `workspace.actions.ts`.
- `src/modules/folders/folders.tree.ts` — **`construirArvore(pastas, notas)`**:
  função pura que monta a árvore (pastas aninhadas por `parent_id`, notas por
  `folderId`, órfãos na raiz, ordenado por nome). Testada em `folders.tree.test.ts`.
- `(app)/layout.tsx` constrói a árvore (server) e passa-a ao `WorkspaceShell` →
  `file-explorer.tsx`, que a renderiza recursivamente.

## F4 — `[[` autocomplete (fatia 3)

No editor de notas (`<NotaEditor>`, usado pelo `file-pane.tsx`), escrever `[[`
abre um dropdown que filtra notas enquanto escreves.

- **Fonte cross-type:** `listarNotasLinkaveis` (`workspace.actions.ts`) agrega
  knowledge (já sem arquivadas) + dailies. Tipos futuros entram aqui.
- **Lógica pura:** `wikilink-autocomplete.ts` — `detetarGatilho(texto, cursor)`
  (deteta o `[[` aberto e o termo) e `filtrarNotasParaLink(notas, termo)`
  (substring, knowledge antes de daily, limitado). Testada (TDD).
- **Resolvedor por data:** `alvoParaHref` (`knowledge.links.ts`) — alvos com cara
  de `YYYY-MM-DD` resolvem para `/daily/<data>`, o resto para `/knowledge/<slug>`.
  Usado por `preprocessWikilinks` (`markdown.tsx`). É o que permite `[[2026-…]]`.
- **Criar «termo»:** última linha do dropdown cria a nota (`criarNotaComTitulo`)
  e insere o link.
- Teclado: ↑/↓ navega, Enter/Tab insere, Esc fecha.

## F5 — arquivar (fatia 3)

- **Schema:** `knowledge.archived` (`migrations/20260606170000_knowledge_archived.sql`),
  `boolean not null default false` + índice parcial `where archived = false`.
- **Sair da memória ativa:** `arquivarNota` marca `archived=true` e **apaga os
  chunks** (sai do RAG); `reporNota` põe `archived=false` e **reindexa** (volta).
  `listarKnowledge` filtra `archived=false` (explorer + dropdown do `[[`);
  `listarArquivados` traz só as arquivadas. Versões e edges mantêm-se (auditoria).
- **UI:** botão Arquivar no `file-pane.tsx` (arquiva + fecha a tab); toggle no
  header do explorer (`workspace-shell.tsx`) que troca a árvore pela
  `ArquivadosLista` (cada nota com **Repor**).
- **Prova:** `npm run arquivo` (headless, 6 eixos).
- **Esconder do grafo:** `grafoDadosCom` filtra `.eq('archived', false)` — aplicado
  na integração da stack (branch `integra/file-explorer-stack`), onde o grafo (#16)
  e o arquivar (#17) coexistem. As arestas para arquivadas caem pelo filtro
  `idsValidos`. (No branch `feat/folders` isolado não existe `grafoDadosCom`.)

## Criar nota dentro de pasta

- **Seleção de pasta:** clicar numa pasta no explorer seleciona-a (destaque) e
  mantém o expandir/colapsar; clicar no cabeçalho "Knowledge" desseleciona (raiz).
  Estado `pastaSelecionada` no `LeftSidebar` (`workspace-shell.tsx`), passado ao
  `FileExplorer` via `Ops` (`selecionarPasta`/`selecionadaId`).
- **Nova nota:** o botão "Nova nota" do header cria na pasta selecionada (ou na
  raiz se nenhuma) via `criarNotaNaPasta(folderId)` = `criarNotaVazia` +
  `moverNota`. Abre em editor + refresh. (A seleção não persiste em refresh — v1.)

## Edição inline (sem `window.prompt`)

Criar pasta, renomear pasta e renomear nota usam um `InlineInput` na própria
árvore (componente em `file-explorer.tsx`): autofocus + seleciona o texto, **Enter**
confirma, **Esc** cancela, **blur** confirma. Nova pasta mostra o input no topo da
secção Knowledge (estado `criandoPasta` no `LeftSidebar`); renomear entra em modo
edição no nó (duplo-clique). Substitui os `window.prompt` do v1.

## Cores (pasta + grafo)

Dar significado visual aos nós do grafo por categoria. Spec:
`docs/superpowers/specs/2026-06-06-cores-pasta-grafo-design.md`.

- **Paleta** (`src/lib/cores.ts`): ~8 cores (hex) + `COR_DEFAULT` (cinza) +
  `COR_DAILY_DEFAULT`. `resolverCor(hex, fallback)` resolve null→fallback.
- **Onde fica a cor:** pasta → `folders.color`; daily → `profiles.daily_color`
  (migration `20260606180000`). Guarda-se o **hex**. **Sem herança:** cada pasta
  pinta só as suas notas diretas; sem pasta/cor → default.
- **Edges de daily:** `regenerarEdgesCom` (`knowledge/edges.ts`, partilhado com
  `escreverNotaCom`) é chamado também em `substituirDailyCom` → as dailies ligam-se
  às notas no grafo. Limite v1: alvos resolvem em knowledge; daily→daily fica pendente.
- **Grafo:** `grafoDadosCom` une nós knowledge (cor da pasta) + dailies (cor daily)
    - arestas (`from_type` knowledge/daily); `workspace-graph` pinta por `nodeColor`;
      clicar num nó daily abre o daily.
- **Modal** `grafo-config.tsx` (ícone Palette no grafo): paleta por pasta + "Daily
  Notes"; grava via `definirCorPastaAction`/`definirCorDailyAction`.
- **Explorer:** a pasta com cor mostra uma bolinha (em vez do ícone Folder).
- **Prova:** `npm run cores` (headless, 3 eixos).

## Estado

Feito: modelo, criar pasta, **criar nota dentro de pasta** (pasta selecionada +
Nova nota), explorer em árvore, **drag-drop** (`moverNota`), **renomear
pasta/nota** (com reaponte de `[[links]]`), **`[[` autocomplete** (F4),
**arquivar** (F5) e **cores de pasta + dailies no grafo**. As 5 funcionalidades do
file explorer estão fechadas + cores. Ver as specs em
`docs/superpowers/specs/2026-06-06-*`.
