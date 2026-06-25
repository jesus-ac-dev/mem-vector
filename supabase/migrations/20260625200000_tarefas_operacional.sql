-- Estado operacional das tarefas (#tasks-operacional, Fase 4): o critério de pronto
-- (acceptance), a prova (evidence) e PORQUÊ está parada (blocker). O agente lê-os ao
-- listar (re-injeção leve, pull) e define-os. Nullable: tarefas leves não os usam.
alter table public.tarefas
    add column if not exists acceptance text,
    add column if not exists blocker text,
    add column if not exists evidence text;
