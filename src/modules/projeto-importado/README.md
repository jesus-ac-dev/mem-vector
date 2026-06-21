# Módulo `projeto-importado`

Importa um repo ligado (módulo GitHub) para o vault como **projeto local**: a porta
entre o repo no GitHub e o working copy na máquina + a sua presença no explorer.

## O fluxo (Definições > GitHub)

Cada repo ligado é `{ repo: "owner/nome", path?: "<path local>" }`. Na UI, à frente da
checkbox há o **input do path** e um botão **Testar** (`prepararProjeto` no modal):

1. **Testar** (`testarProjetoLocal`, `src/lib/github.ts`) — o path local é um repo git
   com o `origin` a apontar ao repo ligado? (puro: `buildRemoteCheckArgs` + `remoteBate`).
2. Se o teste falha → **clonar** (`clonarProjeto` = `gh repo clone` com o `GH_TOKEN` do
   user) para esse path.
3. Com o projeto presente → **importar** (`importarProjetoCom`): garante a **pasta** do
   projeto (reusa `resolverProjetoCom` — projeto = pasta real) e escreve lá uma **nota de
   resumo** (`construirNotaResumo`) com header `repo remoto + path local` + o que faz. A
   nota é vectorizada como as outras (projector pós-escrita) → entra no **RAG** e nos
   **wikilinks**.

## Porquê assim

GitHub = a verdade do repo; o vault guarda o **ponteiro navegável** (pasta + nota) e o
path local onde o working copy vive. O orchestrator do relay (fase seguinte) trabalha
contra esse path já preparado — não clona por-issue.

## Ficheiros

| Ficheiro                        | Responsabilidade                                           |
| ------------------------------- | ---------------------------------------------------------- |
| `projeto-importado.service.ts`  | `construirNotaResumo` (puro) + `importarProjetoCom` (pasta + nota) |
| `src/lib/github.ts`             | `testarProjetoLocal` / `clonarProjeto` + arg-builders puros |
| `definicoes.actions.ts`         | `testarProjeto` / `clonarProjetoGithub` / `importarProjeto` |
