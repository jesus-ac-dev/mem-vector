-- Cor (hex) do grupo "Daily Notes" no grafo do conhecimento. Por utilizador.
-- As dailies não têm pasta; esta é a cor partilhada por todas as dailies.
alter table profiles
    add column daily_color text;
