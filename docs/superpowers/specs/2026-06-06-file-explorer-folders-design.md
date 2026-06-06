# File Explorer — pastas e operações de ficheiros

> Brain-dump do Carlos (2026-06-06): criação de pastas, drag-and-drop de
> ficheiros entre pastas, rename de pastas e ficheiros, `[[` com filtro de
> ficheiros no editor, e arquivo de ficheiros. (GitHub/Google Workspace = módulos
> à parte, não contam aqui.)

## Decomposição (são vários subsistemas — não cabe numa spec)

**Estado atual:** não há pastas reais. O explorer (`file-explorer.tsx`) mostra
dois grupos planos (Knowledge / Daily), construídos à mão em `(app)/layout.tsx`.
A tabela `knowledge` não tem coluna de pasta. Logo, três das funcionalidades
exigem uma **fundação** que não existe.

| # | Funcionalidade | Precisa de quê |
|---|----------------|----------------|
| F0 | **Modelo de pastas** (fundação) | tabela `folders` + `knowledge.folder_id` |
| F1 | Criar pasta | F0 |
| F2 | Drag-drop mover ficheiro → pasta | F0 |
| F3a | Renomear pasta | F0 |
| F3b | Renomear ficheiro (nota) | independente (rename do título/slug + propagar edges) |
| F4 | `[[` filtro de ficheiros no editor | independente (listar notas) |
| F5 | Arquivar ficheiros | independente (`archived` flag) |

F0 também **desbloqueia as cores do grafo** (que ficaram diferidas por não haver
pastas).

## Ordem recomendada

1. **Fatia 1 (este branch): F0 + F1 + explorer em árvore.** A fundação. Sem ela,
   nada das pastas existe.
2. Fatia 2: F2 (drag-drop) + F3a (renomear pasta) + F3b (renomear nota).
3. Fatia 3 (independentes, a qualquer altura): F4 (`[[` autocomplete) + F5 (arquivo).

> Alternativa: o **`[[` autocomplete (F4)** é um ganho rápido independente — se
> quiseres um resultado visível já, faço-o primeiro. Mas a fundação (F0)
> desbloqueia o máximo, por isso recomendo-a primeiro.

---

## Fatia 1 — modelo de pastas + criar pasta + árvore (DETALHE)

### Dados

- Nova tabela **`folders`**: `id`, `owner_id`, `name`, `parent_id` (null = raiz,
  FK self), `color` (null; usada depois pelo grafo), `created_at`. RLS por dono.
- **`knowledge.folder_id`** (uuid null → raiz/sem pasta, FK `folders`). RLS já
  existe na `knowledge`.
- Migration nova. Pastas e folder_id são só de knowledge (o Daily fica grupo à
  parte, não entra em pastas).

### Serviço (`src/modules/folders/`)

- `criarPastaCom(db, name, parentId?)` → insere pasta (nome único por
  `owner_id+parent_id`).
- `listarPastasCom(db)` → pastas do utilizador.
- (mover/renomear = fatia 2.)

### Árvore (pura, testável)

- `construirArvore(folders, notas)`: monta a árvore — pastas aninhadas por
  `parent_id`, notas por `folder_id`, **notas sem pasta na raiz**. Função pura,
  **TDD**. É o núcleo testável da fatia.

### UI

- `(app)/layout.tsx` passa a carregar `folders` + `notas` e construir a árvore
  (em vez dos dois grupos hardcoded). O Daily continua grupo separado.
- `file-explorer.tsx` renderiza a árvore **recursiva** (FolderNode aninhado +
  notas), mantendo o padrão atual (Button/tokens, abrir nota ao clicar).
- Botão **"Nova pasta"** (hoje placeholder `onClick={() => {}}`) → pede nome →
  `criarPasta` na raiz → `router.refresh()`. Notas novas nascem na raiz
  (`folder_id null`); pô-las em pastas = drag-drop (fatia 2).

### Testes

- `construirArvore` — pura, TDD (pastas aninhadas; notas na pasta certa; sem
  pasta → raiz; pasta vazia aparece).
- Headless `folders-data`: criar pasta + nota com `folder_id` → a árvore aninha
  certo, RLS isola.

### Fora de scope (fatia 1)

- Drag-drop, rename, arquivo, `[[` autocomplete (fatias 2/3); cor de pasta na UI
  (coluna existe, usa-se no grafo depois); criar-nota-dentro-de-pasta (v1 nasce
  na raiz); pastas para Daily.
