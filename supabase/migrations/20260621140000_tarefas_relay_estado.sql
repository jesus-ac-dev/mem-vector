-- Vista kanban segue o relay (fio solto d): o cartão de código reflete o semáforo
-- da issue. O orchestrator escreve aqui o estado a cada transição (🟠/🔴/🟢); o
-- kanban mostra-o. Nullable — cartões leves (sem issue) ficam null.
alter table public.tarefas
    add column if not exists relay_estado text;
