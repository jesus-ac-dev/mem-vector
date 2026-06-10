-- Slugs de knowledge passam a ser Obsidian-like: únicos dentro da pasta
-- (owner + folder_id + slug), não globais por owner. O id continua a ser a
-- identidade real; slug/path são identidade humana.

alter table public.knowledge
  drop constraint if exists knowledge_owner_id_slug_key;

create unique index if not exists knowledge_owner_folder_slug_uniq
  on public.knowledge (
    owner_id,
    coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(slug)
  );

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

  -- A primitiva antiga escreve na raiz. Escritas em pasta usam
  -- write_knowledge_entry_in_folder.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_user::text),
    pg_catalog.hashtext('root:' || v_slug)
  );

  select *
    into v_note
    from public.knowledge k
   where k.owner_id = v_user
     and k.folder_id is null
     and k.slug = v_slug
   for update;

  if not found then
    insert into public.knowledge (
      owner_id,
      folder_id,
      slug,
      title,
      frontmatter,
      content_md,
      updated_at
    )
    values (
      v_user,
      null,
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

create or replace function write_knowledge_entry_in_folder(
  p_folder_id uuid,
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
  v_folder uuid := p_folder_id;
  v_slug text := btrim(coalesce(p_slug, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_content text := coalesce(p_content_md, '');
  v_author text := coalesce(p_author, 'user');
  v_note public.knowledge%rowtype;
  v_before text := '';
  v_criado boolean := false;
begin
  if v_user is null then
    raise exception 'sem sessão';
  end if;

  if v_folder is null then
    raise exception 'folder_id vazio';
  end if;

  if not exists (
    select 1 from public.folders f
     where f.owner_id = v_user
       and f.id = v_folder
  ) then
    raise exception 'pasta não encontrada';
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
    pg_catalog.hashtext(v_folder::text || ':' || v_slug)
  );

  select *
    into v_note
    from public.knowledge k
   where k.owner_id = v_user
     and k.folder_id = v_folder
     and k.slug = v_slug
   for update;

  if not found then
    insert into public.knowledge (
      owner_id,
      folder_id,
      slug,
      title,
      frontmatter,
      content_md,
      updated_at
    )
    values (
      v_user,
      v_folder,
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

grant execute on function write_knowledge_entry_in_folder(uuid, text, text, text, jsonb, text)
  to authenticated;

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

  -- Fallback antigo: slug sem path refere a raiz.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_user::text),
    pg_catalog.hashtext('root:' || v_slug)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_user::text),
    pg_catalog.hashtext('root:' || v_new_slug)
  );

  select *
    into v_note
    from public.knowledge k
   where k.owner_id = v_user
     and k.folder_id is null
     and k.slug = v_slug
   for update;

  if not found then
    raise exception 'nota não encontrada';
  end if;

  if v_new_slug <> v_slug and exists (
    select 1
      from public.knowledge k
     where k.owner_id = v_user
       and k.folder_id is null
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
     and e.to_id = v_note.id;

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
     and e.to_id = v_note.id;

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

create or replace function rename_knowledge_entry_by_id(
  p_id uuid,
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
  v_new_slug text := btrim(coalesce(p_new_slug, ''));
  v_title text := btrim(coalesce(p_new_title, ''));
  v_author text := coalesce(p_author, 'user');
  v_note public.knowledge%rowtype;
  v_old_slug text;
  v_folder_key text;
  v_frontmatter jsonb;
  v_refs uuid[] := array[]::uuid[];
begin
  if v_user is null then
    raise exception 'sem sessão';
  end if;

  if p_id is null then
    raise exception 'id vazio';
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

  select *
    into v_note
    from public.knowledge k
   where k.owner_id = v_user
     and k.id = p_id
   for update;

  if not found then
    raise exception 'nota não encontrada ou sem permissão de escrita';
  end if;

  v_old_slug := v_note.slug;
  v_folder_key := coalesce(v_note.folder_id::text, 'root');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_user::text),
    pg_catalog.hashtext(v_folder_key || ':' || v_old_slug)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_user::text),
    pg_catalog.hashtext(v_folder_key || ':' || v_new_slug)
  );

  if v_new_slug <> v_old_slug and exists (
    select 1
      from public.knowledge k
     where k.owner_id = v_user
       and k.folder_id is not distinct from v_note.folder_id
       and k.slug = v_new_slug
       and k.id <> v_note.id
  ) then
    raise exception 'já existe uma nota com esse nome nesta pasta';
  end if;

  select coalesce(array_agg(distinct e.from_id), array[]::uuid[])
    into v_refs
    from public.edges e
   where e.owner_id = v_user
     and e.from_type = 'knowledge'
     and e.to_id = v_note.id;

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
     and e.to_id = v_note.id;

  return query
  select
    v_note.id,
    v_old_slug,
    v_new_slug,
    v_note.title,
    v_note.content_md,
    v_note.updated_at,
    v_refs;
end;
$$;

grant execute on function rename_knowledge_entry_by_id(uuid, text, text, text)
  to authenticated;
