-- #122 (Ponte F): o campo "Comportamento" das Definições deixa de ser só
-- toggles. Um texto livre onde o utilizador molda COMO o agente-autor age
-- (proatividade, estilo, ênfases) — o equivalente web a editar o CLAUDE.md, sem
-- tocar em config do host. Injeta-se no prompt do agente a seguir ao Kernel.
-- Importa a funcionalidade do andaime para dentro do produto.
alter table definicoes add column comportamento text;
