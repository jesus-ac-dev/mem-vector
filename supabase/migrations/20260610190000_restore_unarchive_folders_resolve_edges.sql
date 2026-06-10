-- Repor uma nota volta a dar-lhe casa: desarquiva as pastas ancestrais (senão a
-- nota fica "na raiz" do explorer, dentro de uma pasta invisível) e resolve os
-- edges pendentes que apontavam para o slug (paridade com rename_knowledge_entry)
-- — a aresta aparece logo no grafo sem esperar pelo próximo save da nota origem.

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

  -- Desarquivar a cadeia de pastas ancestrais da nota.
  if v_note.folder_id is not null then
    with recursive ancestrais as (
      select f.id, f.parent_id
        from public.folders f
       where f.owner_id = v_user
         and f.id = v_note.folder_id
      union all
      select f.id, f.parent_id
        from public.folders f
        join ancestrais a on f.id = a.parent_id
       where f.owner_id = v_user
    )
    update public.folders f
       set archived = false
      from ancestrais a
     where f.id = a.id
       and f.archived;
  end if;

  -- Resolver wikilinks pendentes que apontavam para este slug.
  update public.edges e
     set to_id = v_note.id,
         to_type = 'knowledge'
   where e.owner_id = v_user
     and e.to_slug = v_note.slug
     and e.to_id is null;

  return query
  select v_note.id, v_note.slug, v_note.title, v_note.content_md;
end;
$$;

grant execute on function restore_knowledge_entry(text) to authenticated;
