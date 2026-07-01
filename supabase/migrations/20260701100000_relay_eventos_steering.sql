-- #129 corrida transparente: event-stream por corrida do relay + steering a quente.
--
-- relay_eventos: append-only, cada passo da corrida gravado NO MOMENTO (não no fim).
-- Sem FK para relay_runs de propósito: se o processo morrer a meio, o run-ledger
-- pode nunca fechar mas os eventos sobrevivem e contam a história. run_id (gerado
-- no arranque da corrida) correlaciona eventos ↔ ledger.
create table relay_eventos (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  run_id         uuid not null,
  repo_github    text not null,
  issue_github   integer not null check (issue_github > 0),
  criado_em      timestamptz not null default now(),
  tipo           text not null check (tipo in ('passo', 'testes', 'transicao', 'steering', 'fim')),
  fase           text,
  ronda          integer check (ronda > 0),
  provider       text,
  papel          text check (papel in ('principal', 'validador')),
  veredito       text check (veredito in ('ok', 'rejeitado')),
  detalhe        text not null default '',
  modelo         text,
  custo_usd      numeric,
  custo_estimado boolean,
  duracao_ms     integer check (duracao_ms >= 0)
);

create index relay_eventos_issue_idx
  on relay_eventos (owner_id, repo_github, issue_github, criado_em desc);
create index relay_eventos_run_idx on relay_eventos (run_id, criado_em);

alter table relay_eventos enable row level security;

create policy "relay_eventos: ler" on relay_eventos for select to authenticated
  using (owner_id = auth.uid());

create policy "relay_eventos: criar" on relay_eventos for insert to authenticated
  with check (owner_id = auth.uid());

-- relay_steering: orientação humana escrita COM a corrida a meio. O orchestrator
-- consome as pendentes no próximo passo de produção (marca consumido_em/fase/ronda)
-- e deixa comentário assinado na issue — o GitHub continua a verdade auditável.
create table relay_steering (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  repo_github     text not null,
  issue_github    integer not null check (issue_github > 0),
  texto           text not null check (length(btrim(texto)) > 0),
  criado_em       timestamptz not null default now(),
  consumido_em    timestamptz,
  consumido_fase  text,
  consumido_ronda integer
);

create index relay_steering_pendente_idx
  on relay_steering (owner_id, repo_github, issue_github, criado_em)
  where consumido_em is null;

alter table relay_steering enable row level security;

create policy "relay_steering: ler" on relay_steering for select to authenticated
  using (owner_id = auth.uid());

create policy "relay_steering: criar" on relay_steering for insert to authenticated
  with check (owner_id = auth.uid());

create policy "relay_steering: consumir" on relay_steering for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Custo agregado da corrida no run-ledger (o io.correr já devolve o custo de cada
-- CLI; até aqui deitava-se fora). Estimado quando algum passo não reportou custo real.
alter table relay_runs add column custo_usd numeric;
alter table relay_runs add column custo_estimado boolean;
