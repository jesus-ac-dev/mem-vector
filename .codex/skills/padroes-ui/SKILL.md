---
name: padroes-ui
description: "Use in the mem-vector repo when building, reviewing, or changing UI, visual styling, forms, components, Tailwind classes, shadcn/ui usage, lucide icons, semantic color tokens, Visual Identity Guard lint failures, or PT-PT UI copy. Trigger also on padrões UI, padroes-ui, shadcn, Tailwind, formulário, button/input/textarea/select raw, or cores cruas."
---

# mem-vector — /padroes-ui

Project-scoped Codex playbook for UI conventions in `mem-vector`.

## Usage

- Use only inside the `mem-vector` repository.
- Treat slash-command names in headings as trigger aliases, not shell commands.
- Resolve paths such as `src/...`, `components.json`, and `eslint.config.mjs` from the repository root.
- Follow higher-priority Codex/system/developer instructions first.

## Context

A UI do `mem-vector` é Tailwind + shadcn/ui (New York). Isto é uma divergência consciente
face ao `crmcredito`, que usa `styled-jsx`. Não trazer `styled-jsx` nem regras anti-Tailwind.

## Rules

- Componentes base = shadcn/ui em `src/components/ui/`.
- Já instalados: `button`, `input`, `textarea`.
- Adicionar mais via CLI: `npx shadcn@latest add <nome>` (ex.: `dialog`, `card`, `select`).
- Não reescrever à mão o que a shadcn fornece.
- Evitar elementos raw:
  - `<button>` -> `<Button>`
  - `<input>` -> `<Input>`
  - `<textarea>` -> `<Textarea>`
  - `<select>` -> `<Select>`
- Estilos = classes Tailwind compostas com `cn()` de `@/lib/utils`.
- Variantes de componente via `class-variance-authority`.
- Cores = tokens semânticos do tema (`bg-background`, `text-foreground`, `text-muted-foreground`, `border`, `bg-primary`, etc.).
- Não usar cores Tailwind cruas (`bg-blue-500`, `text-neutral-500`, `text-white`) nem hex hardcoded.
- Ícones de `lucide-react`.
- Forms = React Hook Form + Zod (`@hookform/resolvers/zod`), não estado manual de form.
- `'use client'` só quando houver interatividade/estado.
- Dark mode via classe `.dark`.
- PT-PT em textos, labels e placeholders.

## Add shadcn Components

```bash
npx shadcn@latest add card dialog input
```

Depois importar de `@/components/ui/<nome>` e compor com `cn()` para variações pontuais.

## Enforcement

O bloco "Visual Identity Guard" em `eslint.config.mjs` bloqueia como `error`:

- elementos raw (`<button>`, `<input>`, `<textarea>`, `<select>`) fora de `src/components/ui/**`;
- cores cruas da paleta Tailwind (`bg-blue-600`, `text-neutral-500`, `text-white`, etc.).

Spacing/layout (`p-`, `gap-`, `rounded-`, `flex-`) é Tailwind legítimo.

## Justified Escape

Usar escape pontual só com justificação concreta:

```tsx
// eslint-disable-next-line no-restricted-syntax -- <input type=file> sem componente shadcn (padroes-ui.md)
<input type="file" ... />
```

O objetivo do guard é impedir divergência visual e componentes paralelos.
