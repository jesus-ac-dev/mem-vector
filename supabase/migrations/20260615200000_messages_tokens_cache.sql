-- Detalhe do input no trace (#65): além do tokens_in total, guarda a porção
-- LIDA/CRIADA em cache (subconjunto de tokens_in). Só o claude reporta cache de
-- prompt; outros providers ficam null. Assim o trace mostra fresco/cache/out e
-- o total deixa de enganar (parece enorme, mas o grosso é cache barato).
alter table messages add column if not exists tokens_cache integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_tokens_cache_non_negative'
  ) then
    alter table messages
      add constraint messages_tokens_cache_non_negative
      check (tokens_cache is null or tokens_cache >= 0);
  end if;
end $$;
