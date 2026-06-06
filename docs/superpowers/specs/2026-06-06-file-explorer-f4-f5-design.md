# File Explorer — F4 `[[` autocomplete + F5 arquivar (fatia 3)

> Fecha as 5 funcionalidades do file explorer. Empilha em `feat/folders`
> (PR #17), a seguir a F0–F3 (criar pasta / mover / renomear). Decisões do
> brainstorm de 2026-06-06. Spec-mãe (decomposição):
> `2026-06-06-file-explorer-folders-design.md`.

## Estado atual

- **3 de 5 feitas:** criar pasta, drag-drop mover nota, renomear (pasta + nota
  com reaponte de `[[links]]`).
- **Faltam F4 e F5**, ambas independentes da fundação de pastas.
- Editor = `<Textarea>` controlado (`file-pane.tsx`, vista `editor`). **Não é
  contentEditable** → autocomplete fica raso (deteta texto antes do cursor,
  insere na posição).
- Já existe botão **Arquivar** placeholder (`file-pane.tsx:250`,
  `onClick={() => {}}`).
- Wikilinks resolvem por `slugify`; `preprocessWikilinks` (`markdown.tsx:15`)
  manda **sempre** para `/knowledge/<slug>`.
- O **grafo** (`grafoDadosCom`) vive em `feat/grafo` (PR #16), **não mergeado** e
  ausente deste branch; faz a sua própria query à `knowledge`.

## Visão que orienta (decisão nova de 2026-06-06)

`knowledge` é o **espaço de notas livre** do utilizador, organizado por pastas
que o utilizador ou o co-autor criam à vontade. Não é uma categoria limitadora;
começou apenas como pasta raiz para arrancar. A engenharia tipada por baixo
(tabela `knowledge` validada por Zod) mantém-se; a **experiência** é "notas +
pastas livres". O `daily` fica grupo à parte (gerado por data) mas **linkável**.
Isto suaviza a ideia de `projects`/`decisions` como tipos separados da spec do
kernel: as pastas dão essa liberdade. (Registar em `decisions/log` no fecho.)

---

## F4 — `[[` autocomplete no editor

### Fonte (cross-type, menos arquivadas)

`listarNotasLinkaveis()` agrega as notas linkáveis:

- `knowledge` de **todas as pastas**, `archived = false`;
- `dailies` (por data).

Função agregadora num sítio só → tipos futuros entram aqui sem tocar no
componente. (Ligar dailies ↔ knowledge é uso real do vault.)

### Deteção do gatilho

No `onChange`/mudança de seleção do `<Textarea>`: olhar para
`rascunho.slice(0, cursor)`, detetar um `[[` aberto **sem** `]]` a fechar e
extrair o termo a seguir. Sem `[[` aberto → dropdown fechado.

### Filtro (puro, TDD)

`filtrarNotasParaLink(notas, termo)`: substring case-insensitive sobre o título
(knowledge) / a data (daily); knowledge primeiro; limita a N (ex.: 8). É o
núcleo testável da feature.

### Dropdown (UI)

- ↑/↓ navega, **Enter**/clique escolhe, **Esc** fecha, clique-fora fecha.
- Ícone distingue `daily` de `knowledge`.
- Última linha **"Criar «termo»"** quando o termo não está vazio e não há match
  exato → cria knowledge via `abrirOuCriarNota` e insere o link.
- Posicionamento: v1 ancora de forma simples ao editor (sem cálculo de
  coordenadas do caret).

### Inserção

Substitui o trecho `[[termo` (do `[[` até ao cursor) por `[[Título]]`
(knowledge) ou `[[YYYY-MM-DD]]` (daily), fecha os colchetes e põe o cursor a
seguir. Resolve por `slugify` (já confirmado).

### Resolvedor (puro, testável)

Estender `preprocessWikilinks` (`markdown.tsx`): alvo que case
`/^\d{4}-\d{2}-\d{2}$/` → `/daily/<data>`; resto → `/knowledge/<slug>`.
`handleInternalLink` já trata ambos os hrefs.

### Fora de scope (F4)

Aliased `[[target|texto]]` (continua fora); posicionamento pixel-perfect do
dropdown; autocomplete no chat (só no editor de notas).

---

## F5 — arquivar

### Schema

Migration: `knowledge.archived boolean not null default false` (índice parcial
`where archived` opcional). Só `knowledge` tem `archived`; `daily` não se
arquiva.

### Ações (server action, validadas)

- `arquivarNota(slug)`: `archived = true` + **apagar os chunks** da nota (sai do
  RAG).
- `reporNota(slug)`: `archived = false` + `reindexEntity` (volta ao RAG).

### Esconder de tudo o que é "ativo"

| Onde | Como | Neste branch |
|---|---|---|
| Explorer + dropdown F4 | `listarKnowledgeCom` / `listarNotasLinkaveis` filtram `archived = false` | **sim** |
| RAG (chat) | chunks apagados ao arquivar | **sim** |
| Grafo | `grafoDadosCom` ganha `.eq('archived', false)` | **não** (vive no #16) → aplicar na integração do merge |

### UI

- **Botão Arquivar** (`file-pane.tsx:250`, placeholder) → `arquivarNota(slug)` →
  fechar a tab + `router.refresh()`.
- **Toggle no header do explorer** (`file-explorer.tsx`, ao lado de "Nova
  pasta"): liga/desliga a **vista de arquivados dentro do próprio explorer**
  (troca a árvore pela lista). Cada linha: título + **Repor** (`reporNota` +
  refresh) + abrir. Voltar a clicar volta à árvore.
- `listarArquivados()`: `knowledge` com `archived = true`.

### Mantém-se

`file_versions` e `edges` intactos (auditoria). Uma nota arquivada continua alvo
de edges existentes, mas não navegável até ser reposta.

---

## Ordem + provas

- **Fatia A (F4):** `filtrarNotasParaLink` (unit/TDD) + `preprocessWikilinks`
  heurística de data (unit) → dropdown no editor → smoke manual (escrever `[[`,
  filtrar, escolher, criar-novo). Sem migration.
- **Fatia B (F5):** migration → `arquivarNota`/`reporNota` (+ apagar/reindex
  chunks) → filtros (explorer/dropdown/RAG) → botão + toggle/lista → headless
  `arquivo`: arquivar tira de `listarKnowledge` + `match_chunks`; repor devolve.
  \+ unit das ações.
- Por fatia: `verify` + `build` verdes; `docs/FOLDERS.md` atualizado; cycle-gate
  (`Audit:` + Docs).

## Riscos / honestidade

- Arquivar apaga chunks (reversível por reindex); repor **re-embeda tudo**. Preço
  de não tocar no RPC `match_chunks`. Aceitável no v1.
- **Esconder do grafo não cabe neste branch** (grafo vive no #16). Tem de ser
  aplicado quando #16/#17 forem integrados — ponto de reconciliação documentado
  (risco de esquecer).
- A heurística de data no resolvedor assume dailies sempre `YYYY-MM-DD` (verdade
  hoje). Um título knowledge que seja exatamente uma data resolveria para daily —
  aceitável (improvável; e o utilizador escolhe do dropdown).

## Links

[[mem-vector]] · `2026-06-06-file-explorer-folders-design.md` · `docs/FOLDERS.md`
