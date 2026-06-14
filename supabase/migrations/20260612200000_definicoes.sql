-- #60: definições por utilizador (mega modal no badge). A flag
-- MEMVECTOR_AGENTIC_DISTILL do M2 vira opção de workspace: o método de
-- destilação lê-se daqui (decisão #38: one-shot é o default — ¼ do custo;
-- agentic é opt-in). Módulos ativos = a página de toggles (GitHub primeiro).

create table public.definicoes (
    owner_id uuid primary key references auth.users (id) on delete cascade,
    metodo_destilacao text not null default 'one-shot'
        check (metodo_destilacao in ('one-shot', 'agentic')),
    modulos_ativos text[] not null default '{}',
    updated_at timestamptz not null default now()
);

alter table public.definicoes enable row level security;

-- Só o dono (definições não se partilham com grupos).
create policy "definicoes: ler" on definicoes for select to authenticated
  using (owner_id = auth.uid());
create policy "definicoes: criar" on definicoes for insert to authenticated
  with check (owner_id = auth.uid());
create policy "definicoes: editar" on definicoes for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
