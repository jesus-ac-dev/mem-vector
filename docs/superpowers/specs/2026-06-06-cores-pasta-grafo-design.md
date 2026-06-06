# Cores de pasta + dailies no grafo — design

> Brain-dump do Carlos (2026-06-06): dar significado visual aos nós do grafo —
> distinguir a "bola" de uma daily das notas do Projeto A vs Projeto B. A cor vive
> na pasta; um ícone de config no grafo mapeia pasta → cor; os nós ganham a cor. E
> marcar a pasta no explorer também. Construído no branch `integra/file-explorer-stack`.

## Estado atual

- `folders.color` (text null) **já existe** (migration `20260606160000_folders.sql`)
  e já flui até à árvore (`listarPastas` → `Pasta.color` → `folders.tree`). Não há
  UI para a definir nem para a usar.
- O grafo (`workspace-graph.tsx`, do PR #16) colore com `nodeAutoColorBy: 'group'`
  e só mostra nós **knowledge** (`grafoDadosCom` busca só `knowledge`). As **dailies
  não aparecem** no grafo.
- As **dailies não geram `edges`** (só `escreverNota` gera; BD confirma: 19 edges,
  todas `from_type=knowledge`). As dailies têm `[[links]]` no `content_md`.
- `profiles` existe (`profiles.id`, `profiles.display_name`).

## Decisões (brainstorm 2026-06-06)

- **Dailies no grafo: ligadas.** Gerar `edges` ao gravar um daily (parsear `[[links]]`).
- **Cor das dailies: configurável**, persistida em `profiles.daily_color` (BD —
  coerente com `folders.color`, sincroniza entre dispositivos; localStorage ficaria
  preso a um browser).
- **Seletor: paleta fixa** (~8 cores curadas, distinguíveis no grafo) + cinza default.
- **Sem herança:** cada pasta pinta só as suas notas diretas; subpasta/raiz sem cor
  = cinza default.

## Modelo de cor

- **Paleta** (constante partilhada `src/lib/cores.ts`): ~8 cores, cada uma com
  `label` (para a UI) e `hex` (escolhidos para contraste no grafo) + `DEFAULT` cinza.
- **O que se guarda: o hex.** `folders.color` e `profiles.daily_color` guardam o
  valor hex (ex.: `#3b82f6`); o grafo/explorer usam-no direto. A paleta só restringe
  a escolha na UI (e marca qual está ativa por igualdade de hex).
- **Pasta:** `folders.color` → uma nota knowledge recebe a cor da sua pasta
  (`folder_id` → `folders.color`); sem pasta ou pasta sem cor → default.
- **Daily:** `profiles.daily_color` (BD, nova coluna text null). Todas as dailies
  partilham esta cor; null → cor de daily predefinida.

## Edges de daily (backend novo, DRY)

Hoje `escreverNotaCom` gera edges inline (apaga as antigas da nota + insere as novas
a partir de `parseWikilinks(content) + links`). Extrair essa lógica para um helper
partilhado e usá-lo também no daily:

- **`regenerarEdgesCom(db, { ownerId, fromType, fromId, alvos })`** (em
  `src/modules/knowledge/edges.ts`, novo): apaga edges `(owner, fromType, fromId)` e
  insere uma por alvo (`to_slug`, resolve `to_id`/`to_type` em `knowledge` se existir).
  `escreverNotaCom` passa a chamá-lo (refactor com testes — caminho crítico).
- **`substituirDailyCom`** (`daily.service.ts`) passa a chamar
  `regenerarEdgesCom(db, { ownerId, fromType: 'daily', fromId: daily.id, alvos: parseWikilinks(contentMd) })`
  depois de gravar/reindexar.
- **Limite v1:** os alvos resolvem em `knowledge`; `[[2026-…]]` (daily→daily) fica
  pendente (`to_id` null) e é omitido do grafo. Documentado.

## Grafo

- **`grafoDadosCom`** passa a devolver:
    - nós **knowledge** (não arquivadas) com `color` resolvida (folder_id → folders.color, senão default);
    - nós **daily** com `color = profiles.daily_color` (ou default daily);
    - arestas: `edges` com `from_type in ('knowledge','daily')` e `to_id` resolvido (ambos os extremos têm de ser nós conhecidos — filtro `idsValidos` já existente, agora sobre o conjunto knowledge+daily).
- **`workspace-graph.tsx`:** troca `nodeAutoColorBy: 'group'` por `nodeColor` (cada nó traz `.color`).

## Modal de config (ícone no grafo)

- Ícone (`Palette`/`Settings`) na barra de controlos do grafo (junto ao toggle 2D/3D + animate).
- Modal lista: cada **pasta** (nome + linha da paleta clicável, marca a cor atual) + uma linha **"Daily Notes"** (paleta). Clicar numa cor:
    - pasta → action `definirCorPasta(folderId, cor)` (`update folders.color`);
    - daily → action `definirCorDaily(cor)` (`update profiles.daily_color`).
    - depois `router.refresh()` para o grafo/explorer relerem.
- Componente `src/components/layout/grafo-config.tsx`.

## Explorer

- `FolderNode` mostra a cor da pasta: uma bolinha (ou o ícone `Folder` pintado) antes
  do nome, usando `no.pasta.color` (já disponível na árvore). Sem cor → ícone neutro.

## Provas

- **Unit (puros):** paleta (`cores.ts` — resolver cor por nome/null→default);
  `regenerarEdges` (já testável: dados os alvos, que edges produz) — ou via headless.
- **Headless `cores`** (à la `folders-ops`, sob sessão RLS):
    1. criar pasta + cor (`definirCorPastaCom`) + nota nessa pasta → `grafoDadosCom` devolve o nó knowledge com a cor da pasta;
    2. gravar daily com `[[<nota>]]` → edge `from_type=daily` criada; `grafoDadosCom` devolve o nó daily ligado e com `daily_color`;
    3. nota sem pasta → cor default.
- `verify` + `build` verdes; `docs/FOLDERS.md` + doc do grafo atualizados; cycle-gate (`Audit:`).

## Riscos / limites

- **Refactor do `escreverNota`** (extrair `regenerarEdges`): caminho crítico; coberto
  por testes existentes (`author-update`, `kernel-knowledge`) + os novos.
- Links **daily→daily** ficam pendentes no v1 (omitidos do grafo).
- Paleta fixa: se uma cor não tiver bom contraste no tema escuro/claro, ajustar os hex.
- A cor do daily é única para todas as dailies (não por mês/projeto) — coerente com
  "distinguir a categoria daily", não sobre-desenhar.

## Fora de scope

- Cor configurável para "knowledge sem pasta" (fica default).
- Cores por sub-tipo, gradientes, ou cor por nota individual.

## Links

[[mem-vector]] · `docs/FOLDERS.md` · `docs/superpowers/specs/2026-06-06-grafo-design.md` · `docs/superpowers/specs/2026-06-06-file-explorer-folders-design.md`
