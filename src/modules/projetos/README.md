# Módulo `projetos`

> Projetos reais (#47): toda a tarefa pertence a um; "Pessoal" é o projeto-vida default.

## O que faz

Dá corpo à decisão "a vida é um projeto": as tarefas deixam de ter tag livre e ancoram
a um projeto real por FK. Nasceu ANTES do módulo GitHub de propósito — nem todo o
projeto tem repositório; o módulo GitHub vai usar os projetos (paridade futura), não o
contrário. Conceptualmente liga à pasta `projects/` do vault MythosEngine.

## Ficheiros

| Ficheiro              | Responsabilidade                                                                        |
| --------------------- | --------------------------------------------------------------------------------------- |
| `projetos.schema.ts`  | `NovoProjetoSchema` (Zod), `PROJETO_PESSOAL`, tipo `Projeto`                            |
| `projetos.service.ts` | listar/criar + **`resolverProjetoCom`** (a regra central) + `garantirPessoalCom` (seed) |
| `projetos.actions.ts` | Server Actions finas (listar, criar)                                                    |

UI: secção root "Projetos" no explorer (como o Kernel) — **cada projeto é uma PASTA
real do knowledge** (retificação do Carlos): notas dentro, drag, e o agente lê/continua
notas lá como em qualquer pasta. Pasta arquivada = projeto não aparece (opt-out). A
página/kanban do projeto chega na fatia seguinte.

## A regra central — `resolverProjetoCom(db, nome?)`

Um NOME (do quick-add, do agente, da edição) resolve SEMPRE para um projeto real:
encontra case-insensitive (`#vida` = `#Vida`, índice único em `lower(nome)`), cria se
não existir, e sem nome cai no **Pessoal**. Criar um nome que já existe devolve o
existente (convergência, não erro). É chamado por `criarTarefaCom`/`atualizarTarefaCom`.

## Modelo de dados

Tabela `projetos` (migrações `20260612150000` + `20260612170000`): `id`, `owner_id`,
`nome` (único por dono, case-insensitive), `descricao`, **`folder_id`** (a pasta real do
projeto — criar projeto cria/aproveita a pasta root homónima), `visibility`/`group_id`
(padrão da casa), `created_at`.
RLS por-comando igual às tarefas. A migração faz o backfill: cada tag livre usada virou
projeto do dono; órfãs foram para o Pessoal; a coluna `tarefas.projeto` (texto) morreu
a favor de `tarefas.projeto_id` (FK, nome vem por join).

## Seed

`garantirPessoalCom` corre no layout autenticado (junto do `garantirKernelCom`):
"Pessoal" nasce com o utilizador, idempotente, resets-safe.
