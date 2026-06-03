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

## Review crítica (advogado do diabo) — vault + agentic-kanban

Duas reviews independentes (2026-06-03), com filtro **"isto serve um utilizador normal de um workspace agêntico, ou só o Carlos/um agente num terminal?"** — o ICP do mem-vector é a audiência do *workspace* (produtividade pessoal/equipa), **não** o do crmcredito (mediadoras de crédito); esse é outro projeto.

**Essência a transpor (7 comportamentos, não a textura):** agente-autor (o user só fala) · catálogo lido primeiro (index→drill, a porta do RAG) · recap automático por sessão · conhecimento que engorda e se liga (o fosso) · cada troca deixa rasto num objeto · **decisões append-only (o "porquê")** · bruto-sempre + síntese-julgada.

**A CORTAR (andaime de quem constrói com um agente em terminal):** sintaxe de IDs/`⛔`/estados Kanban (manter o *conceito*, largar a sintaxe) · regra no-orphan/grafo-sem-órfãos (os FKs já ligam) · **mirror de memória** (morto numa só DB — confirma o teu ponto 6) · `/lint`+`/audit` como rituais do user (constraints da DB resolvem 80%) · recap *manual* + raiz-limpa · frontmatter YAML + headers grep-áveis · **os 3Ms / `/level-up`** (metodologia do operador, não feature do cliente).

**Tensões/riscos (onde a transposição engana):**

1. **O maior buraco — falta o equivalente ao `git diff`.** No vault, "o agente edita tudo" só funciona porque o `git diff` é a tua rede de revisão. O cliente não lê diffs. Sem **undo / histórico visível / read-mostly ("isto foi gerado, corrige por chat")**, "agente-autor" = risco de confiança, não feature. **Resolver isto antes do slice 1.**
2. **RAG-preferred mas o "index em prosa" não escala.** O catálogo é um *padrão de recuperação*, não uma feature a copiar literal — a milhares de objetos, o catálogo-texto não chega e o vetorial mal-ancorado mente. (O teu ponto 1 está certo; a implementação é que não é "copiar o index".)
3. **Lock-in honesto.** Fechar os ficheiros em DB É o fosso — e é fricção de venda. Chamar-lhe portabilidade seria mentira.
4. **Bruto-sempre num SaaS multi-tenant** = custo de storage + privacidade (retenção + RLS por user). No vault pessoal é grátis; em produção não transpõe sem política de retenção.
5. **Recursão como armadilha de validação:** N=1 e esse 1 é o autor do sistema. Fluído para ti ≠ o que uma mediadora espera.

**Do agentic-kanban:** herda a **forma plataforma** (núcleo + módulos; o relay é *módulo*, não dia 1) e o **modelo de dados** (linha relacional tipada ↔ conteúdo vetorial, `id`+`edges`, pgvector, RLS). Mas honestidade brutal: o relay-por-comentários **nunca foi construído** (547 linhas, 1 teste; o glossário de 28 termos é vocabulário sem código). **Risco gémeo nos dois:** *vocabulário a galopar à frente do código* — documentar uma plataforma antes de provar o loop. E **o fosso (acumulação de contexto) é uma hipótese ainda não exercitada fim-a-fim uma única vez.**

**"Coisa gira" que vende:** estilo de comunicação configurável (de `references/voice.md`) — "o agente escreve no *meu* tom" é vendável a quem escreve a clientes. Nice-to-have forte, não core.

**Veredito:** a visão é lúcida; o perigo não é falta dela — é transpor a *textura do markdown* achando que é a magia. A magia são os 7 comportamentos. Antes de qualquer slice de ficheiros: **resolver a auditabilidade do que o agente escreve** (o git-diff-equivalente), senão construímos um risco de confiança bonito.

## Primeira slice (refinada com o Carlos, 2026-06-03)

> "Criar uma task útil" é território não-resolvido (até no Obsidian) → começar por
> aí é construir em cima de um problema aberto. O Carlos prefere começar pelo
> **ambiente** que condiciona o agente — o file explorer + os ficheiros "system".

**A ideia:** transpilar um **`CLAUDE.md`-equivalente** (instruções de operação) +
um **índice/catálogo**, que hoje não existem como estado na BD. **Cada novo
utilizador recebe um ambiente replicado** (ficheiros system + estrutura de pastas)
— provisionado no signup.

**3 perguntas em aberto (do debate — decidir antes de cortar):**

1. **Mostrar vs esconder os ficheiros system?** Esconder o `CLAUDE.md`-equiv mata a
   feature do ponto 3 (o user moldar o agente, "escreve no meu tom"). Tese: o
   **ficheiro de instruções é editável pelo user**; o risco de o partir resolve-se
   com **versão/undo** (o git-diff-equivalente), não escondendo.
2. **O `index` provavelmente NÃO é um ficheiro.** Numa BD o catálogo é um `SELECT`
   sobre as linhas tipadas — guardar um "index file" recria o "index em prosa não
   escala". Logo: **`CLAUDE.md`-equiv = ficheiro real editável; index = vista
   derivada dos dados**.
3. **Replicar o ambiente a partir de quê?** Um **template** — fixo (todos iguais)
   ou **tailored pelo onboarding** ("em que trabalhas?" semeia pastas/instruções)?
   Tailored = o fosso acumula desde o minuto zero.

**Pré-requisito que atravessa tudo:** a **auditabilidade do que o agente escreve**
(undo / histórico visível) — sem ela, "agente-autor" é risco de confiança. Ver o
veredito da review acima. Liga a [VISAO-UX.md](./VISAO-UX.md) (a casca).
