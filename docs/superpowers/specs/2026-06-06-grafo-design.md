# Grafo do workspace — design

> Spec da vista de grafo (degrau 4, "prettify"). Substitui o placeholder
> "Grafo 2D/3D — em breve" no rodapé da sidebar esquerda.

## Objetivo

Ver o conhecimento como grafo navegável: **nós = notas knowledge**, **arestas =
wikilinks** (`[[...]]`, da tabela `edges`). Clicar num nó abre a nota. Toggle
**2D/3D** (2D default). Configuração: cores por grupo + botão **animate**.

## Dados

Nova server action `grafoDados()` → `{ nodes, links }`:

- `nodes`: `{ id, slug, title, group }` — uma por nota knowledge do utilizador
  (`from listarKnowledge` / tabela `knowledge`). `group` = grupo para cor (ver
  abaixo).
- `links`: `{ source, target }` — uma por edge `from_type='knowledge'` com
  `to_id` não-nulo (wikilink para nota existente). `source = from_id`,
  `target = to_id`.
- **Links quebrados** (`to_id null`) **omitidos no v1** (nó-fantasma fica para
  depois — evita poluir o grafo com slugs inexistentes).
- Tudo via sessão RLS (só o grafo do próprio utilizador).

## Cor por "pasta"

Hoje não há hierarquia de pastas real — o explorer tem só dois grupos
(**Knowledge** / **Daily**). Como o grafo é só de knowledge, no v1 a cor é por
um campo `group` que arranca **constante** ("knowledge"); o modal de
configuração deixa **escolher a cor desse grupo**. Quando existirem pastas reais,
`group` passa a ser a pasta e o modal cresce para N cores. Cor guardada em
`localStorage` no v1 (sem schema novo).

## UI — a área do grafo (rodapé da sidebar esquerda, onde está o placeholder)

```
┌─ área do grafo (h-80) ───────────────────────┐
│ [2D|3D]                         [⚙]  [▶ animate]│  ← barra de controlos
├──────────────────────────────────────────────┤
│                                              │
│            (force-graph 2D/3D)               │
│                                              │
└──────────────────────────────────────────────┘
```

- **topo-esquerdo:** toggle **2D / 3D** (2D default).
- **direita:** **⚙** abre um **modal pequeno** de configuração (cores por grupo);
  **▶ animate** re-aquece a simulação de forças (re-corre a animação de layout).
- Corpo: o force-graph. Clicar num nó → `abrirFicheiro` + `/chat` (como o
  explorer e a barra direita).

## Biblioteca

**`react-force-graph`** (vasturiano): `react-force-graph-2d` (canvas) e
`react-force-graph-3d` (three.js) partilham a mesma API de dados → o toggle 2D/3D
é trivial. Suporta cor por nó, clique, e re-aquecer a simulação (animate).
Client-only → `dynamic(() => import(...), { ssr: false })`.

- **Trade-off:** o 3D puxa three.js (pesado). Aceitável para esta vista; carrega
  só quando o utilizador escolhe 3D (import dinâmico).
- **Alternativa rejeitada:** d3-force + canvas próprio — mais leve mas só 2D, e
  o Carlos quer 2D **e** 3D.

## Fatias (PRs)

1. **Core (esta fatia):** `grafoDados()` + force-graph **2D** no rodapé, nós
   coloridos (cor única), clique abre a nota. Prova lib + dados + integração.
2. **Toggle 2D/3D** (topo-esquerdo, import dinâmico do 3D).
3. **Modal de config** (direita): cor por grupo (localStorage) + botão **animate**.

## Testes

- `grafoDadosDe(db)` (Com): prova headless — duas notas ligadas dão 1 link com
  `source`/`target` certos; nó por nota; link quebrado omitido.
- UI valida-se pelo smoke do Carlos (canvas/WebGL não é unit-testável).

## Fora de scope (v1)

- Nós-fantasma para links quebrados; pastas reais; cor persistida em BD;
  grafo fullscreen/pane próprio; daily no grafo; filtros/pesquisa no grafo.
