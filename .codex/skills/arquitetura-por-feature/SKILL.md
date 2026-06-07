---
name: arquitetura-por-feature
description: "Use in the mem-vector repo when creating, reviewing, or refactoring feature organization, src/modules feature structure, server actions, services, Zod schemas, route thinness, or when deciding whether code belongs in lib, components/ui, or a feature module. Trigger also on arquitetura por feature, organizar feature, nova feature, service/actions/schema, or evitar pastas globais por tipo."
---

# mem-vector — /arquitetura-por-feature

Project-scoped Codex playbook for organizing code by feature in `~/src/mem-vector`.

## Usage

- Use only inside the `mem-vector` repository.
- Treat slash-command names in headings as trigger aliases, not shell commands.
- Resolve paths such as `src/...`, `supabase/...`, and `docs/...` from the repository root.
- Follow higher-priority Codex/system/developer instructions first.

## Core Rule

Organizar por feature, não por tipo de ficheiro. Tudo o que é "tarefas" vive em
`src/modules/tarefas/`. A tabela e as suas regras são vizinhas; não se perdem em
pastas separadas.

## Feature Folder

```text
src/modules/<feature>/
├── <feature>.schema.ts    # forma + validação (Zod) + tipos
├── <feature>.service.ts   # dados + regras (fala com o Supabase)
├── <feature>.actions.ts   # porta do servidor: 'use server', valida input, chama o service
└── <feature>.hooks.ts     # só se o ecrã precisar de estado de cliente
```

O ecrã vive em `src/app/<rota>/page.tsx` e é fino: importa do módulo.

## Flow

`ecrã -> action (valida) -> serviço (dados + regras) -> DB`

- **Ecrã**: Server Component por defeito. Lê direto do serviço e renderiza; escreve via `<form action={...}>`.
- **Action**: backend da feature. Validar sempre input com Zod na fronteira de confiança.
- **Serviço**: dados + regras da feature juntos.

## Growth Rule

Manter tudo no serviço até doer. Quando uma feature ficar complexa, rebentar o serviço
em ficheiros dentro do próprio módulo, por exemplo `tarefas.rules.ts` ou `tarefas.repo.ts`.
Não criar pastas globais por tipo; a complexidade fica contida na feature.

## Shared Code

- `src/lib/`: utilitários e clientes partilhados.
- `src/components/ui/`: componentes shadcn partilhados.
- Um módulo importa de `lib`, de `components`, e do próprio módulo. Evitar mexer nos ficheiros internos de outro módulo.

## Rules

- PT-PT em UI, labels, mensagens e comentários.
- Validação Zod na action, sempre.
- Correr `npm run verify` antes de fechar quando a mudança justificar.

## Live Example

Usar `src/modules/tarefas/` e `src/app/tarefas/page.tsx` como referência de forma.
