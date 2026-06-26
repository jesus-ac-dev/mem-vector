-- Sub-progresso LIVE do relay no kanban. A fase (relay_fase) só muda nas
-- transições; ENTRE elas (vários spawns de CLI + a suite de testes) o utilizador
-- ficava 3-5 min no escuro. Esta coluna guarda o passo fino corrente (ronda +
-- provider + ação), reescrito a cada substep — efémero, só para a vista viva
-- (não fica histórico; o run-ledger #173 trata do registo). Nullable.
alter table public.tarefas
    add column if not exists relay_progresso text;
