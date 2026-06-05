# Módulo `chat`

> Pipeline RAG completo: pergunta → recupera contexto → gera resposta via claude CLI. A destilação proativa (assíncrona) analisa cada turno e, se houver algo durável, escreve uma nota de conhecimento e faz append ao daily.

## O que faz

1. **RAG + geração** — embebe a pergunta (`embedQuery`), recupera chunks por similaridade cosseno (`match_chunks`), filtra pelo threshold de relevância, monta o prompt e chama o claude CLI via `generate`. Devolve a resposta e as fontes ao cliente imediatamente.
2. **Destilação assíncrona** — depois de o cliente receber a resposta, chama `destilarTurno` numa segunda action. O módulo `knowledge` decide se o turno contém informação durável; se sim, cria ou atualiza uma nota e regista o evento no daily.
3. **Proveniência** — indica na UI se a resposta veio do workspace (fontes acima do threshold) ou do conhecimento geral do modelo (sem fontes relevantes).

## Ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `chat.service.ts` | `respond(question)` — pipeline RAG+geração; `aplicarDestilacao(question, answer)` — destilar→escrever; tipos `ChatResult`, `NotaEscrita` |
| `chat.actions.ts` | Server actions: `ask(input)` — orquestra `respond`, persiste mensagens, indexa a pergunta; `destilarTurno(question, answer)` — destilação async + append ao daily |
| `chat.prompt.ts` | `buildPrompt(question, sources)`, `relevantSources(sources, threshold?)`, `RELEVANCE_THRESHOLD` (0.78) |
| `chat.provenance.ts` | `provenance(sources)` → `Provenance` (`fromWorkspace`, `label`) — tradução do retrieval para a UI |

## Fluxo

```
Cliente → ask(question, conversationId?)
  │
  ├─ cria/reutiliza conversa (tabela conversations)
  ├─ persiste mensagem do utilizador (tabela messages)
  │
  ├─ respond(question)
  │     embedQuery(question)         → vetor 384-dim (multilingual-e5-small, prefix "query:")
  │     db.rpc('match_chunks', …)   → até 5 chunks por similaridade cosseno
  │     relevantSources(…, 0.78)    → filtra chunks abaixo do threshold
  │     buildPrompt(question, …)    → prompt RAG-preferred + regra LLM-fallback
  │     generate(prompt)            → claude CLI (JSON, sem tools, sem MCP)
  │     devolve { answer, sources, costUsd }
  │
  ├─ embedPassage(question) → indexa a pergunta DEPOIS do retrieval (evita auto-contaminação)
  ├─ persiste resposta do assistente (tabela messages, com cost_usd)
  └─ devolve { answer, sources, costUsd, conversationId }

Cliente → destilarTurno(question, answer)   [chamada separada, não bloqueia a resposta]
  │
  ├─ aplicarDestilacao(question, answer)
  │     knowledge.destilar(q, a)    → decide se há nota durável; devolve EscritaKnowledge | null
  │     knowledge.escreverNota(…)   → cria ou atualiza nota (devolve slug, title, diff)
  │     devolve NotaEscrita | null
  │
  ├─ acrescentarAoDaily(`- Nota criada/atualizada: [[slug]]`)
  └─ devolve NotaEscrita | null   [UI mostra chip "📝 nota" se não null]
```

## Tipos principais

```ts
// chat.service.ts
interface ChatResult   { answer: string; sources: Source[]; costUsd: number }
interface NotaEscrita  { slug: string; title: string; criada: boolean }

// chat.prompt.ts
interface Source       { content: string; source: string | null; similarity: number }
interface Provenance   { fromWorkspace: boolean; label: string }   // chat.provenance.ts
```

## Decisões relevantes

- **RAG-preferred + LLM-fallback** — o contexto recuperado conduz a resposta; sem contexto relevante, o modelo pode usar conhecimento geral mas sinaliza-o. Factos do workspace não se inventam. Regra definida em `REGRA` dentro de `chat.prompt.ts`.
- **`RELEVANCE_THRESHOLD = 0.78`** — rede de segurança, não classificador perfeito. O e5-small comprime scores (relevantes ~0.83–0.89, irrelevantes ~0.76–0.80, janela ~0.03). Corte conservador deixa margem ~0.05 abaixo do menor relevante medido para nunca perder contexto bom. Revisível com mais dados (`scripts/sim-measure.ts`).
- **Destilação assíncrona** — `destilarTurno` é uma second action separada para não dobrar a latência percebida pelo utilizador.
- **Pergunta indexada após retrieval** — `embedPassage(question)` é inserida na tabela `chunks` só depois de `respond` terminar, evitando que a pergunta apareça como "fonte" da sua própria resposta (similaridade ~1.0 consigo mesma).
- Ver `decisions/log.md` no vault para o registo completo.

## Dependências

| Módulo / lib | O que usa |
|---|---|
| `@/lib/claude` | `generate(prompt)` — executa o claude CLI em modo restrito (sem tools, sem MCP, cwd limpa) |
| `@/lib/embeddings` | `embedQuery` (prefix `query:`) para retrieval; `embedPassage` (prefix `passage:`) para indexar a pergunta |
| `@/modules/knowledge` | `destilar(q, a)` — decide se há nota; `escreverNota(input)` — persiste nota |
| `@/modules/daily` | `acrescentarAoDaily(linha)` — append de registo ao daily note do dia |
| Supabase | tabelas `conversations`, `messages`, `chunks`; RPC `match_chunks` |

## Ligações

- **Alimenta `knowledge`** — cada turno é candidato a nota durável via `aplicarDestilacao`.
- **Alimenta `daily`** — notas escritas ficam registadas no daily note do dia.
- **Proveniência na UI** — `provenance(sources)` devolve `label` pronto a mostrar ("N fontes do workspace" ou "Conhecimento geral — sem fontes do teu workspace").
