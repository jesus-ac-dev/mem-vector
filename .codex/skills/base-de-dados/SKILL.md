---
name: base-de-dados
description: "Use in the mem-vector repo when creating, changing, or reviewing Supabase/Postgres/pgvector database schema, migrations, RLS policies, tenancy, lookup tables, embeddings, edges, functions/RPCs, or database type generation. Trigger also on base de dados, BD, Supabase, Postgres, pgvector, RLS, migration, schema, policy, or db:types."
---

# mem-vector — /base-de-dados

Project-scoped Codex playbook for Supabase, Postgres, pgvector, schema, and RLS work.

## Usage

- Use only inside the `mem-vector` repository.
- Treat slash-command names in headings as trigger aliases, not shell commands.
- Resolve paths such as `supabase/...`, `src/...`, and `docs/...` from the repository root.
- Follow higher-priority Codex/system/developer instructions first.

## Context

A BD do `mem-vector` é Supabase: uma só DB para relacional, vetorial (`pgvector`),
Auth e Storage. Usar ao criar/alterar tabelas, escrever RLS, ou rever migrações.

## Mandatory Columns

Toda a tabela de negócio deve ter:

```sql
id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, -- interno; nunca em URLs
uuid        uuid NOT NULL DEFAULT gen_random_uuid(),         -- único a expor em rotas [uuid]
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

- FKs internas sempre `BIGINT`, nunca UUID.
- Tabelas com `updated_at` precisam de trigger `set_updated_at`.

## Tenancy And RLS

Tenancy = split pessoal/comum via RLS na mesma tabela.

- **Pessoal**: tasks, dailies, conversations, messages. Usar dono (`owner_id = auth.uid()` ou via `profiles` se o dono for `BIGINT`).
- **Comum**: projects, knowledge. Usar `org_id` e policy "é membro da org".
- Ativar RLS sempre em tabelas multi-tenant.
- Criar policies explícitas para os comandos permitidos (`SELECT`, `INSERT`, `UPDATE`; `DELETE` só quando fizer sentido).

## Vector Layer

- Extensão `vector` (`pgvector`).
- Tabela de embeddings: `embeddings(source_table, source_id, chunk TEXT, embedding vector(N))`.
- O relacional é espinha + UX; a busca semântica/RAG corre só na camada vetorial.
- A camada vetorial deve respeitar a RLS da fonte.

## Graph

Usar `edges(src_table, src_id, dst_table, dst_id, kind)` para ligar linhas de qualquer
tabela tipada e alimentar a graph view. Herda RLS.

## Categoricals

Valor categórico com display/ordem/metadata deve ser lookup table + FK:
`id`, `uuid`, `descricao UNIQUE`, `ativo`, timestamps.

Evitar `ENUM`/`TEXT[]` para conceitos que crescem em UX. Estados de máquina puros podem
ficar como código literal.

## Workflow

```bash
npx supabase db diff -f <nome>
npx supabase db reset
npx supabase db diff
npm run db:types
```

Quando existir `supabase/schemas/schema.sql`, preferir editar a fonte de verdade e gerar
migrations por diff. Se o repo estiver a trabalhar diretamente em migrations, manter SQL
simples, policies explícitas e nomes que expliquem a fatia.

## Migration Review Blockers

- `DROP COLUMN`/`DROP TABLE` sem confirmar referências no código.
- `SET NOT NULL` sem `DEFAULT`/backfill.
- Remover policy RLS sem substituta.
- Alterar assinatura de função sem `DROP FUNCTION IF EXISTS public.fn(<tipos_antigos>)`
  antes do `CREATE OR REPLACE`, porque cria overload ambíguo no PostgREST.

## Final Checklist

- RLS ativo + policies em toda a tabela nova multi-tenant.
- FKs com índice.
- `db reset` sem erros quando aplicável.
- `db diff` sem mudanças inesperadas quando aplicável.
- Tipos TS regenerados quando o schema muda.
