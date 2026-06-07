-- Escritas de editor por id estavel.
-- Usadas pelo workspace para evitar colisao slug/dia quando existem entidades
-- visiveis de outros donos via `protected`. A edicao fica restrita ao dono ate
-- o modelo colaborativo de reindex/chunks partilhados ser fechado.

create or replace function write_knowledge_entry_by_id(
  p_id uuid,
  p_content_md text,
  p_author text
)
returns table (
  id uuid,
  slug text,
  title text,
  content_md text,
  updated_at timestamptz,
  previous_content_md text
)
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_content text := coalesce(p_content_md, '');
  v_author text := coalesce(p_author, 'user');
  v_note public.knowledge%rowtype;
  v_before text := '';
  v_frontmatter jsonb;
begin
  if v_user is null then
    raise exception 'sem sessão';
  end if;

  if p_id is null then
    raise exception 'id vazio';
  end if;

  if v_content = '' then
    raise exception 'knowledge vazio';
  end if;

  if v_author not in ('agent', 'user') then
    raise exception 'author inválido';
  end if;

  select *
    into v_note
    from public.knowledge k
   where k.owner_id = v_user
     and k.id = p_id
   for update;

  if not found then
    raise exception 'nota não encontrada ou sem permissão de escrita';
  end if;

  v_before := v_note.content_md;
  v_frontmatter := coalesce(v_note.frontmatter, '{}'::jsonb)
    || jsonb_build_object('title', v_note.title);

  update public.knowledge k
     set content_md = v_content,
         frontmatter = v_frontmatter,
         updated_at = now()
   where k.id = v_note.id
   returning * into v_note;

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
    'knowledge',
    v_note.id,
    v_content,
    v_frontmatter,
    v_author
  );

  return query
  select
    v_note.id,
    v_note.slug,
    v_note.title,
    v_note.content_md,
    v_note.updated_at,
    v_before;
end;
$$;

grant execute on function write_knowledge_entry_by_id(uuid, text, text) to authenticated;

create or replace function replace_daily_entry_by_id(
  p_id uuid,
  p_content_md text,
  p_author text
)
returns table (
  id uuid,
  dia date,
  content_md text,
  updated_at timestamptz
)
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_content text := coalesce(p_content_md, '');
  v_author text := coalesce(p_author, 'user');
  v_daily public.dailies%rowtype;
  v_frontmatter jsonb;
begin
  if v_user is null then
    raise exception 'sem sessão';
  end if;

  if p_id is null then
    raise exception 'id vazio';
  end if;

  if v_content = '' then
    raise exception 'daily vazio';
  end if;

  if v_author not in ('agent', 'user') then
    raise exception 'author inválido';
  end if;

  select *
    into v_daily
    from public.dailies d
   where d.owner_id = v_user
     and d.id = p_id
   for update;

  if not found then
    raise exception 'daily não encontrado ou sem permissão de escrita';
  end if;

  v_frontmatter := jsonb_build_object('title', v_daily.dia::text, 'type', 'daily');

  update public.dailies d
     set content_md = v_content,
         frontmatter = v_frontmatter,
         updated_at = now()
   where d.id = v_daily.id
   returning * into v_daily;

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
    v_content,
    v_frontmatter,
    v_author
  );

  return query
  select v_daily.id, v_daily.dia, v_daily.content_md, v_daily.updated_at;
end;
$$;

grant execute on function replace_daily_entry_by_id(uuid, text, text) to authenticated;
