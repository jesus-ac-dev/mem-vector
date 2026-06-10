-- Permite usar agent_jobs também como fila durável do projector de índices
-- derivados (chunks/embeddings/edges). O claim/retry existente continua a ser
-- usado; o payload referencia a entidade e o processador carrega o estado atual.

alter table public.agent_jobs drop constraint if exists agent_jobs_type_check;

alter table public.agent_jobs
  add constraint agent_jobs_type_check
  check (type in ('chat_turn_distillation', 'derived_index_entity'));
