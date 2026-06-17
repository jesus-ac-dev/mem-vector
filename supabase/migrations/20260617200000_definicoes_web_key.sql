-- #45 fatia 3: nome neutro da key de pesquisa web (brave_key_cifrada →
-- web_key_cifrada). Os tiers grátis dos providers mudam (a Brave matou o dela
-- em fev/2026) — o campo deixa de ficar preso a um vendor. O provider com key
-- passou a ser o Tavily (grátis 1k/mês, feito p/ agentes); sem key = DuckDuckGo.
do $$ begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'definicoes' and column_name = 'brave_key_cifrada'
    ) then
        alter table definicoes rename column brave_key_cifrada to web_key_cifrada;
    else
        alter table definicoes add column if not exists web_key_cifrada text;
    end if;
end $$;
