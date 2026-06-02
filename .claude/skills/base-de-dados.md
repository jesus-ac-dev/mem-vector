# /base-de-dados — Convenções de BD (Supabase + Postgres + pgvector)

## Contexto

A BD do mem-vector é Supabase: **uma só DB** para relacional + vetorial (pgvector) + Auth + Storage. Usar ao criar/alterar tabelas, escrever RLS, ou rever migrações. Herda a disciplina da casa (crmcredito), adaptada à tenancy do mem-vector.

## Colunas mandatórias (toda a tabela de negócio)

```sql
id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- interno; nunca em URLs
uuid        uuid NOT NULL DEFAULT gen_random_uuid(),          -- o único a expor em rotas [uuid]
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

- FKs internas sempre **BIGINT**, nunca UUID. Trigger `set_updated_at` em tabelas com `updated_at`.

## Tenancy = split pessoal/comum (o diferenciador), via RLS

Não há tabelas separadas — é **RLS na mesma tabela**. Duas formas:

- **Pessoal** (tasks, dailies, conversations, messages): coluna de dono → policy `owner = auth.uid()` (ou via `profiles` se o dono for BIGINT).
- **Comum** (projects, knowledge): `org_id` → policy "é membro da org".
- **RLS SEMPRE ativo.** Policies para os comandos que permites (SELECT/INSERT/UPDATE; DELETE só onde o dono apagar os próprios dados pessoais fizer sentido).

## Camada vetorial — a PESQUISA só aqui

- Extensão `vector` (pgvector). Tabela `embeddings(source_table, source_id, chunk TEXT, embedding vector(N))`.
- O relacional é espinha + UX; a busca semântica (RAG) corre **só** na `embeddings`. Herda a RLS da fonte.

## Grafo = tabela `edges`

`edges(src_table, src_id, dst_table, dst_id, kind)` liga linhas de qualquer tabela tipada → emula notas + links (o "graph view"). Herda RLS.

## Categóricos: lookup table + FK (não ENUM/TEXT[])

Valor categórico com display/ordem/metadata → tabela lookup (`id, uuid, descricao UNIQUE, ativo, timestamps`) + FK BIGINT. Estados de máquina puros podem ficar como `codigo` literal em código. (Igual à casa.)

## Workflow (schema.sql = fonte de verdade)

```bash
# editar supabase/schemas/schema.sql, depois:
npx supabase db diff -f <nome>   # gera migration
npx supabase db reset            # aplica do zero
npx supabase db diff             # → "No schema changes found"
npm run db:types                 # regenera os tipos TS
```

Nunca editar `supabase/migrations/` à mão. (O CLI `supabase` + scripts `db:*` entram quando arrancar a data layer — fase RAG+Chat.)

## Rever migração — bloqueadores

- `DROP COLUMN`/`DROP TABLE` sem confirmar referências no código.
- `SET NOT NULL` sem DEFAULT/backfill.
- Remover policy RLS sem substituta.
- **Alterar assinatura de função** sem `DROP FUNCTION IF EXISTS public.fn(<tipos_antigos>)` antes do `CREATE OR REPLACE` → cria overload ambíguo no PostgREST ("Could not choose the best candidate function"). Gotcha real da casa.

## Checklist final

- [ ] `schema.sql` editado (não as migrações)
- [ ] `db reset` sem erros; `db diff` → "No schema changes found"
- [ ] RLS ativo + policies em toda a tabela nova
- [ ] FKs com índice
- [ ] `db:types` regenerado
