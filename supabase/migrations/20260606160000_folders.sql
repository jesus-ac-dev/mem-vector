-- Fatia 1 do file explorer: modelo de pastas reais. As notas knowledge passam a
-- poder viver numa pasta (folder_id null = raiz). Daily fica de fora (grupo à parte).

create table folders (
    id         uuid primary key default gen_random_uuid(),
    owner_id   uuid not null references auth.users (id) on delete cascade,
    name       text not null,
    parent_id  uuid references folders (id) on delete cascade,
    color      text, -- usada depois pelas cores do grafo
    created_at timestamptz not null default now()
);
create index on folders (owner_id, parent_id);

-- Nome único por nível (owner + pasta-pai). O coalesce trata a raiz (parent_id
-- null), que de outra forma o unique trataria como sempre-distinto.
create unique index folders_owner_parent_name_uniq
    on folders (owner_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- A nota aponta para a pasta; apagar a pasta devolve as notas à raiz (set null).
alter table knowledge
    add column folder_id uuid references folders (id) on delete set null;
create index on knowledge (owner_id, folder_id);

alter table folders enable row level security;
create policy "folders: dono" on folders
    for all to authenticated
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());
