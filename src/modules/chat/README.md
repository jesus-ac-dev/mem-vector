# Módulo `chat`

> Pipeline RAG completo: pergunta → recupera contexto → gera resposta via claude CLI. A destilação proativa fica persistida como job durável e, quando processada, escreve conhecimento/daily.

## O que faz

1. **RAG + geração** — embebe a pergunta (`embedQuery`), recupera chunks por similaridade cosseno (`match_chunks`), filtra pelo threshold de relevância, monta o prompt e chama o claude CLI via `generate`. Devolve a resposta e as fontes ao cliente imediatamente.
2. **Destilação durável** — `ask()` cria um job `chat_turn_distillation` em `agent_jobs` antes de devolver ao cliente. A UI processa esse `jobId` em background; se a tab/rede falhar, o trabalho fica registado para retry.
3. **Proveniência** — indica na UI se a resposta veio do workspace (fontes acima do threshold) ou do conhecimento geral do modelo (sem fontes relevantes). Quando o chunk tem metadata (`daily`/`knowledge`), as citações `[1]` e a lista de fontes apontam para a rota interna do ficheiro.

## Ficheiros

| Ficheiro             | Responsabilidade                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat.service.ts`    | `respond(question)` — pipeline RAG+geração; `aplicarDestilacao(question, answer)` — destilar→escrever; tipos `ChatResult`, `NotaEscrita`                         |
| `chat.jobs.ts`       | Criação/claim/conclusão/falha dos jobs duráveis de destilação em `agent_jobs`                                                                                    |
| `chat.indexing.ts`   | Indexação dos turnos de chat em `chunks`, com metadata de conversa/mensagem e pruning por conversa                                                               |
| `chat.actions.ts`    | Server actions: `ask(input)` — responde e cria job; `processarDestilacaoJob(jobId)` — processa/retry de destilação; `destilarTurno` fica só para compatibilidade |
| `chat.prompt.ts`     | `buildPrompt(question, sources)`, `relevantSources(sources, threshold?)`, `RELEVANCE_THRESHOLD` (0.78)                                                           |
| `chat.provenance.ts` | `provenance(sources)` → `Provenance` (`fromWorkspace`, `label`), `sourceHref`, `linkCitations` — tradução do retrieval para a UI                                 |

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
  │     chunks.select(metadata)      → resolve destino interno das fontes linkáveis
  │     buildPrompt(question, …)    → prompt RAG-preferred + regra LLM-fallback
  │     generate(prompt)            → claude CLI (JSON, sem tools, sem MCP)
  │     devolve { answer, sources, costUsd }
  │
  ├─ persiste resposta do assistente (tabela messages, com cost_usd)
  ├─ indexa user+assistant em chunks DEPOIS do retrieval
  │     metadata: conversation_id, message_id, role, created_at
  │     pruning: mantém os 80 chunks de chat mais recentes por conversa
  ├─ cria agent_jobs(type='chat_turn_distillation', status='pending')
  └─ devolve { answer, sources, costUsd, conversationId, distillationJobId }

Cliente → processarDestilacaoJob(distillationJobId)   [job já persistido]
  │
  ├─ claim_agent_job(jobId)         → pending/failed → running, attempts + 1
  ├─ candidatosParaFacto            → UPDATE-bias
  ├─ destilarResumirTurno           → decide nota + resumo daily numa chamada CLI
  ├─ escreverNota/acrescentarDaily  → cria/atualiza conhecimento e daily
  ├─ agent_jobs.status='done'       → guarda { nota, daily }
  │
  └─ se falhar: agent_jobs.status='failed' com error, retryable
```

## Tipos principais

```ts
// chat.service.ts
interface ChatResult {
    answer: string;
    sources: Source[];
    costUsd: number;
}
interface NotaEscrita {
    slug: string;
    title: string;
    criada: boolean;
}

// chat.prompt.ts
interface Source {
    id?: string;
    content: string;
    source: string | null;
    similarity: number;
    metadata?: SourceMetadata | null;
}
interface Provenance {
    fromWorkspace: boolean;
    label: string;
} // chat.provenance.ts
```

## Decisões relevantes

- **RAG-preferred + LLM-fallback** — o contexto recuperado conduz a resposta; sem contexto relevante, o modelo pode usar conhecimento geral mas sinaliza-o. Factos do workspace não se inventam. Regra definida em `REGRA` dentro de `chat.prompt.ts`.
- **`RELEVANCE_THRESHOLD = 0.78`** — rede de segurança, não classificador perfeito. O e5-small comprime scores (relevantes ~0.83–0.89, irrelevantes ~0.76–0.80, janela ~0.03). Corte conservador deixa margem ~0.05 abaixo do menor relevante medido para nunca perder contexto bom. Revisível com mais dados (`scripts/sim-measure.ts`).
- **Destilação durável** — `ask()` cria o job antes de devolver ao cliente. O processamento continua assíncrono para não dobrar a latência percebida, mas a existência do trabalho já não depende da segunda chamada do browser.
- **Turno indexado após retrieval** — pergunta e resposta são inseridas em `chunks` só depois de `respond` terminar, evitando que a pergunta apareça como "fonte" da sua própria resposta (similaridade ~1.0 consigo mesma). Cada chunk tem `metadata.entity_type='chat_message'`, `conversation_id`, `message_id`, `role` e `created_at`.
- **Pruning de chat** — `chat.indexing.ts` mantém os 80 chunks de chat mais recentes por conversa. Isto limita crescimento infinito do RAG sem apagar as mensagens brutas em `messages`.
- **Citações linkáveis por metadata** — o RPC devolve `chunks.id`; o `respond` resolve `chunks.metadata` numa query curta e a UI transforma `[1]`/`[2]` em links quando `entity_type` é `daily` ou `knowledge`. A futura UI de panes pode interceptar estes mesmos hrefs para abrir o ficheiro sem sair do chat.
- Ver `decisions/log.md` no vault para o registo completo.

## Dependências

| Módulo / lib          | O que usa                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `@/lib/claude`        | `generate(prompt)` — executa o claude CLI em modo restrito (sem tools, sem MCP, cwd limpa), com prompt por stdin e fila |
| `@/lib/embeddings`    | `embedQuery` (prefix `query:`) para retrieval; `embedPassage` (prefix `passage:`) para indexar mensagens de chat        |
| `@/modules/knowledge` | `destilar(q, a)` — decide se há nota; `escreverNota(input)` — persiste nota                                             |
| `@/modules/daily`     | `acrescentarAoDaily(linha)` — append de registo ao daily note do dia                                                    |
| Supabase              | tabelas `conversations`, `messages`, `chunks`, `agent_jobs`; RPCs `match_chunks`, `claim_agent_job`                     |

## Ligações

- **Alimenta `knowledge`** — cada turno é candidato a nota durável via `aplicarDestilacao`.
- **Alimenta `daily`** — notas escritas ficam registadas no daily note do dia.
- **Proveniência na UI** — `provenance(sources)` devolve `label` pronto a mostrar ("N fontes do workspace" ou "Conhecimento geral — sem fontes do teu workspace").
