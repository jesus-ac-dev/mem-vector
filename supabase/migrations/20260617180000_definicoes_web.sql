-- #45: toggle "web" por workspace. Quando ON, a resposta do chat corre
-- agentic-com-web (pesquisa a internet via tool MCP nossa). OFF (default) =
-- comportamento de sempre. Rows existentes ficam OFF.
alter table definicoes add column if not exists web_habilitada boolean not null default false;
