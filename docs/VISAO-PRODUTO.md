# Visão de Produto — o vault como web app

> **O produto é o vault MythosEngine, transposto para a web.** A pasta
> `~/MythosEngine` não é inspiração — é a **especificação viva** (recursive
> construction). O que fazemos *aqui* (esta sessão é a prova) é o que a app tem de
> fazer. Capturado do brain-dump do Carlos em 2026-06-03.

## A tese

**"Falas → o agente escreve o estado."** O humano conversa; o agente é o **autor**
de tasks, dailies, decisões, conhecimento e ficheiros. O fosso é a acumulação de
contexto personalizado. Hoje o chat **responde**; falta-lhe **autorar** — é esse o
salto.

## O que o vault já faz (= os requisitos)

- **`index.md` = catálogo** (1 linha por página). O agente lê isto **primeiro**
  para orientar barato antes de abrir ficheiros grandes. É o mapa + a porta do RAG.
- **Tipos de ficheiro:** log da conversa, **Daily Notes** (recaps por sessão),
  **`decisions/`** (registo append-only, prioritário), **`knowledge/`**,
  **`projects/`**, **`context/`**, **`references/`**.
- **`CLAUDE.md`/`AGENTS.md` = instruções de operação** — o "step invisível" que
  condiciona o agente no arranque (voz, convenções, o que gravar, como orientar).
- **Cada troca deixa rasto:** algum ficheiro é criado/editado por interação.
- **Grafo:** wikilinks + headings; importância por **número de backlinks** (mais
  ligado = mais importante).

## Os pontos do Carlos (a reter)

1. **RAG preferencial, não exclusivo.** O vetorial **sobrepõe-se e conduz** a LLM,
   mas a LLM **nunca fica refém**: "o que é Lisboa?" deve ser respondido mesmo sem
   estar no vetorial. → mudar o system prompt do chat de *RAG-only* para
   **RAG-preferred + LLM-fallback** (o contexto pessoal pesa, mas não tranca).
2. **Regras de organização de ficheiros** (o doc `LLM Wiki` do vault, à Karpathy)
   governam o que se cria/edita por troca — como no MythosEngine.
3. **Equivalente do `CLAUDE.md` na web:** instruções de operação por
   user/workspace que condicionam o agente (o step invisível).
4. **O agente cria tarefas** a partir da conversa (como aqui).
5. **O agente acrescenta recaps às Dailies** (como aqui).
6. **Memória-réplica talvez dispensável:** nasceu para o lint do grafo. Prioridade
   = as **`decisions/`** (ler + respeitar + manter reduzido). Repensar o mirror.
7. **Headings `###` como links entre ficheiros** para o mapa "neuronal";
   contabilizar os mais importantes pelos que têm mais incidências (backlinks).

## Cortes possíveis (o Carlos cruzou-os com B/C)

- **Motor agente-autor** (o fosso): o agente decide criar/editar ficheiros por troca.
- **Simulador de tipos de ficheiro (B):** log total da conversa (habitual nas
  LLMs), Daily com recaps, ficheiros de conhecimento/decisões.
- **Ficheiros de arquitetura + index (C):** docs sobre a arquitetura inicial e como
  escalar criando novos — o que **atualiza o `index`**.
- **Embeddings editáveis por humanos** ("ouro sobre azul"): a virtualização do
  embedding em **texto humano**, também **editável** pela pessoa. (O Carlos: "deixo
  fazer 98% do controlo, mas vou sempre rectificar.")
- **CLAUDE.md-equivalente** por workspace.
- **Grafo** por headings/links + backlink-count.

## Princípio operativo

> "Passar o funcionamento que temos aqui, e fazê-lo na web." Sempre que houver
> dúvida do que a app deve fazer, **olhar para o que o vault/CLAUDE.md já faz** — é
> a resposta. (E o Carlos inventaria o que possa estar a esquecer da pasta
> MythosEngine.)

## Primeira slice proposta

**Motor agente-autor v1 — o agente cria uma task a partir da conversa** (ponto 4):
dizes "cria uma tarefa para X" no `/chat` e o agente **escreve-a** (reusa a tabela
`tarefas`), em vez de seres tu no form. É a coisa mais pequena que **prova o fosso**
e é o mecanismo que tudo o resto reusa (recaps, ficheiros). A seguir: recap
automático na daily (ponto 5) → tipos de ficheiro (B) → RAG-preferred (ponto 1) →
embeddings editáveis. Liga a [VISAO-UX.md](./VISAO-UX.md) (a casca onde isto vive).
