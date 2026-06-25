# Módulo `tarefas`

> Tarefas leves do utilizador (kanban #21, painel v2 #51), com visibilidade privada ou partilhada por grupo.

## O que faz

Tarefas andam pelo ciclo canónico do kanban e vivem no **painel da sidebar esquerda**
(`tarefas-panel.tsx`) — não há página própria. Criam-se por quick-add à la Obsidian
(tokens num input único) ou pelo agente na destilação do turno. A conclusão (e só ela)
fica registada no daily.

## Ficheiros

| Ficheiro              | Responsabilidade                                                                        |
| --------------------- | --------------------------------------------------------------------------------------- |
| `tarefas.schema.ts`   | `NovaTarefaSchema` (Zod), estados/prioridades, tipo `Tarefa`, `ordenarTarefasAbertas`   |
| `tarefas.service.ts`  | variantes `...Com` (listar/criar/mudarEstado/concluir/apagar) — RLS é a guarda de dados |
| `tarefas.actions.ts`  | Server Actions — porta do servidor: valida com Zod, chama o serviço                     |
| `tarefas-quickadd.ts` | lógica pura do quick-add: `parseNovaTarefa`, gatilhos `!`/`#`, sugestões                |

UI: `src/components/layout/tarefas-panel.tsx` (painel esquerdo).

## Modelo de dados

Tabela `tarefas` (base em `20260603120000`, kanban em `20260612090000`, data fim em
`20260612110000`, relay GitHub em `20260621120000`/`20260621140000`/`20260622170000`):

| Coluna                                                | Tipo          | Notas                                                                                                               |
| ----------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `id`                                                  | `uuid`        | PK                                                                                                                  |
| `titulo`                                              | `text`        | obrigatório                                                                                                         |
| `estado`                                              | `text`        | `backlog → analise → desenvolvimento → testes → documentacao → terminado`                                           |
| `prioridade`                                          | `text`        | `baixa` / `normal` / `alta`                                                                                         |
| `projeto_id`                                          | `uuid`        | FK → `projetos` (#47); o nome vem por join — sem nome resolve para o Pessoal                                        |
| `descricao`                                           | `text`        | curta, opcional                                                                                                     |
| `depende_de`                                          | `uuid`        | FK self; dependência aberta **bloqueia** a conclusão (RPC `concluir_tarefa`)                                        |
| `data_fim`                                            | `date`        | deadline opcional (`@AAAA-MM-DD` no quick-add); manda na ordenação                                                  |
| `concluida_em`                                        | `timestamptz` | carimbada pela RPC                                                                                                  |
| `repo_github` / `issue_github`                        |               | ligação opcional do cartão a uma issue de código                                                                    |
| `relay_estado` / `relay_fase` / `relay_pr_url`        |               | progresso do relay no kanban e link direto para o PR quando existir                                                 |
| `acceptance` / `blocker` / `evidence`                 | `text`        | estado operacional (#tasks-operacional): critério de pronto / porquê parada / prova; o agente lê ao listar e define |
| `owner_id` / `visibility` / `group_id` / `created_at` |               | iguais ao resto do projeto                                                                                          |

**RLS:** ler — dono ou grupo (`protected`); criar/apagar — só o dono; editar — dono ou
membro do grupo. Terminada não se reabre por `mudarEstado`.

## Quick-add (#51, #53, #55)

Ordem canónica: `!prioridade #projeto tarefa @2026-06-30 // descrição` — os **3
primeiros são obrigatórios** na criação manual (`faltaObrigatorios`); `@data-fim` e
descrição são opcionais. `!` e `#` têm autocomplete (prioridades fixas; projetos já
usados) e o input mostra uma **hint-fantasma** com o que falta (`hintQuickAdd`). ID e
data de criação são automáticos. O card segue a mesma ordem (`#projeto` como header);
ordenação do painel: data fim → prioridade → estado descendente do kanban. O agente
também define `dataFim` quando a conversa traz prazo (fim de semana = domingo).
**Clicar no card edita**: o input reabre com os tokens (`serializarTarefa`, inverso do
parse, mesma ordem) e Enter chama `atualizarTarefa` — campos opcionais sem token
limpam-se; terminadas não se editam. Concluir e apagar pedem **confirmação** (modal).
Datas mostram-se à portuguesa (`dd-MMM` nas tarefas; helpers em `src/lib/datas.ts`). O card
mostra o **id curto** (início do uuid, `idCurtoTarefa`) na linha 1, oposto ao
`#projeto`; tarefa bloqueada leva o cadeado ao lado — o hover mostra
`Bloqueada por <id> — <título>` e destaca a border da tarefa-mãe (kanban e
painel). Próximo passo natural: token `⛔id` no quick-add para dependências
manuais, como no vault.

## Ligações

- **Agente** — `src/agent/mcp-tools.ts` expõe `listar_tarefas_abertas` / `criar_tarefa` /
  `concluir_tarefa` / `definir_estado_operacional`; o `listar` inclui o estado operacional
  presente (re-injeção leve) e o `definir` grava acceptance/blocker/evidence a partir da
  conversa (#tasks-operacional), normalizando espaços e limpando o campo quando recebe vazio.
  O envelope one-shot traz `tarefas` + `concluir` (`chat.turno.ts`).
- **RLS visibility/grupos** — enum `visibility` e `meus_grupos()` partilhados com
  `knowledge` e `daily`.
