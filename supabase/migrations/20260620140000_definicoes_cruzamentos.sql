-- Relay (módulo de dev): o mapa cruzamento→provider nas definições — config,
-- não código (glossário). jsonb: { analise: {principal,validador}, dev: {...} }.
alter table definicoes add column cruzamentos jsonb not null default '{}'::jsonb;
