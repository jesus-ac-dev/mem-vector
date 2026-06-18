-- Alinha o caminho canonico de conclusao com a RLS protected colaborativa:
-- dono OU membro do grupo protected pode concluir; apagar continua so dono.

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
    raise exception 'sem sessao';
  end if;

  select * into v_tarefa
    from public.tarefas t
   where t.id = p_id
     and (
       t.owner_id = v_user
       or (t.visibility = 'protected' and t.group_id in (select public.meus_grupos()))
     )
   for update;
  if not found then
    raise exception 'tarefa nao encontrada';
  end if;

  if v_tarefa.depende_de is not null then
    select * into v_dep from public.tarefas t where t.id = v_tarefa.depende_de;
    if found and v_dep.estado <> 'terminado' then
      raise exception 'tarefa bloqueada: depende de "%" que ainda esta em %', v_dep.titulo, v_dep.estado;
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
