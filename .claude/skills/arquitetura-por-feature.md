# /arquitetura-por-feature — Como o código se organiza no mem-vector

## A ideia (1 frase)

Organizamos **por feature, não por tipo de ficheiro**. Tudo o que é "tarefas" vive em `src/modules/tarefas/`. A tabela e as suas regras são vizinhas — nunca se perdem em pastas separadas.

## A pasta de uma feature

```
src/modules/<feature>/
├── <feature>.schema.ts    # forma + validação (Zod) + tipos
├── <feature>.service.ts   # dados + regras (fala com o Supabase)  ← o "service" do Angular
├── <feature>.actions.ts   # a porta do servidor: 'use server', valida input, chama o service
└── <feature>.hooks.ts     # só se o ecrã precisar de estado de cliente
```

O **ecrã** (rota) vive em `src/app/<rota>/page.tsx` (o Next obriga as rotas a estar em `app/`) e é fino: importa do módulo.

## 3 conceitos (não 6)

`ecrã → action (valida) → serviço (dados + regras) → DB`

- **ecrã** — Server Component por defeito. Lê direto do serviço e renderiza; escreve via `<form action={...}>`.
- **action** — a única peça "a mais" vs Angular. É o backend; valida SEMPRE o input com Zod (fronteira de confiança).
- **serviço** — dados + regras da feature, juntos. É o teu Service do Angular.

## Quando crescer (e só então)

Mantém tudo no serviço até DOER. Quando UMA feature ficar mesmo complexa, rebenta o serviço em ficheiros **dentro do próprio módulo** (ex: `tarefas.rules.ts`, `tarefas.repo.ts`). Nunca crias pastas globais por tipo — a complexidade fica contida na feature.

## Partilhado (cross-feature)

- `src/lib/` — utilitários e (futuro) cliente Supabase.
- `src/components/ui/` — componentes shadcn partilhados.
- Um módulo importa de `lib`, de `components` e do **próprio** módulo. Não mexe nos ficheiros internos de outro módulo.

## Regras

- **PT-PT** em tudo.
- Validação **Zod na action** (servidor), sempre.
- `npm run verify` antes de fechar.

## Exemplo vivo

`src/modules/tarefas/` + `src/app/tarefas/page.tsx` — a feature inteira em 4 ficheiros pequenos.
