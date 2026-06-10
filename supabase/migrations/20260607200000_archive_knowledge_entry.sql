-- Arquivar knowledge de forma transacional.
-- Fecha o estado parcial "archived=true mas chunks ainda ativos no RAG".

create or replace function archive_knowledge_entry(p_slug text)
returns uuid
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
     set archived = true,
         updated_at = now()
   where k.id = v_note.id;

  delete from public.chunks c
   where c.owner_id = v_user
     and c.metadata ->> 'entity_type' = 'knowledge'
     and c.metadata ->> 'entity_id' = v_note.id::text;

  return v_note.id;
end;
$$;

grant execute on function archive_knowledge_entry(text) to authenticated;
