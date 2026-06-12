-- #47: Projetos base. Tarefas deixam de ter projeto como tag livre e ancoram
-- a um projeto real; "Pessoal" é o projeto-vida default (decisão do Carlos:
-- "a nossa vida devia ser um projeto"). A página nasce ANTES do módulo GitHub
-- (nem todo o projeto tem repositório; o módulo vai usar os projetos).

create table public.projetos (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users (id) on delete cascade,
    nome text not null check (char_length(nome) between 1 and 60),
    descricao text,
    visibility public.visibility not null default 'privado',
    group_id uuid references public.grupos (id) on delete set null,
    created_at timestamptz not null default now()
);

-- Nome único por dono, case-insensitive: "#vida" e "#Vida" são o mesmo projeto.
create unique index projetos_owner_nome_idx on public.projetos (owner_id, lower(nome));

alter table public.projetos enable row level security;

-- Padrão por-comando da casa (grupos_protected): ler/editar = dono OU membro
-- do grupo; criar = próprias; apagar = só o dono.
create policy "projetos: ler" on projetos for select to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));
create policy "projetos: criar" on projetos for insert to authenticated
  with check (owner_id = auth.uid());
create policy "projetos: editar" on projetos for update to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())))
  with check (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));
create policy "projetos: apagar (só dono)" on projetos for delete to authenticated
  using (owner_id = auth.uid());

-- ── Tarefas ancoram a projeto real ──
alter table public.tarefas
    add column projeto_id uuid references public.projetos (id) on delete set null;

-- Backfill 1: cada tag livre usada vira projeto do dono.
insert into public.projetos (owner_id, nome)
select distinct owner_id, projeto
  from public.tarefas
 where projeto is not null and projeto <> ''
on conflict (owner_id, lower(nome)) do nothing;

update public.tarefas t
   set projeto_id = p.id
  from public.projetos p
 where t.projeto is not null
   and p.owner_id = t.owner_id
   and lower(p.nome) = lower(t.projeto);

-- Backfill 2: órfãs vão para o "Pessoal" do dono (criado se preciso).
insert into public.projetos (owner_id, nome)
select distinct owner_id, 'Pessoal'
  from public.tarefas
 where projeto_id is null
on conflict (owner_id, lower(nome)) do nothing;

update public.tarefas t
   set projeto_id = p.id
  from public.projetos p
 where t.projeto_id is null
   and p.owner_id = t.owner_id
   and lower(p.nome) = 'pessoal';

-- A tag livre morre; a verdade é o FK. (Coluna nullable: apagar um projeto
-- solta as tarefas e o serviço re-ancora em Pessoal ao tocar-lhes.)
alter table public.tarefas drop column projeto;

create index tarefas_projeto_idx on public.tarefas (projeto_id);
