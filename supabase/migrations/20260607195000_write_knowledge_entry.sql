-- Escrita transacional de knowledge + versão.
-- Serializa por (auth.uid, slug), devolve o conteúdo anterior para o diff e
-- garante que a nota viva e a file_version nascem no mesmo statement.

create or replace function write_knowledge_entry(
  p_slug text,
  p_title text,
  p_content_md text,
  p_frontmatter jsonb,
  p_author text
)
returns table (
  id uuid,
  slug text,
  title text,
  content_md text,
  updated_at timestamptz,
  criado boolean,
  previous_content_md text
)
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_slug text := btrim(coalesce(p_slug, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_content text := coalesce(p_content_md, '');
  v_author text := coalesce(p_author, 'agent');
  v_note public.knowledge%rowtype;
  v_before text := '';
  v_criado boolean := false;
begin
  if v_user is null then
    raise exception 'sem sessão';
  end if;

  if v_slug = '' then
    raise exception 'slug vazio';
  end if;

  if v_title = '' then
    raise exception 'título vazio';
  end if;

  if v_content = '' then
    raise exception 'knowledge vazio';
  end if;

  if v_author not in ('agent', 'user') then
    raise exception 'author inválido';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_user::text),
    pg_catalog.hashtext(v_slug)
  );

  select *
    into v_note
    from public.knowledge k
   where k.owner_id = v_user
     and k.slug = v_slug
   for update;

  if not found then
    insert into public.knowledge (
      owner_id,
      slug,
      title,
      frontmatter,
      content_md,
      updated_at
    )
    values (
      v_user,
      v_slug,
      v_title,
      p_frontmatter,
      v_content,
      now()
    )
    returning * into v_note;
    v_criado := true;
  else
    v_before := v_note.content_md;

    update public.knowledge k
       set title = v_title,
           frontmatter = p_frontmatter,
           content_md = v_content,
           updated_at = now()
     where k.id = v_note.id
     returning * into v_note;
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
    'knowledge',
    v_note.id,
    v_content,
    p_frontmatter,
    v_author
  );

  return query
  select
    v_note.id,
    v_note.slug,
    v_note.title,
    v_note.content_md,
    v_note.updated_at,
    v_criado,
    v_before;
end;
$$;

grant execute on function write_knowledge_entry(text, text, text, jsonb, text) to authenticated;
