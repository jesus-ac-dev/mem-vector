---
name: nova-pagina
description: "Use in the mem-vector repo when creating a new page, route, or feature in Next.js App Router, including src/app route pages, src/modules feature schema/service/actions/hooks, server reads/writes, and Tailwind/shadcn UI composition. Trigger also on nova página, nova pagina, criar feature, criar rota, ou adicionar ecrã."
---

# mem-vector — /nova-pagina

Project-scoped Codex playbook for creating a new page or feature.

## Usage

- Use only inside the `mem-vector` repository.
- Treat slash-command names in headings as trigger aliases, not shell commands.
- Resolve paths such as `src/...`, `supabase/...`, and `docs/...` from the repository root.
- Also apply `arquitetura-por-feature` and `padroes-ui` conventions when relevant.
- Follow higher-priority Codex/system/developer instructions first.

## Context

Uma página nova é quase sempre uma feature nova. Organizar por feature e usar UI com
Tailwind + shadcn.

## Steps

1. Criar a pasta da feature `src/modules/<feature>/`:
   - `<feature>.schema.ts`: Zod + tipos.
   - `<feature>.service.ts`: dados + regras, normalmente via Supabase.
   - `<feature>.actions.ts`: `'use server'`, valida input, chama o service.
   - `<feature>.hooks.ts`: só se houver estado de cliente.
2. Criar a rota `src/app/<rota>/page.tsx`.
3. Manter a rota fina: importar do módulo, ler em Server Component, escrever via `<form action={...}>`.
4. Usar shadcn (`npx shadcn@latest add <nome>`) e classes Tailwind compostas com `cn()`.

## Skeleton

Copiar a forma de `src/modules/tarefas/` e `src/app/tarefas/page.tsx`, depois adaptar.

## Before Closing

- Correr checks relevantes, idealmente `npm run verify`.
- Confirmar PT-PT em todos os textos.
- Usar tokens de cor semânticos; não usar hex nem cores Tailwind cruas.
