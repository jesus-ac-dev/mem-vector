# Módulo `chat`

> Pipeline RAG completo: pergunta → recupera contexto → gera resposta via provider escolhido. A destilação proativa fica persistida como job durável e, quando processada, escreve conhecimento/daily.

## O que faz

1. **RAG + geração** — embebe a pergunta (`embedQuery`), recupera chunks por similaridade cosseno (`match_chunks`), filtra pelo threshold de relevância, monta o prompt e chama o provider ativo via `providerDoChatCom`. Devolve a resposta e as fontes ao cliente imediatamente.
2. **Destilação durável** — `ask()` cria um job `chat_turn_distillation` em `agent_jobs` antes de devolver ao cliente. A UI processa esse `jobId` em background; se a tab/rede falhar, o trabalho fica registado para retry.
3. **Proveniência e trace** — indica na UI se a resposta veio do workspace ou do conhecimento geral, e guarda por mensagem `provider`, modelo pedido, modelo efetivo, latência e custo. O trace vem do adapter/provider, não do auto-relato do modelo. No composer, o chip do trace e os dropdowns de provider/modelo/esforço ficam inline por baixo da textarea.

Nota de fronteira: o provider de chat é agnóstico; o caminho agentic com tools
continua Claude CLI + MCP. Ver `docs/ORQUESTRADORES.md` antes de assumir que um
novo provider também consegue destilar/escalar com tools.

## Ficheiros

| Ficheiro             | Responsabilidade                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat.service.ts`    | `prepararTurno` (retrieval+prompt, partilhado); `respond(question)` one-shot e `respondStream(question, historico, onTextDelta)` (#66, token-a-token); `aplicarDestilacao` — destilar→escrever; tipos `ChatResult`, `NotaEscrita`                         |
| `chat.jobs.ts`       | Jobs duráveis de destilação em `agent_jobs`: criação/claim/conclusão/falha + **sweeper server-side** (`varrerDestilacaoPendentesCom`) e processamento (`processarDestilacaoJobCom`, observa se outro já reclamou). O claim reclama 'running' órfão (lock > 10 min) — #118 |
| `chat.indexing.ts`   | Indexação dos turnos de chat em `chunks`, com metadata de conversa/mensagem e pruning por conversa                                                               |
| `chat.actions.ts`    | Server actions: `processarDestilacaoJob(jobId)` — processa/retry de destilação; `ask(input)` — caminho one-shot (não-streaming, legado); `destilarTurno` fica só para compatibilidade |
| `app/api/chat/stream/route.ts` | **Caminho principal do turno (#66):** ndjson token-a-token (`respondStream`) — server actions não fazem stream. Persiste user/assistant + cria o job, igual ao `ask` |
| `chat.prompt.ts`     | `buildPrompt(question, sources)`, `relevantSources(sources, threshold?)`, `RELEVANCE_THRESHOLD` (0.78)                                                           |
| `chat.provenance.ts` | `provenance(sources)` → `Provenance` (`fromWorkspace`, `label`), `sourceHref`, `linkCitations` — tradução do retrieval para a UI                                 |
| `chat.trace.ts`      | `ChatTrace`, `traceBadgeLabel`, `traceModelEvidence` — tradução da prova técnica de provider/modelo para UI                                                     |

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
  │     providerDoChatCom(db)       → provider/modelo escolhido nas definições
  │     instancia.gerar(prompt)     → CLI/API do provider
  │     devolve { answer, sources, costUsd, provider, modelo, modeloPedido, latencyMs }
  │
  ├─ persiste resposta do assistente (messages: cost_usd, sources, provider, modelos, latency_ms)
  ├─ indexa user+assistant em chunks DEPOIS do retrieval
  │     metadata: conversation_id, message_id, role, created_at
  │     pruning: mantém os 80 chunks de chat mais recentes por conversa
  ├─ cria agent_jobs(type='chat_turn_distillation', status='pending')
  ├─ after(varrerDestilacaoPendentes)  → o SERVIDOR processa a seguir à resposta (#118)
  └─ devolve { answer, sources, costUsd, provider, modelos, latencyMs, conversationId, distillationJobId }

Destilação (server-side por after; o cliente pode disparar em paralelo p/ UI ao vivo) [#118]
  │
  ├─ varrerDestilacaoPendentes      → lista pending + running-órfão (lock > 10 min), processa cada
  ├─ claim_agent_job(jobId)         → pending/failed/stale-running → running, attempts + 1
  ├─ candidatosParaFacto            → UPDATE-bias
  ├─ destilarResumirTurno           → decide nota + resumo daily numa chamada CLI
  ├─ escreverNota/acrescentarDaily  → cria/atualiza conhecimento e daily
  ├─ agent_jobs.status='done'       → guarda { notas, daily, tarefas }
  │
  └─ se falhar: agent_jobs.status='failed' com error, retryable.
     Tab fechada ≠ rasto perdido: o after() do servidor processa o job, e os
     órfãos de turnos anteriores são apanhados no sweep do turno seguinte.
```

## Tipos principais

```ts
// chat.service.ts
interface ChatResult {
    answer: string;
    sources: Source[];
    costUsd: number | null;
    provider: Provider;
    latencyMs: number;
    modelo?: string;
    modeloPedido?: string;
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
- **Prova de provider/modelo** — cada resposta persiste o provider que recebeu a chamada, o modelo pedido, o modelo efetivo reportado pelo provider e a latência. Divergência aparece como aviso no inspector, sem bloquear a resposta.
- **Claude CLI com vários modelos** — quando `modelUsage` traz o modelo principal e modelos internos do modo agentic, o trace usa a entrada de maior `costUSD`; empate ou custo ausente preserva a primeira entrada do envelope.
- Ver `decisions/log.md` no vault para o registo completo.

## Dependências

| Módulo / lib          | O que usa                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `@/lib/providers`     | `providerDoChatCom(db)` — escolhe o provider/modelo do chat e devolve metadata real da resposta                         |
| `@/lib/claude`        | caminho `claude/cli` do factory; continua a ser usado pela destilação/agentic quando aplicável                          |
| `@/lib/embeddings`    | `embedQuery` (prefix `query:`) para retrieval; `embedPassage` (prefix `passage:`) para indexar mensagens de chat        |
| `@/modules/knowledge` | `destilar(q, a)` — decide se há nota; `escreverNota(input)` — persiste nota                                             |
| `@/modules/daily`     | `acrescentarAoDaily(linha)` — append de registo ao daily note do dia                                                    |
| Supabase              | tabelas `conversations`, `messages`, `chunks`, `agent_jobs`; RPCs `match_chunks`, `claim_agent_job`                     |

## Ligações

- **Alimenta `knowledge`** — cada turno é candidato a nota durável via `aplicarDestilacao`.
- **Alimenta `daily`** — notas escritas ficam registadas no daily note do dia.
- **Proveniência na UI** — `provenance(sources)` devolve `label` pronto a mostrar ("N fontes do workspace" ou "Conhecimento geral — sem fontes do teu workspace").
