-- #92 perfil/conta: avatar do utilizador.
-- Coluna avatar_url no profile + bucket Storage 'avatars' (leitura pública,
-- escrita só do próprio na sua pasta {uid}/). O avatar é identidade visual,
-- não é sensível — bucket público simplifica a apresentação (e ajuda os grupos).

alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- RLS no storage.objects para o bucket 'avatars': o primeiro segmento do path
-- é o uid do dono — só ele escreve/atualiza/apaga na sua pasta. A leitura é
-- pública (bucket public), sem política de select.
create policy "avatars: o próprio insere na sua pasta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars: o próprio atualiza na sua pasta"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars: o próprio apaga na sua pasta"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
