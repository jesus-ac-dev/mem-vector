-- Fatia RAG++: busca híbrida (pgvector + FTS) por Reciprocal Rank Fusion.
-- O e5-small dilui termos exatos (slugs, erros, IDs); a componente lexical (FTS)
-- recupera-os. A função devolve a similaridade de cosseno real (para o threshold
-- honesto a montante) + um flag `lexical` = o FTS bateu no termo da query.
--
-- Nota: com `set search_path = ''` (higiene), o operador `<=>` do pgvector tem de
-- ser qualificado como OPERATOR(public.<=>) — operadores não se qualificam em forma
-- infixa simples.

-- Higiene (fecha mem-vector-matchchunks-searchpath): recriar match_chunks com
-- search_path fixo e schema qualificado, como as funções SECURITY DEFINER.
create or replace function match_chunks(query_embedding vector(384), match_count int default 5)
returns table (id uuid, content text, source text, similarity float)
language sql
stable
set search_path = ''
as $$
    select c.id,
           c.content,
           c.source,
           1 - (c.embedding OPERATOR(public.<=>) query_embedding) as similarity
    from public.chunks c
    order by c.embedding OPERATOR(public.<=>) query_embedding
    limit match_count;
$$;

create or replace function match_chunks_hybrid(
    query_embedding vector(384),
    query_text text,
    match_count int default 5
)
returns table (id uuid, content text, source text, similarity float, lexical boolean)
language sql
stable
set search_path = ''
as $$
    with q as (
        select websearch_to_tsquery('portuguese', coalesce(query_text, '')) as tsq
    ),
    dense as (
        select c.id,
               1 - (c.embedding OPERATOR(public.<=>) query_embedding) as sim,
               row_number() over (order by c.embedding OPERATOR(public.<=>) query_embedding) as rnk
        from public.chunks c
        order by c.embedding OPERATOR(public.<=>) query_embedding
        limit greatest(match_count * 4, 20)
    ),
    sparse as (
        select c.id,
               row_number() over (order by ts_rank(c.fts, q.tsq) desc) as rnk
        from public.chunks c, q
        where c.fts @@ q.tsq
        order by ts_rank(c.fts, q.tsq) desc
        limit greatest(match_count * 4, 20)
    ),
    fused as (
        -- RRF (k=60): soma os recíprocos do rank em cada arm; ids só num arm
        -- contribuem só com esse termo.
        select coalesce(d.id, s.id) as id,
               coalesce(1.0 / (60 + d.rnk), 0.0) + coalesce(1.0 / (60 + s.rnk), 0.0) as rrf,
               d.sim as dense_sim,
               (s.id is not null) as lexical
        from dense d
        full outer join sparse s on d.id = s.id
    )
    select c.id,
           c.content,
           c.source,
           coalesce(f.dense_sim, 1 - (c.embedding OPERATOR(public.<=>) query_embedding))::float as similarity,
           f.lexical
    from fused f
    join public.chunks c on c.id = f.id
    order by f.rrf desc
    limit match_count;
$$;
