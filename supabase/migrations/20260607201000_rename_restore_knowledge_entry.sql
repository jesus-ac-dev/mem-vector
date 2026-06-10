-- Rename/restore de knowledge com fronteiras transacionais mais fortes.
-- Rename fecha nota + versão + metadata de chunks + edges de destino no mesmo
-- statement. Restore devolve a nota e deixa a reindexação dos embeddings para Node.

create or replace function rename_knowledge_entry(
  p_slug text,
  p_new_slug text,
  p_new_title text,
  p_author text
)
returns table (
  id uuid,
  old_slug text,
  new_slug text,
  title text,
  content_md text,
  updated_at timestamptz,
  referencing_ids uuid[]
)
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_slug text := btrim(coalesce(p_slug, ''));
  v_new_slug text := btrim(coalesce(p_new_slug, ''));
  v_title text := btrim(coalesce(p_new_title, ''));
  v_author text := coalesce(p_author, 'user');
  v_note public.knowledge%rowtype;
  v_frontmatter jsonb;
  v_refs uuid[] := array[]::uuid[];
begin
  if v_user is null then
    raise exception 'sem sessão';
  end if;

  if v_slug = '' then
    raise exception 'slug vazio';
  end if;

  if v_new_slug = '' then
    raise exception 'novo slug vazio';
  end if;

  if v_title = '' then
    raise exception 'título vazio';
  end if;

  if v_author not in ('agent', 'user') then
    raise exception 'author inválido';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_user::text),
    pg_catalog.hashtext(v_slug)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_user::text),
    pg_catalog.hashtext(v_new_slug)
  );

  select *
    into v_note
    from public.knowledge k
   where k.owner_id = v_user
     and k.slug = v_slug
   for update;

  if not found then
    raise exception 'nota não encontrada';
  end if;

  if v_new_slug <> v_slug and exists (
    select 1
      from public.knowledge k
     where k.owner_id = v_user
       and k.slug = v_new_slug
       and k.id <> v_note.id
  ) then
    raise exception 'já existe uma nota com esse nome';
  end if;

  select coalesce(array_agg(distinct e.from_id), array[]::uuid[])
    into v_refs
    from public.edges e
   where e.owner_id = v_user
     and e.from_type = 'knowledge'
     and (e.to_id = v_note.id or e.to_slug = v_slug);

  v_frontmatter := coalesce(v_note.frontmatter, '{}'::jsonb)
    || jsonb_build_object('title', v_title);

  update public.knowledge k
     set title = v_title,
         slug = v_new_slug,
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
    v_note.content_md,
    v_frontmatter,
    v_author
  );

  update public.chunks c
     set metadata = coalesce(c.metadata, '{}'::jsonb)
       || jsonb_build_object('slug', v_new_slug, 'title', v_title)
   where c.owner_id = v_user
     and c.metadata ->> 'entity_type' = 'knowledge'
     and c.metadata ->> 'entity_id' = v_note.id::text;

  update public.edges e
     set to_slug = v_new_slug,
         to_type = 'knowledge',
         to_id = v_note.id
   where e.owner_id = v_user
     and (e.to_id = v_note.id or e.to_slug = v_slug);

  return query
  select
    v_note.id,
    v_slug,
    v_new_slug,
    v_note.title,
    v_note.content_md,
    v_note.updated_at,
    v_refs;
end;
$$;

grant execute on function rename_knowledge_entry(text, text, text, text) to authenticated;

create or replace function restore_knowledge_entry(p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  content_md text
)
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_slug text := btrim(coalesce(p_slug, ''));
  v_note public.knowledge%rowtype;
begin
  if v_user is null then
    raise exception 'sem sessão';
  end if;

  if v_slug = '' then
    raise exception 'slug vazio';
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
    raise exception 'nota não encontrada';
  end if;

  update public.knowledge k
     set archived = false,
         updated_at = now()
   where k.id = v_note.id
   returning * into v_note;

  return query
  select v_note.id, v_note.slug, v_note.title, v_note.content_md;
end;
$$;

grant execute on function restore_knowledge_entry(text) to authenticated;
