-- #47 (retificação do Carlos): projeto não é uma linha — é uma PASTA real do
-- knowledge. Cada projeto ganha a sua pasta root; o chat/agente passa a poder
-- criar/continuar notas lá dentro como em qualquer pasta. A tabela projetos
-- mantém a âncora das tarefas e o metadado (descrição, futura paridade GitHub).

alter table public.projetos
    add column folder_id uuid references public.folders (id) on delete set null;

-- Backfill 1: pasta root homónima já existente é aproveitada (não duplicar).
update public.projetos p
   set folder_id = f.id
  from public.folders f
 where p.folder_id is null
   and f.owner_id = p.owner_id
   and f.parent_id is null
   and lower(f.name) = lower(p.nome);

-- Backfill 2: os restantes ganham pasta nova com o nome do projeto.
insert into public.folders (owner_id, name)
select p.owner_id, p.nome
  from public.projetos p
 where p.folder_id is null;

update public.projetos p
   set folder_id = f.id
  from public.folders f
 where p.folder_id is null
   and f.owner_id = p.owner_id
   and f.parent_id is null
   and lower(f.name) = lower(p.nome);
