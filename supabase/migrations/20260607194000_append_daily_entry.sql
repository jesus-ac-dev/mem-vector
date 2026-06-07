-- Append atómico ao daily.
-- Evita lost updates quando dois turnos terminam ao mesmo tempo para o mesmo
-- utilizador/dia. A função serializa por (auth.uid, dia), atualiza o daily e
-- cria a versão imutável no mesmo statement transacional.

create or replace function append_daily_entry(p_dia date, p_linha text)
returns table (
  id uuid,
  dia date,
  content_md text,
  updated_at timestamptz,
  criado boolean
)
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_linha text := btrim(coalesce(p_linha, ''));
  v_daily public.dailies%rowtype;
  v_frontmatter jsonb := jsonb_build_object('title', p_dia::text, 'type', 'daily');
  v_criado boolean := false;
begin
  if v_user is null then
    raise exception 'sem sessão';
  end if;

  if v_linha = '' then
    raise exception 'daily vazio';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_user::text),
    pg_catalog.hashtext(p_dia::text)
  );

  select *
    into v_daily
    from public.dailies d
   where d.owner_id = v_user
     and d.dia = p_dia
   for update;

  if not found then
    insert into public.dailies (owner_id, dia, content_md, frontmatter, updated_at)
    values (v_user, p_dia, v_linha, v_frontmatter, now())
    returning * into v_daily;
    v_criado := true;
  else
    update public.dailies d
       set content_md = case
             when btrim(v_daily.content_md) = '' then v_linha
             else btrim(v_daily.content_md) || E'\n\n' || v_linha
           end,
           frontmatter = v_frontmatter,
           updated_at = now()
     where d.id = v_daily.id
     returning * into v_daily;
  end if;

  insert into public.file_versions (
    owner_id,
    entity_type,
    entity_id,
    content_md,
    frontmatter,
    author
  )
  values (
    v_user,
    'daily',
    v_daily.id,
    v_daily.content_md,
    v_frontmatter,
    'agent'
  );

  return query
  select v_daily.id, v_daily.dia, v_daily.content_md, v_daily.updated_at, v_criado;
end;
$$;

grant execute on function append_daily_entry(date, text) to authenticated;
