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

## Estado

Feito: modelo, criar pasta ("Nova pasta", `window.prompt` v1), explorer em árvore,
**drag-drop** (arrastar nota → pasta, ou para a secção Knowledge = raiz;
`moverNota` muda `folder_id`), **renomear pasta** (duplo-clique, `renomearPasta`).
**Por fazer:** renomear nota, criar-nota-dentro-de-pasta, arquivo, cor de pasta na
UI, `[[` autocomplete. Ver
`docs/superpowers/specs/2026-06-06-file-explorer-folders-design.md`.
