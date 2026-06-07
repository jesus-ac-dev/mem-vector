-- Jobs duráveis dos agentes.
-- Primeiro uso: destilação pós-chat. O cliente pode falhar depois de receber a
-- resposta, mas o trabalho a fazer fica persistido e retryable.

create table agent_jobs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  type        text not null check (type in ('chat_turn_distillation')),
  status      text not null default 'pending'
              check (status in ('pending', 'running', 'done', 'failed')),
  payload     jsonb not null,
  result      jsonb,
  error       text,
  attempts    integer not null default 0 check (attempts >= 0),
  locked_at   timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index agent_jobs_owner_status_created_idx on agent_jobs (owner_id, status, created_at);
create index agent_jobs_owner_type_created_idx on agent_jobs (owner_id, type, created_at desc);

alter table agent_jobs enable row level security;

create policy "agent_jobs: ler" on agent_jobs for select to authenticated
  using (owner_id = auth.uid());

create policy "agent_jobs: criar" on agent_jobs for insert to authenticated
  with check (owner_id = auth.uid());

create policy "agent_jobs: editar" on agent_jobs for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create function claim_agent_job(p_job_id uuid)
returns public.agent_jobs
language plpgsql
set search_path = ''
as $$
declare
  j public.agent_jobs;
begin
  update public.agent_jobs
     set status = 'running',
         attempts = attempts + 1,
         locked_at = now(),
         error = null,
         updated_at = now()
   where id = p_job_id
     and owner_id = auth.uid()
     and status in ('pending', 'failed')
   returning * into j;

  return j;
end;
$$;

grant execute on function claim_agent_job(uuid) to authenticated;
