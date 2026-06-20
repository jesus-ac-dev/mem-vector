-- #119 (Ponte C, 2A): guarda de encolhimento do corpo das notas.
--
-- Os write_knowledge_entry* fazem overwrite total do content_md — a não-perda do
-- corpo dependia 100% de o modelo re-emitir o texto COMPLETO. Numa CONTINUAÇÃO do
-- agente, um corpo muito mais curto é quase sempre truncamento (resumiu em vez de
-- devolver tudo). Este trigger BEFORE INSERT em file_versions recusa o caso
-- drástico — a memória não se perde por descuido, o agente reenvia.
--
-- Em trigger (não nas 3 RPCs) porque é onde o `author` é conhecido e cobre toda a
-- escrita de uma vez, presente e futura. Exempto: criação (sem versão anterior),
-- edições do utilizador (author 'user', incluindo o restauro #119) e tudo o que
-- não seja 'knowledge' (o daily é aditivo, nunca encolhe). O raise aborta a
-- transação do RPC → o overwrite do content_md também reverte.
create or replace function public.guard_encolhimento_corpo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prev text;
begin
  if new.author = 'agent' and new.entity_type = 'knowledge' then
    select fv.content_md
      into v_prev
      from public.file_versions fv
     where fv.owner_id = new.owner_id
       and fv.entity_type = 'knowledge'
       and fv.entity_id = new.entity_id
     order by fv.created_at desc
     limit 1;

    if v_prev is not null
       and length(v_prev) > 280
       and length(new.content_md) < length(v_prev) * 0.5 then
      raise exception
        'encolhimento suspeito: a continuação tem % chars vs % antes — devolve o content_md COMPLETO (não percas o que já lá estava)',
        length(new.content_md), length(v_prev);
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_encolhimento_corpo_trg
  before insert on public.file_versions
  for each row
  execute function public.guard_encolhimento_corpo();
