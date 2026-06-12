-- #51: data fim (deadline) opcional — entra no quick-add (@AAAA-MM-DD) e manda
-- na ordenação do painel (data fim → prioridade → estado desc do kanban).
alter table public.tarefas
    add column if not exists data_fim date;
