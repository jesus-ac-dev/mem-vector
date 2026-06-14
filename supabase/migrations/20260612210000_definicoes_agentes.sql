-- #60 (ronda 2): a secção Agentes são os PROVIDERS/orquestradores (claude,
-- codex, gemini, ollama — modo cli|api, key se api), não o comportamento.
-- Config por provider em jsonb (estrutura validada por Zod no serviço).
-- NOTA: keys em plaintext é aceitável single-tenant/local; encriptação é
-- pré-requisito antes de multi-tenant.
alter table public.definicoes
    add column agentes jsonb not null default '{}';
