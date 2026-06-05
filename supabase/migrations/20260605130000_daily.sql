-- Kernel de ficheiros, fatia 2: daily notes
-- Reutiliza file_versions e chunks (entity_type='daily').

create table dailies (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  visibility  visibility not null default 'privado',
  group_id    uuid,
  dia         date not null,
  content_md  text not null default '',
  frontmatter jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, dia)
);
create index on dailies (owner_id, dia desc);

alter table dailies enable row level security;
create policy "dailies: ler" on dailies for select to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));
create policy "dailies: criar" on dailies for insert to authenticated
  with check (owner_id = auth.uid());
create policy "dailies: editar" on dailies for update to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())))
  with check (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));
create policy "dailies: apagar (so dono)" on dailies for delete to authenticated
  using (owner_id = auth.uid());
