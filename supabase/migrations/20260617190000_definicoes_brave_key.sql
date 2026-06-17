-- #45 fatia 2: key Brave Search (cifrada at rest, como as keys dos providers
-- no jsonb agentes). NULL = sem key → a pesquisa web cai no DuckDuckGo sem-key.
alter table definicoes add column if not exists brave_key_cifrada text;
