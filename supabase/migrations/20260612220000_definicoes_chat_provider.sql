-- #60 (ronda 3): o chat responde com o provider escolhido — coluna própria.
alter table public.definicoes
    add column chat_provider text not null default 'claude'
        check (chat_provider in ('claude', 'codex', 'gemini', 'ollama'));
