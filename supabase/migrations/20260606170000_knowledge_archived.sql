-- F5 do file explorer: arquivar notas. Uma nota arquivada sai da memória ativa
-- (explorer, dropdown de links e RAG — os chunks são apagados ao arquivar) mas
-- mantém versões e edges (auditoria) e pode ser reposta. Só knowledge arquiva.
alter table knowledge
    add column archived boolean not null default false;

-- Índice parcial: as listagens ativas filtram por archived = false.
create index knowledge_owner_ativas on knowledge (owner_id) where archived = false;
