# /padroes-ui — Convenções de UI (Tailwind + shadcn/ui)

## Contexto

A UI do mem-vector é **Tailwind + shadcn/ui** (New York). Isto é a divergência consciente vs crmcredito (que usa styled-jsx). Não trazer styled-jsx nem classes de cor hex daqui.

## Regras

- **Componentes base = shadcn/ui** em `src/components/ui/`. Adicionar via CLI: `npx shadcn@latest add <nome>` (ex: `input`, `dialog`, `card`, `select`). Não reescrever à mão o que a shadcn dá.
- **Estilos = classes Tailwind**, compostas com `cn()` de `@/lib/utils` (resolve conflitos). Variantes de componente via `class-variance-authority` (ver `button.tsx`).
- **Cores = tokens semânticos** do tema (`bg-background`, `text-foreground`, `text-muted-foreground`, `border`, `bg-primary`...). Definidos como CSS vars em `src/app/globals.css`. **Nunca** cores Tailwind cruas (`bg-blue-500`) nem hex hardcoded — para mudar a paleta muda-se a var.
- **Ícones** de `lucide-react`.
- **Forms = React Hook Form + Zod** (`@hookform/resolvers/zod`). Nunca estado manual de form.
- **`'use client'`** só quando há interatividade/estado; preferir Server Components.
- **Dark mode** via classe `.dark` (já no tema).
- **PT-PT** em todos os textos, labels e placeholders.

## Adicionar um componente shadcn

```bash
npx shadcn@latest add card dialog input
```

Depois importa de `@/components/ui/<nome>`. Compõe com `cn()` para variações pontuais.
