-- Relay: a tarefa-de-código liga-se a uma issue do GitHub (repo + número). É o
-- que permite o trigger por ARRASTO (Backlog→Análise) disparar o relay para a
-- issue certa, e o cartão mostrar o estado. Nullable — tarefas leves não têm
-- (continuam a ser to-dos do vault). A RLS das tarefas (owner) já cobre estas
-- colunas; nada de novo a proteger.
alter table public.tarefas
    add column if not exists repo_github text,
    add column if not exists issue_github integer;
