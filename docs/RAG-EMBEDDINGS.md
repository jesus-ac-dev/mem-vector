# RAG & Embeddings

> Como o mem-vector recupera conhecimento e responde. O motor da fatia 1 do
> produto (o primeiro ping-pong), construído 2026-06-02, validado no browser
> 2026-06-03. Spec original: `projects/mem-vector/chat-rag-ping-pong-spec.md` (vault).

## O pipeline

```
ingestão:  texto → embedPassage("passage: …") → chunks.embedding (pgvector)
pergunta:  texto → embedQuery("query: …") → match_chunks(top-k) → prompt → claude CLI → resposta
```

Quatro peças, cada uma num ficheiro:
- **`src/lib/embeddings.ts`** — gera vetores (local, CPU).
- **`supabase/migrations/*_init_chat_rag.sql`** — `chunks` (pgvector) + `match_chunks`.
- **`src/lib/claude.ts`** — geração de texto via `claude` CLI.
- **`src/modules/chat/chat.service.ts`** — orquestra retrieval + geração.

## Embeddings — `multilingual-e5-small`, local, CPU

- Modelo **`Xenova/multilingual-e5-small`** via **`@xenova/transformers`** (ONNX/WASM). Corre **localmente em CPU**, `pooling: 'mean'`, `normalize: true`. **384 dimensões** (`EMBEDDING_DIMS`).
- **Carregamento lazy** (singleton `extractorPromise`): o modelo carrega na **1ª** chamada. É a origem do **cold start ~89s**; depois quente **5–8s** (medido, [[2026-06-03]]).
- **Gotcha E5 — prefixos obrigatórios:** o conteúdo indexado leva `passage: `, a pergunta leva `query: ` (`embedPassage` / `embedQuery`). **Misturar degrada o retrieval** — não tirar os prefixos.

**Porquê local e este modelo** (decisão em `decisions/log.md` 2026-06-03):
- Embeddings são modelos minúsculos (~118M, <150 MB) → CPU chega de sobra. O hardware do Carlos é **Intel Arc, sem CUDA** ([[dev-machine-intel-arc-no-cuda]]); o medo "local = GPU" era das LLMs *generativas*, não destes.
- **e5-small é multilingue** (bom em PT-PT). O `gte-small` do Supabase edge foi rejeitado por ser EN-only; **Voyage** (API paga) cortado — custo zero, alinhado com "não pagar mais que a Max".

## Armazenamento — pgvector

- Tabela **`chunks`**: `content text`, `embedding vector(384)`, `source`, `owner_scope`/`owner_id` (ver nota de auth abaixo), `metadata jsonb`, `created_at`.
- Índice **HNSW** com `vector_cosine_ops` (similaridade de cosseno).
- Função **`match_chunks(query_embedding vector(384), match_count int default 5)`** → top-k por `1 - (embedding <=> query_embedding)` (similaridade), `stable`, SQL puro.
- **Gotcha:** o array de floats vai para o Postgres como **string JSON** (`JSON.stringify(embedding)`) tanto no insert como no rpc — o driver não serializa o `vector` sozinho.

## Geração — `claude` CLI (subscrição, não API)

`src/lib/claude.ts` conduz o binário `claude` (subscrição Max, não a API paga — ver [[claude-agent-sdk-billing]]) com um **contexto mínimo e isolado**:
- `-p <prompt> --output-format json` → devolve envelope com `result` + `total_cost_usd`.
- **Isolado:** `cwd = tmpdir()` (sem MCP/skills do projeto), `--strict-mcp-config`, `--exclude-dynamic-system-prompt-sections`, **`--disallowedTools`** (Bash/Read/Write/Edit/Glob/Grep/Web*/Task/…) — é um respondedor puro, não um agente.
- **System prompt próprio:** assistente do MythosEngine, PT-PT, conciso, **só usa o contexto fornecido** (senão di-lo).
- `CLAUDE_BIN` override por env.
- Custo medido no primeiro ping-pong: **~$0.13**.

## Orquestração — `chat.service.ts`

`respond(question)`: `embedQuery` → `match_chunks` (top-5) → monta o prompt com o contexto numerado (`[1] …`) → `generate` (claude) → `{ answer, sources, costUsd }`. O prompt fecha com "Responde usando só o contexto acima" (resposta ancorada, anti-alucinação).

## Operação

- **Supabase local** em Docker, portas **560xx** (`project_id mem-vector`, não colide com o crmcredito em 542xx). Após reboot o stack cai → `supabase start` antes de usar o `/chat` ([[2026-06-03]]).
- **Ingestão:** `npm run ingest` (`scripts/ingest.ts`, `tsx`) — idempotente (limpa `source='seed'` e reindexa 6 factos-semente). Usa **service-role**.
- **Ping-pong headless:** `npm run pingpong` (driver de custo/retrieval).

## Nota de auth (muda na slice 1 de auth)

Hoje o retrieval e a ingestão usam **service-role** (`getSupabaseAdmin`), que **bypassa a RLS** — "v1 sem auth". A `chunks.owner_id`/`owner_scope` existem mas estão inertes. A slice de auth ([AUTH-E-SHELL.md](./AUTH-E-SHELL.md)) liga o caminho do user ao **cliente autenticado** (RLS aplica-se; `owner_scope` → `visibility`); o **script de ingestão fica service-role** (offline, não-user). Os chunks-semente passam a ser do utilizador do seed (`privado`).
