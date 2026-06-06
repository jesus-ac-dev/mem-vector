-- Fatia RAG++ (memsearch-analysis): enriquecer chunks para chunking por
-- headings + busca híbrida. Os chunks deixam de ser "1 por ficheiro": passam a
-- carregar heading, intervalo de linhas (proveniência / expand L2), e hashes
-- content-addressable para reindexação incremental. A coluna fts habilita a
-- componente lexical (FTS) da busca híbrida pgvector+FTS+RRF.

alter table chunks
    add column heading         text,
    add column start_line      int,
    add column end_line        int,
    add column content_hash    text,
    add column embedding_model text,
    add column fts tsvector generated always as (to_tsvector('portuguese', content)) stored;

-- Índice lexical para a componente FTS da busca híbrida.
create index on chunks using gin (fts);

-- Lookup rápido dos chunks de uma entidade na reindexação incremental
-- (hoje entity_id vive em metadata; promover a coluna fica para depois).
create index on chunks ((metadata ->> 'entity_id'));
