-- #21: tarefas ganham o desenho do kanban (decisões do Carlos, 2026-06-12,
-- registadas na issue): estados do ciclo canónico (agentic-os-brief), tag de
-- projeto livre, prioridade, descrição curta, dependência que BLOQUEIA a
-- conclusão, datas de criação/conclusão. `feita` (boolean) morre a favor de
-- `estado`; o backfill preserva o que existia.

alter table public.tarefas
    add column if not exists estado text not null default 'backlog',
    add column if not exists prioridade text not null default 'normal',
    add column if not exists projeto text,
    add column if not exists descricao text,
    add column if not exists depende_de uuid references public.tarefas (id) on delete set null,
    add column if not exists concluida_em timestamptz;

alter table public.tarefas
    add constraint tarefas_estado_check check (
        estado in ('backlog', 'analise', 'desenvolvimento', 'testes', 'documentacao', 'terminado')
    ),
    add constraint tarefas_prioridade_check check (prioridade in ('baixa', 'normal', 'alta'));

-- Backfill do mundo antigo: feita=true vira terminado (concluída na criação,
-- melhor aproximação disponível).
update public.tarefas
   set estado = 'terminado',
       concluida_em = coalesce(concluida_em, created_at)
 where feita = true
   and estado = 'backlog';

alter table public.tarefas drop column if exists feita;

create index if not exists tarefas_owner_estado_idx on public.tarefas (owner_id, estado);

-- Conclusão transacional: valida a dependência bloqueante (#21: dependências
-- bloqueiam — não se termina uma tarefa cuja dependência está aberta) e
-- carimba concluida_em no mesmo statement.
create or replace function public.concluir_tarefa(p_id uuid)
returns table (id uuid, titulo text, estado text, concluida_em timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tarefa public.tarefas%rowtype;
  v_dep public.tarefas%rowtype;
begin
  if v_user is null then
    raise exception 'sem sessão';
  end if;

  select * into v_tarefa
    from public.tarefas t
   where t.id = p_id and t.owner_id = v_user
   for update;
  if not found then
    raise exception 'tarefa não encontrada';
  end if;

  if v_tarefa.depende_de is not null then
    select * into v_dep from public.tarefas t where t.id = v_tarefa.depende_de;
    if found and v_dep.estado <> 'terminado' then
      raise exception 'tarefa bloqueada: depende de "%" que ainda está em %', v_dep.titulo, v_dep.estado;
    end if;
  end if;

  update public.tarefas t
     set estado = 'terminado',
         concluida_em = now()
   where t.id = v_tarefa.id
   returning t.id, t.titulo, t.estado, t.concluida_em
        into id, titulo, estado, concluida_em;
  return next;
end;
$$;

grant execute on function public.concluir_tarefa(uuid) to authenticated;
