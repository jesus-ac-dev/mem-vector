-- Propriedades de ficheiros (decisão 2026-06-06): tags, summary, visibility,
-- created na UI. Duas mudanças:
-- 1. write_knowledge_entry(_in_folder) passam a fazer MERGE do frontmatter no
--    update (coalesce(existente,'{}') || p_frontmatter), como o rename já faz.
--    Antes substituíam — uma escrita do agente apagava tags/summary do utilizador.
-- 2. update_knowledge_properties: edita tags/summary (frontmatter) e visibility
--    sem tocar no content_md, com versão registada (padrão do rename).

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
  v_frontmatter jsonb;
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
    v_frontmatter := coalesce(p_frontmatter, '{}'::jsonb);

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
      v_frontmatter,
      v_content,
      now()
    )
    returning * into v_note;
    v_criado := true;
  else
    v_before := v_note.content_md;
    -- Merge: a escrita de conteúdo não apaga propriedades já definidas
    -- (tags/summary sobrevivem a um update do agente).
    v_frontmatter := coalesce(v_note.frontmatter, '{}'::jsonb)
      || coalesce(p_frontmatter, '{}'::jsonb);

    update public.knowledge k
       set title = v_title,
           frontmatter = v_frontmatter,
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
  v_frontmatter jsonb;
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
    v_frontmatter := coalesce(p_frontmatter, '{}'::jsonb);

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
      v_frontmatter,
      v_content,
      now()
    )
    returning * into v_note;
    v_criado := true;
  else
    v_before := v_note.content_md;
    v_frontmatter := coalesce(v_note.frontmatter, '{}'::jsonb)
      || coalesce(p_frontmatter, '{}'::jsonb);

    update public.knowledge k
       set title = v_title,
           frontmatter = v_frontmatter,
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
    v_criado,
    v_before;
end;
$$;

grant execute on function write_knowledge_entry_in_folder(uuid, text, text, text, jsonb, text)
  to authenticated;

-- Edita propriedades sem tocar no conteúdo. p_patch faz merge no frontmatter
-- (tags/summary); p_visibility muda a coluna quando vem preenchido. Só o dono
-- (visibilidade é decisão de quem partilha). Versão registada como no rename.
create or replace function update_knowledge_properties(
  p_id uuid,
  p_patch jsonb,
  p_visibility text default null
)
returns table (
  id uuid,
  slug text,
  title text,
  frontmatter jsonb,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_note public.knowledge%rowtype;
  v_frontmatter jsonb;
begin
  if v_user is null then
    raise exception 'sem sessão';
  end if;

  if p_id is null then
    raise exception 'id vazio';
  end if;

  if p_visibility is not null
     and p_visibility not in ('privado', 'protected', 'publico') then
    raise exception 'visibility inválida';
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

  -- `title` nunca entra pelo patch: o nome da nota é o H1 (regra 2026-06-08).
  v_frontmatter := coalesce(v_note.frontmatter, '{}'::jsonb)
    || (coalesce(p_patch, '{}'::jsonb) - 'title');

  update public.knowledge k
     set frontmatter = v_frontmatter,
         visibility = coalesce(p_visibility::public.visibility, k.visibility),
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
    'user'
  );

  return query
  select
    v_note.id,
    v_note.slug,
    v_note.title,
    v_note.frontmatter,
    v_note.visibility::text,
    v_note.created_at,
    v_note.updated_at;
end;
$$;

grant execute on function update_knowledge_properties(uuid, jsonb, text) to authenticated;
