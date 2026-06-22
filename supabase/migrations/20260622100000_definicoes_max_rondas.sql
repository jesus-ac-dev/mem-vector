-- Relay: máximo de rondas do debate entre os N providers numa fase antes do
-- kill-switch (→ humano). Configurável nas Definições; nullable → o código
-- defaulta a 3. (O campo `comportamento` foi descontinuado — duplicava o Kernel;
-- a coluna fica como está, deixa de ser lida/escrita.)
alter table public.definicoes
    add column if not exists max_rondas integer;
