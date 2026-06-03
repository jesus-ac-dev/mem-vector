-- Auth slice 1: profiles + visibilidade real (privado) + RLS por-utilizador,
-- e a tabela `tarefas` (era stub in-memory).

-- ── profiles: 1 linha por utilizador, criada por trigger ──────────
create table profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  theme         text,                 -- gancho de tema (slice futura)
  onboarded_at  timestamptz,          -- null = primeiro login
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles: o proprio" on profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Todo o novo auth.user ganha um profile automático.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── visibilidade: pessoal/comum → privado/protected/publico ───────
create type visibility as enum ('privado', 'protected', 'publico');

-- Dropar TODAS as policies antigas primeiro (a de messages depende de
-- conversations.owner_scope, por isso não pode sobreviver ao drop da coluna).
drop policy "conversas: dono ou comum" on conversations;
drop policy "chunks: dono ou comum" on chunks;
drop policy "mensagens: via a conversa" on messages;

-- conversations
alter table conversations add column visibility visibility not null default 'privado';
alter table conversations add column group_id uuid;          -- dorme até à slice 2
alter table conversations drop column owner_scope;
alter table conversations alter column owner_id set not null;
alter table conversations
  add constraint conversations_owner_fk
  foreign key (owner_id) references auth.users (id) on delete cascade;
create policy "conversas: privado do dono" on conversations
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- chunks
alter table chunks add column visibility visibility not null default 'privado';
alter table chunks add column group_id uuid;
alter table chunks drop column owner_scope;
alter table chunks alter column owner_id set not null;
alter table chunks
  add constraint chunks_owner_fk
  foreign key (owner_id) references auth.users (id) on delete cascade;
create policy "chunks: privado do dono" on chunks
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- messages: acesso via a conversa (owner)
create policy "mensagens: via a conversa" on messages
  for all to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id and c.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id and c.owner_id = auth.uid()
  ));

-- ── tarefas: era stub in-memory; passa a tabela real, por-utilizador ──
create table tarefas (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  feita      boolean not null default false,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  visibility visibility not null default 'privado',
  group_id   uuid,
  created_at timestamptz not null default now()
);
create index on tarefas (owner_id, created_at);

alter table tarefas enable row level security;

create policy "tarefas: privado do dono" on tarefas
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- enum antigo já sem uso
drop type scope;
