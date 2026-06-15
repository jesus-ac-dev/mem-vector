-- Observabilidade do chat (#65): tokens in/out por turno do assistente, ao lado
-- do custo/latência já guardados. Vêm do mesmo envelope de onde sai o custo
-- (claude cli/api) ou do usage do provider (codex/gemini/ollama). null onde o
-- provider não os reporta.
alter table messages add column if not exists tokens_in integer;
alter table messages add column if not exists tokens_out integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_tokens_in_non_negative'
  ) then
    alter table messages
      add constraint messages_tokens_in_non_negative
      check (tokens_in is null or tokens_in >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_tokens_out_non_negative'
  ) then
    alter table messages
      add constraint messages_tokens_out_non_negative
      check (tokens_out is null or tokens_out >= 0);
  end if;
end $$;
