-- Progresso fino do relay no kanban: fase atual, link do PR aberto e estado
-- visual continuam no cartão ligado à issue. Nullable para tarefas leves.
alter table public.tarefas
    add column if not exists relay_fase text,
    add column if not exists relay_pr_url text;
