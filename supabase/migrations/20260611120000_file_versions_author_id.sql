-- Proveniência por PESSOA (#23, feedback do Carlos): `author` (agent|user) não
-- chega — com partilhas de grupo é preciso saber QUEM da equipa escreveu.
-- `author_id` é carimbado com auth.uid() por DEFAULT em cada insert (todos os
-- RPCs de escrita correm como o utilizador autenticado — invoker rights —, logo
-- nenhum precisa de mudar). Inserts por service-role (seeds) ficam null.

alter table public.file_versions
  add column if not exists author_id uuid references auth.users (id) on delete set null
  default auth.uid();

-- Backfill: até hoje só o dono escrevia (os RPCs by-id/slug exigem owner_id =
-- auth.uid()), logo o autor histórico é o dono.
update public.file_versions
   set author_id = owner_id
 where author_id is null;
