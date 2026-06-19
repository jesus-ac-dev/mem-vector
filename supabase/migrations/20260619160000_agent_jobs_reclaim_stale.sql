-- #118 (Ponte B): o sweeper server-side precisa de reclamar jobs presos em
-- 'running' — o processador morreu a meio (tab fechada, função serverless
-- terminada) e o lock nunca largou. Sem isto, um 'running' órfão fica preso para
-- sempre (a claim antiga só reclamava 'pending'/'failed').
--
-- Acrescenta à claim a condição de 'running' com lock expirado (> 10 min, bem
-- além do timeout de 5 min da destilação agentic, para nunca roubar um job que
-- ainda está mesmo a correr). pending/failed continuam exatamente como antes.
create or replace function claim_agent_job(p_job_id uuid)
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
     and (status in ('pending', 'failed')
          or (status = 'running' and locked_at < now() - interval '10 minutes'))
   returning * into j;

  return j;
end;
$$;
