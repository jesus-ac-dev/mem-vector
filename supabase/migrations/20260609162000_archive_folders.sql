-- Arquivo lógico de pastas: a pasta sai do explorer sem forçar
-- knowledge.folder_id para null, preservando homónimos por pasta.

alter table public.folders
    add column if not exists archived boolean not null default false;

create index if not exists folders_owner_archived_parent_idx
    on public.folders (owner_id, archived, parent_id);
