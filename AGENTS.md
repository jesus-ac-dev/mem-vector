# Codex Operating Guide — mem-vector

> Guia especifico para Codex neste repo. `CLAUDE.md` continua a ser a fonte de contexto do projeto; este ficheiro traduz isso para execucao Codex.

## Identidade

Es o Codex a trabalhar no `mem-vector`, nucleo SaaS do MythosEngine. O produto prova o ciclo:

chat -> agente escreve estado -> estado fica pesquisavel -> daily/knowledge/tasks explicam o trabalho.

Responde em portugues de Portugal. Se a resposta for simples, se direto. Em trabalho tecnico, se pragmatico, senior e verificavel.

## Antes de editar

- Corre `git status --short`.
- Le `CLAUDE.md`, este ficheiro, `tarefas.md` se existir, e os READMEs dos modulos tocados.
- Para tarefas com dominio coberto, consulta `.codex/routing-map.json` e aplica o agente correspondente em `.codex/agents/` antes de actuar.
- Nao revertes alteracoes que nao fizeste. Neste repo pode haver alteracoes do Carlos/Claude.
- Usa `rg`/`rg --files` para procurar.
- Usa `apply_patch` para edits manuais.

## Routing de agentes Codex

O Claude usa hooks automaticos em `.claude/settings.json`; o Codex neste repo usa routing explicito:

- `supabase-schema-architect`: criar/alterar schema, migrations, RLS, pgvector, `edges`, lookups.
- `db-reviewer`: rever SQL/migrations/RLS em modo read-only antes de aplicar.
- `feature-guardian`: auditar arquitetura por feature e fugas de queries Supabase fora de services.
- `tdd-runner`: implementar logica testavel por RED -> GREEN -> REFACTOR.
- `bug-fixer`: corrigir bugs pela causa raiz, com reproducao e teste quando razoavel.
- `pt-pt-linter`: corrigir/auditar PT-PT tocando so em strings.

Se o pedido explicitar delegacao, validacao paralela ou troca de tarefas entre agentes, podes usar subagente quando a ferramenta estiver disponivel. Caso contrario, aplica localmente o playbook do agente relevante e reporta o veredicto.

## Stack e divergencia do crmcredito

- Next.js 16 App Router, React 19, TypeScript strict, Supabase Auth/Postgres/pgvector, Tailwind v3 + shadcn/ui, Zod, React Hook Form, Lucide.
- Herdar do `crmcredito` arquitetura, disciplina, PT-PT e guardrails.
- Nao importar a regra anti-Tailwind nem styled-jsx do `crmcredito`; aqui Tailwind + shadcn/ui sao decisao de produto.

## Arquitetura local

- Organizar por feature em `src/modules/<feature>/`.
- Fluxo preferido: rota/componente fino -> action validada -> service -> DB.
- Partilhado vive em `src/lib` e `src/components/ui`.
- DTOs e server actions devem usar tipos/interfaces nomeados. Evitar `any`, `Record<string, any>` e casts em cadeia.
- Server actions validam input com Zod quando recebem dados externos.

## Ciclo de implementacao

- Para bugfix/feature: escrever ou ajustar teste focado antes da mudanca quando for razoavel.
- Tocar no minimo necessario.
- Fazer uma mudanca verificavel, correr checks relevantes, relatar o que passou/falhou.
- Para caminhos de memoria/agente, preferir durabilidade, idempotencia e auditabilidade a rapidez aparente.

Checks habituais:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:run
npm run build
```

## Base de dados e memoria

- RLS e multi-tenant sao superficie critica. Qualquer tabela nova multi-user precisa de `owner_id`, RLS e testes quando possivel.
- `knowledge`, `dailies`, `chunks`, `edges`, `file_versions`, `messages` e futuras tabelas de jobs fazem parte da memoria operacional; evita writes best-effort que possam perder estado sem rasto.
- Quando criares migrations, usa SQL simples, policies explicitas e nomes que expliquem a fatia.
- Se uma operacao tem varios passos persistentes, pergunta se deve virar RPC transacional ou job idempotente.

## UI

- UI em PT-PT.
- Usar shadcn/ui antes de elementos raw quando existe componente local.
- Usar tokens semanticos de Tailwind/shadcn; evitar cores cruas fora de casos justificados.
- Nao criar landing page quando a tarefa pede app/funcionalidade.

## Tarefas do repo

- `tarefas.md` na raiz e o ledger local do repo de codigo.
- Em sessoes tecnicas, le-o no inicio e atualiza-o no fim se mudares trabalho pendente, descobrires follow-ups, ou completares uma tarefa relevante.
- O vault MythosEngine continua a guardar estrategia/decisoes; `tarefas.md` deve ser operacional e curto.

## Relacao com o vault

- Planeamento vive em `/home/carlos-jesus/MythosEngine/projects/mem-vector/`.
- Se uma decisao, audit ou memoria duravel nascer aqui, deixa ponteiro no vault quando o pedido justificar.
- Codigo fica neste repo; nao mistures docs estrategicas longas no repo quando pertencem ao vault.
