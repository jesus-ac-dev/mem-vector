-- Fatia 1 (primeiro ping-pong): chat + RAG.
-- Extensão vetorial + tabelas mínimas, com ownership pessoal/comum desde o dia 1 (guardrail).

create extension if not exists vector;

-- Âmbito de ownership (pessoal vs comum) — existe no schema desde já, mesmo que a UI o ignore.
create type scope as enum ('pessoal', 'comum');

create table conversations (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  owner_scope scope not null default 'pessoal',
  owner_id    uuid,
  created_at  timestamptz not null default now()
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  cost_usd        numeric,
  created_at      timestamptz not null default now()
);
create index on messages (conversation_id, created_at);

-- Conhecimento indexado (o que o RAG procura).
create table chunks (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  embedding   vector(384) not null,          -- multilingual-e5-small (384 dims)
  source      text,                          -- de onde veio (nota, daily, conversa...)
  owner_scope scope not null default 'pessoal',
  owner_id    uuid,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
-- Índice HNSW para cosseno (e5 normaliza → distância de cosseno).
create index on chunks using hnsw (embedding vector_cosine_ops);

-- Retrieval: top-k por similaridade de cosseno.
create or replace function match_chunks(query_embedding vector(384), match_count int default 5)
returns table (id uuid, content text, source text, similarity float)
language sql
stable
as $$
  select c.id, c.content, c.source,
         1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- RLS ligada desde o dia 1 (guardrail). v1: o servidor usa a service role, que bypassa RLS.
-- As políticas ficam preparadas para quando a auth entrar.
alter table conversations enable row level security;
alter table messages enable row level security;
alter table chunks enable row level security;

create policy "conversas: dono ou comum" on conversations
  for all to authenticated
  using (owner_scope = 'comum' or owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "chunks: dono ou comum" on chunks
  for all to authenticated
  using (owner_scope = 'comum' or owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "mensagens: via a conversa" on messages
  for all to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id
      and (c.owner_scope = 'comum' or c.owner_id = auth.uid())
  ));
