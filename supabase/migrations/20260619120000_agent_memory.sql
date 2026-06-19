-- Memória operacional dos agentes.
-- Índice narrativo sobre a verdade existente: messages, file_versions e agent_jobs.

create table public.agent_sessions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  operator        text not null default 'web',
  runner          text not null default 'chat',
  status          text not null default 'active' check (status in ('active', 'closed')),
  metadata        jsonb not null default '{}',
  visibility      visibility not null default 'privado',
  group_id        uuid references public.grupos (id) on delete set null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index agent_sessions_owner_status_started_idx
  on public.agent_sessions (owner_id, status, started_at desc);
create index agent_sessions_conversation_idx
  on public.agent_sessions (conversation_id);
create index agent_sessions_group_idx
  on public.agent_sessions (group_id);
create unique index agent_sessions_open_conversation_runner_idx
  on public.agent_sessions (owner_id, conversation_id, operator, runner)
  where status = 'active' and conversation_id is not null;

alter table public.agent_sessions enable row level security;

create policy "agent_sessions: ler" on public.agent_sessions for select to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select public.meus_grupos())));
create policy "agent_sessions: criar" on public.agent_sessions for insert to authenticated
  with check (owner_id = auth.uid());
create policy "agent_sessions: editar" on public.agent_sessions for update to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select public.meus_grupos())))
  with check (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select public.meus_grupos())));
create policy "agent_sessions: apagar (so dono)" on public.agent_sessions for delete to authenticated
  using (owner_id = auth.uid());

create table public.agent_observations (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,
  session_id      uuid references public.agent_sessions (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  type            text not null check (
                    type in (
                      'user-prompt',
                      'assistant-response',
                      'agent-write',
                      'task-change',
                      'job-result',
                      'session-end'
                    )
                  ),
  content         text,
  metadata        jsonb not null default '{}',
  visibility      visibility not null default 'privado',
  group_id        uuid references public.grupos (id) on delete set null,
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index agent_observations_owner_type_time_idx
  on public.agent_observations (owner_id, type, occurred_at desc);
create index agent_observations_session_time_idx
  on public.agent_observations (session_id, occurred_at desc);
create index agent_observations_conversation_time_idx
  on public.agent_observations (conversation_id, occurred_at desc);
create index agent_observations_group_idx
  on public.agent_observations (group_id);

alter table public.agent_observations enable row level security;

create policy "agent_observations: ler" on public.agent_observations for select to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select public.meus_grupos())));
create policy "agent_observations: criar" on public.agent_observations for insert to authenticated
  with check (owner_id = auth.uid());
create policy "agent_observations: apagar (so dono)" on public.agent_observations for delete to authenticated
  using (owner_id = auth.uid());

create table public.agent_handoffs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  session_id       uuid references public.agent_sessions (id) on delete set null,
  conversation_id  uuid references public.conversations (id) on delete set null,
  summary          text not null,
  open_questions   jsonb not null default '[]',
  next_steps       jsonb not null default '[]',
  entities_touched jsonb not null default '[]',
  metadata         jsonb not null default '{}',
  status           text not null default 'open' check (status in ('open', 'accepted', 'expired')),
  visibility       visibility not null default 'privado',
  group_id         uuid references public.grupos (id) on delete set null,
  accepted_by      uuid references auth.users (id) on delete set null,
  accepted_at      timestamptz,
  expired_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (jsonb_typeof(open_questions) = 'array'),
  check (jsonb_typeof(next_steps) = 'array'),
  check (jsonb_typeof(entities_touched) = 'array')
);

create index agent_handoffs_owner_status_created_idx
  on public.agent_handoffs (owner_id, status, created_at desc);
create index agent_handoffs_session_idx
  on public.agent_handoffs (session_id);
create index agent_handoffs_conversation_idx
  on public.agent_handoffs (conversation_id);
create index agent_handoffs_group_status_idx
  on public.agent_handoffs (group_id, status);

alter table public.agent_handoffs enable row level security;

create policy "agent_handoffs: ler" on public.agent_handoffs for select to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select public.meus_grupos())));
create policy "agent_handoffs: criar" on public.agent_handoffs for insert to authenticated
  with check (owner_id = auth.uid());
create policy "agent_handoffs: aceitar/expirar" on public.agent_handoffs for update to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select public.meus_grupos())))
  with check (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select public.meus_grupos())));
create policy "agent_handoffs: apagar (so dono)" on public.agent_handoffs for delete to authenticated
  using (owner_id = auth.uid());
