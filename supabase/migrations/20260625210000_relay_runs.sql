-- Run-ledger do relay (#observability, Fase 0): um registo por corrida do relay
-- (dispatch). O estado/narrativa vive no GitHub; isto dá um HISTÓRICO consultável
-- na app — que issue, como acabou, quando. Custo/transcript = follow-up.
create table relay_runs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  repo_github  text not null,
  issue_github integer not null check (issue_github > 0),
  estado       text not null check (estado in ('pronto', 'pr-aberto', 'bloqueado')),
  fase         text,                 -- cruzamento onde bloqueou (null se não bloqueou)
  pr_url       text,
  started_em   timestamptz not null,
  ended_em     timestamptz not null default now(),
  check (ended_em >= started_em)
);

create index relay_runs_owner_repo_ended_idx on relay_runs (owner_id, repo_github, ended_em desc);

alter table relay_runs enable row level security;

create policy "relay_runs: ler" on relay_runs for select to authenticated
  using (owner_id = auth.uid());

create policy "relay_runs: criar" on relay_runs for insert to authenticated
  with check (owner_id = auth.uid());
