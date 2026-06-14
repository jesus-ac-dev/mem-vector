-- Observabilidade do chat: guardar a prova técnica de que provider/modelo
-- responderam a cada mensagem do assistente. O texto do modelo não é prova.
alter table messages add column if not exists provider text;
alter table messages add column if not exists model_requested text;
alter table messages add column if not exists model_effective text;
alter table messages add column if not exists latency_ms integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_latency_ms_non_negative'
  ) then
    alter table messages
      add constraint messages_latency_ms_non_negative
      check (latency_ms is null or latency_ms >= 0);
  end if;
end $$;
