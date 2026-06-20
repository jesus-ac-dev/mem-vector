-- M7 (módulo GitHub) Fatia 1: connection GitHub por-utilizador. O token (PAT
-- fine-grained) cifra-se at-rest com o MESMO padrão da web_key_cifrada / keys
-- dos providers (src/lib/cripto.ts) — nunca volta ao browser (máscara na vista).
-- github_repos lista os repos ligados ("owner/nome") que o agente pode usar.
-- O gh CLI é requisito declarado (README §Requisitos); o GH_TOKEN do subprocesso
-- usa este token = a conta do utilizador do SaaS, não o gh auth do host.
alter table definicoes add column github_token_cifrada text;
alter table definicoes add column github_repos jsonb not null default '[]'::jsonb;
