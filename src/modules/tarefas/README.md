# Módulo `tarefas`

> Tarefas leves do utilizador (kanban #21, painel v2 #51), com visibilidade privada ou partilhada por grupo.

## O que faz

Tarefas andam pelo ciclo canónico do kanban e vivem no **painel da sidebar esquerda**
(`tarefas-panel.tsx`) — não há página própria. Criam-se por quick-add à la Obsidian
(tokens num input único) ou pelo agente na destilação do turno. A conclusão (e só ela)
fica registada no daily.

## Ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `tarefas.schema.ts` | `NovaTarefaSchema` (Zod), estados/prioridades, tipo `Tarefa`, `ordenarTarefasAbertas` |
| `tarefas.service.ts` | variantes `...Com` (listar/criar/mudarEstado/concluir/apagar) — RLS é a guarda de dados |
| `tarefas.actions.ts` | Server Actions — porta do servidor: valida com Zod, chama o serviço |
| `tarefas-quickadd.ts` | lógica pura do quick-add: `parseNovaTarefa`, gatilhos `!`/`#`, sugestões |

UI: `src/components/layout/tarefas-panel.tsx` (painel esquerdo).

## Modelo de dados

Tabela `tarefas` (base em `20260603120000`, kanban em `20260612090000`, data fim em
`20260612110000`):

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK |
| `titulo` | `text` | obrigatório |
| `estado` | `text` | `backlog → analise → desenvolvimento → testes → documentacao → terminado` |
| `prioridade` | `text` | `baixa` / `normal` / `alta` |
| `projeto` | `text` | tag livre até existir a página de Projetos (#47) |
| `descricao` | `text` | curta, opcional |
| `depende_de` | `uuid` | FK self; dependência aberta **bloqueia** a conclusão (RPC `concluir_tarefa`) |
| `data_fim` | `date` | deadline opcional (`@AAAA-MM-DD` no quick-add); manda na ordenação |
| `concluida_em` | `timestamptz` | carimbada pela RPC |
| `owner_id` / `visibility` / `group_id` / `created_at` | | iguais ao resto do projeto |

**RLS:** ler — dono ou grupo (`protected`); criar/apagar — só o dono; editar — dono ou
membro do grupo. Terminada não se reabre por `mudarEstado`.

## Quick-add (#51)

`tarefa !prioridade #projeto @2026-06-30 // descrição` — `!` e `#` têm autocomplete
(prioridades fixas; projetos já usados). ID e data de criação são automáticos. A view
da row segue a mesma ordem; ordenação do painel: data fim → prioridade → estado
descendente do kanban.

## Ligações

- **Agente** — `src/agent/mcp-tools.ts` expõe `listar_tarefas_abertas` / `criar_tarefa` /
  `concluir_tarefa`; o envelope one-shot traz `tarefas` + `concluir` (`chat.turno.ts`).
- **RLS visibility/grupos** — enum `visibility` e `meus_grupos()` partilhados com
  `knowledge` e `daily`.
