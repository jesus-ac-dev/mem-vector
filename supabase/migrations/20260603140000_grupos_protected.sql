-- Slice 2: grupos de pares + visibilidade `protected` colaborativa.

-- ── tabelas ───────────────────────────────────────────────────────
create table grupos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  descricao  text,
  created_at timestamptz not null default now()
);

create table grupo_membros (
  grupo_id  uuid not null references grupos (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (grupo_id, user_id)
);

create table grupo_convites (
  id            uuid primary key default gen_random_uuid(),
  grupo_id      uuid not null references grupos (id) on delete cascade,
  email         text not null,
  convidado_por uuid not null references auth.users (id) on delete cascade,
  estado        text not null default 'pendente'
                check (estado in ('pendente', 'aceite', 'recusado')),
  created_at    timestamptz not null default now()
);
create index on grupo_convites (email);

-- ── helpers SECURITY DEFINER (quebram a recursão de RLS) ───────────
create function meus_grupos()
returns setof uuid
language sql security definer stable
set search_path = ''
as $$ select grupo_id from public.grupo_membros where user_id = auth.uid(); $$;

create function meu_email()
returns text
language sql security definer stable
set search_path = ''
as $$ select email from auth.users where id = auth.uid(); $$;

-- ── RLS das tabelas de grupos ─────────────────────────────────────
alter table grupos enable row level security;
alter table grupo_membros enable row level security;
alter table grupo_convites enable row level security;

-- grupos: vês os teus; qualquer autenticado cria (fica membro via action).
create policy "grupos: dos meus" on grupos for select to authenticated
  using (id in (select meus_grupos()));
create policy "grupos: criar" on grupos for insert to authenticated
  with check (true);

-- membros: vês os dos teus grupos; só te adicionas/removes a ti.
create policy "membros: dos meus grupos" on grupo_membros for select to authenticated
  using (grupo_id in (select meus_grupos()));
create policy "membros: adicionar-me" on grupo_membros for insert to authenticated
  with check (user_id = auth.uid());
create policy "membros: sair" on grupo_membros for delete to authenticated
  using (user_id = auth.uid());

-- convites: vês os para o teu email ou dos teus grupos; um membro convida;
-- o convidado atualiza o estado (aceitar/recusar).
create policy "convites: para mim ou dos meus grupos" on grupo_convites for select to authenticated
  using (email = (select meu_email()) or grupo_id in (select meus_grupos()));
create policy "convites: membro convida" on grupo_convites for insert to authenticated
  with check (convidado_por = auth.uid() and grupo_id in (select meus_grupos()));
create policy "convites: convidado responde" on grupo_convites for update to authenticated
  using (email = (select meu_email()))
  with check (email = (select meu_email()));

-- ── RLS `protected` colaborativa: substitui as policies `privado` ──
-- Padrão por-comando: ler/editar = dono OU membro do grupo; criar = próprias;
-- apagar = só o dono.

-- tarefas
drop policy "tarefas: privado do dono" on tarefas;
create policy "tarefas: ler" on tarefas for select to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));
create policy "tarefas: criar" on tarefas for insert to authenticated
  with check (owner_id = auth.uid());
create policy "tarefas: editar" on tarefas for update to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())))
  with check (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));
create policy "tarefas: apagar (só dono)" on tarefas for delete to authenticated
  using (owner_id = auth.uid());

-- conversations
drop policy "conversas: privado do dono" on conversations;
create policy "conversas: ler" on conversations for select to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));
create policy "conversas: criar" on conversations for insert to authenticated
  with check (owner_id = auth.uid());
create policy "conversas: editar" on conversations for update to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())))
  with check (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));
create policy "conversas: apagar (só dono)" on conversations for delete to authenticated
  using (owner_id = auth.uid());

-- chunks
drop policy "chunks: privado do dono" on chunks;
create policy "chunks: ler" on chunks for select to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));
create policy "chunks: criar" on chunks for insert to authenticated
  with check (owner_id = auth.uid());
create policy "chunks: editar" on chunks for update to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())))
  with check (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));
create policy "chunks: apagar (só dono)" on chunks for delete to authenticated
  using (owner_id = auth.uid());

-- messages: acesso segue a conversa (dono ou protected do meu grupo)
drop policy "mensagens: via a conversa" on messages;
create policy "mensagens: via a conversa" on messages for all to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and (c.owner_id = auth.uid()
           or (c.visibility = 'protected' and c.group_id in (select meus_grupos())))
  ))
  with check (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and (c.owner_id = auth.uid()
           or (c.visibility = 'protected' and c.group_id in (select meus_grupos())))
  ));
