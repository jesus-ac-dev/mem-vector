-- Durabilidade do relay (#M7-D): heartbeat para detetar relays órfãos (crashados).
-- Bumped pelo atualizarRelayPorIssueCom em cada progresso; o sweeper marca os
-- 'processando' com heartbeat velho como bloqueado (→ bolinha de erro → recuperação [C]).
-- Nullable: tarefas leves (sem relay) não o usam.
alter table public.tarefas
    add column if not exists relay_heartbeat timestamptz;

create index if not exists tarefas_relay_processando_heartbeat_idx
    on public.tarefas (relay_heartbeat)
    where relay_estado = 'processando';
