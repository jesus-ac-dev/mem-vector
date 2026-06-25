-- Durabilidade do relay (#M7-D): heartbeat para detetar relays órfãos (crashados).
-- Bumped pelo atualizarRelayPorIssueCom em cada progresso; o sweeper marca os
-- 'processando' com heartbeat velho como bloqueado (→ bolinha de erro → recuperação [C]).
-- Nullable: tarefas leves (sem relay) não o usam.
alter table public.tarefas
    add column if not exists relay_heartbeat timestamptz;
