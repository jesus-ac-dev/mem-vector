-- #67: o nº de fontes do retrieval do chat era fixo (5) no código. Vira setting
-- por workspace (default 5), com limites sãos (1..50). Rows existentes ganham 5.
alter table definicoes add column if not exists match_count integer not null default 5;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'definicoes_match_count_limites'
  ) then
    alter table definicoes
      add constraint definicoes_match_count_limites
      check (match_count between 1 and 50);
  end if;
end $$;
