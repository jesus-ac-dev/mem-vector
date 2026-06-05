-- Kernel de ficheiros, fatia 1: knowledge + edges + file_versions
-- Reusa o enum `visibility` e o padrão RLS de `tarefas`.

create table knowledge (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  visibility  visibility not null default 'privado',
  group_id    uuid,
  slug        text not null,
  title       text not null,
  frontmatter jsonb not null default '{}',
  content_md  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, slug)
);
create index on knowledge (owner_id, updated_at desc);

alter table knowledge enable row level security;
create policy "knowledge: ler" on knowledge for select to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));
create policy "knowledge: criar" on knowledge for insert to authenticated
  with check (owner_id = auth.uid());
create policy "knowledge: editar" on knowledge for update to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())))
  with check (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));
create policy "knowledge: apagar (so dono)" on knowledge for delete to authenticated
  using (owner_id = auth.uid());

create table edges (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  from_type  text not null,
  from_id    uuid not null,
  to_type    text,
  to_slug    text not null,
  to_id      uuid,
  kind       text not null default 'wikilink',
  created_at timestamptz not null default now()
);
create index on edges (owner_id, from_type, from_id);
create index on edges (owner_id, to_slug);

alter table edges enable row level security;
create policy "edges: do dono" on edges for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table file_versions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  content_md  text not null,
  frontmatter jsonb not null default '{}',
  author      text not null default 'agent',
  created_at  timestamptz not null default now()
);
create index on file_versions (owner_id, entity_type, entity_id, created_at desc);

alter table file_versions enable row level security;
create policy "file_versions: do dono" on file_versions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- chunks: apagar (só dono) já existe em 20260603140000_grupos_protected.sql — omitido.
