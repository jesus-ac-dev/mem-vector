# /nova-pagina — Criar uma página/feature nova

## Contexto

Uma "página" nova é quase sempre uma **feature** nova. Organiza-se por feature — ver `arquitetura-por-feature.md`. UI em Tailwind + shadcn — ver `padroes-ui.md`.

## Passos

1. **Criar a pasta da feature** `src/modules/<feature>/`:
    - `<feature>.schema.ts` — Zod + tipos.
    - `<feature>.service.ts` — dados + regras (Supabase).
    - `<feature>.actions.ts` — `'use server'`, valida input, chama o service.
    - `<feature>.hooks.ts` — só se houver estado de cliente.
2. **Criar a rota** `src/app/<rota>/page.tsx` — fina, importa do módulo. O layout/sidebar vêm do `layout.tsx`.
3. **Ler** num Server Component (`await listar...()`); **escrever** via `<form action={...}>`.
4. **UI** com shadcn (`npx shadcn@latest add <nome>`) + classes Tailwind via `cn()`.

## Esqueleto

Copiar a forma de `src/modules/tarefas/` + `src/app/tarefas/page.tsx` (o exemplo vivo) e adaptar.

## Antes de fechar

- `npm run verify`. PT-PT em tudo. Tokens de cor semânticos (nunca hex).
