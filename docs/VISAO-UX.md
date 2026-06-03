# Visão UX — para onde vamos

> O norte da interface do mem-vector. Não é para construir já — é o destino que
> as slices vão aproximando. Registado no brainstorm de 2026-06-03.

## A imagem-alvo: um workspace tipo Obsidian, mas os agentes são os autores

O mem-vector é um **workspace multi-pane** estilo Obsidian. O humano fala; os
**agentes escrevem** o estado (chat, tasks, daily, conhecimento, ficheiros). A UI
serve a acumulação de **contexto personalizado** — o fosso do produto.

Auto-referência honesta: o próprio Obsidian do Carlos (com a nossa conversa, o hub
`MythosEngine`, o graph e o calendário em panes lado a lado) **é** a UX-alvo. O
vault é a primeira instância do produto — ver `recursive-construction` na memória.

## Componentes da visão

- **Rail de ícones** fino à esquerda — troca de modo/painel (Chat, File Explorer,
  Tasks, …).
- **Painel secundário** (tipo a árvore de ficheiros do Obsidian): lista do modo
  ativo — Chats History, árvore do File Explorer, lista de Tasks.
- **Panes tiláveis** na área principal: abres uma task/chat/ficheiro/graph e ele
  ocupa um **pane**, ao lado dos outros; arranjas o espaço (split, tile, foco) como
  no Obsidian. Guardar o arranjo é parte do motor.
- **Header:** logo+nome · search ao meio · profile dropdown (perfil + logout).
- **Responsivo:** mesma estrutura no telemóvel (um pane de cada vez).

## Porque NÃO o construímos já

O motor de panes (split/tile/arrastar/estado/foco) é um **subsistema com peso
próprio**, e panes só valem com **conteúdo para encher** (File Explorer, várias
notas, graph) — que ainda não existe. Construí-lo com só Chat+Tasks para lá meter
é o telhado antes das paredes. Por isso:

- A **slice 1** monta o esqueleto (header + rail + **uma** área de conteúdo),
  **desenhada para crescer**: essa área é o futuro *host* dos panes.
- O **motor de panes** é uma slice própria, depois de existir File Explorer + mais
  views.

## Theming — design tokens, não SCSS

Um "tema" é o conjunto de **design tokens**: cor, spacing, escala de tipos,
font-families, radius, sombras. A via é **CSS variables trocadas por `data-theme`**
no `<html>` (runtime, sem reload), **não** ficheiros SCSS por tema.

- **Já feito:** cores + radius como CSS vars (`globals.css`); o eslint Visual
  Identity Guard bane cores cruas → tudo passa por tokens (foi isto que tornou o
  theming quase de graça).
- **Próximo ganho fácil:** `--font-sans`/`--font-mono` (font-family).
- **Adiado:** spacing/font-size themáveis em runtime exigem mapear as escalas do
  Tailwind para `var()` — só quando houver necessidade (modos de densidade).
- **Gancho:** `profiles.theme` (criado na slice 1) guarda a escolha por-utilizador.

## Tarefa-âncora

Ver o hub do projeto no vault (`projects/mem-vector/`) para a task diferida do
workspace multi-pane e do theming switcher.
