-- Persistir as fontes (RAG) por mensagem do assistente.
-- Sem isto, ao reabrir uma conversa do painel Chats as citações [N] ficam texto
-- morto — não há como religá-las aos ficheiros que referenciam. Guardar o Source[]
-- (já enriquecido com metadata: entity_type/slug/dia/title) deixa a hidratação
-- reconstruir os links exatamente como no chat ao vivo. jsonb, nullable (as
-- mensagens antigas e as do utilizador ficam a null).
alter table messages add column if not exists sources jsonb;
