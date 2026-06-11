-- #28: nota arquivada está FORA do pipeline de escrita.
--
-- O upsert por slug (write_knowledge_entry / _in_folder) selecionava o alvo
-- sem olhar a `archived`: quem ocupasse o nome — mesmo arquivada — recebia a
-- escrita e FICAVA arquivada (invisível no explorer, viva no pipeline). Foi
-- assim que o agente "atualizou" uma nota arquivada 3 turnos seguidos e que
-- uma criação manual homónima lhe esmagou o corpo (forense na issue #28).
-- O mesmo para o continuar por id (write_knowledge_entry_by_id).
--
-- Regra (decisão 2026-06-10, "não criar por cima do slug", agora no SQL):
-- alvo arquivado → exceção clara; repor a nota devolve-lhe a escrita.
-- Corpos idênticos aos de 20260611100000_auto_summary.sql + o guard.

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

  -- #28: a arquivada ocupa o nome mas não aceita escrita.
  if found and v_note.archived then
    raise exception 'slug no arquivo: % — repõe a nota ou escolhe outro título', v_slug;
  end if;

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
    -- Merge: a escrita de conteúdo não apaga propriedades já definidas, e o
    -- summary do utilizador não é esmagado pelo agente.
    v_frontmatter := coalesce(v_note.frontmatter, '{}'::jsonb)
      || public.respeitar_summary_do_user(v_note.frontmatter, p_frontmatter);

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

  -- #28: a arquivada ocupa o nome mas não aceita escrita.
  if found and v_note.archived then
    raise exception 'slug no arquivo: % — repõe a nota ou escolhe outro título', v_slug;
  end if;

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
      || public.respeitar_summary_do_user(v_note.frontmatter, p_frontmatter);

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

create or replace function write_knowledge_entry_by_id(
  p_id uuid,
  p_content_md text,
  p_author text,
  p_frontmatter_patch jsonb default null
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

  -- #28: continuar uma arquivada também não — repor primeiro.
  if v_note.archived then
    raise exception 'nota no arquivo: % — repõe-na antes de a continuar', v_note.slug;
  end if;

  v_before := v_note.content_md;
  -- `title` nunca entra pelo patch (o nome da nota é o H1); summary do
  -- utilizador é respeitado.
  v_frontmatter := coalesce(v_note.frontmatter, '{}'::jsonb)
    || (public.respeitar_summary_do_user(v_note.frontmatter, p_frontmatter_patch) - 'title')
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

grant execute on function write_knowledge_entry_by_id(uuid, text, text, jsonb) to authenticated;
