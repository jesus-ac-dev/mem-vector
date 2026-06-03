# /padroes-ui — Convenções de UI (Tailwind + shadcn/ui)

## Contexto

A UI do mem-vector é **Tailwind + shadcn/ui** (New York). Isto é a divergência consciente vs crmcredito (que usa styled-jsx). Não trazer styled-jsx nem classes de cor hex daqui.

## Regras

- **Componentes base = shadcn/ui** em `src/components/ui/`. Já instalados: `button`, `input`, `textarea`. Adicionar mais via CLI: `npx shadcn@latest add <nome>` (ex: `dialog`, `card`, `select`). Não reescrever à mão o que a shadcn dá.
- **Elementos raw proibidos** → usar sempre o componente: `<button>`→`<Button>`, `<input>`→`<Input>`, `<textarea>`→`<Textarea>`, `<select>`→`<Select>`. **O eslint bloqueia o raw como `error`** (ver Enforcement).
- **Estilos = classes Tailwind**, compostas com `cn()` de `@/lib/utils` (resolve conflitos). Variantes de componente via `class-variance-authority` (ver `button.tsx`).
- **Cores = tokens semânticos** do tema (`bg-background`, `text-foreground`, `text-muted-foreground`, `border`, `bg-primary`...). Definidos como CSS vars em `src/app/globals.css`. **Nunca** cores Tailwind cruas (`bg-blue-500`, `text-neutral-500`, `text-white`...) nem hex hardcoded — para mudar a paleta muda-se a var. **O eslint bloqueia isto como `error`** (ver Enforcement).
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

## Enforcement no eslint (Visual Identity Guard)

As regras acima **não são só convenção — o `eslint.config.mjs` obriga-as** (bloco "Visual Identity Guard", severidade `error`, ignora `src/components/ui/**` onde os elementos reais vivem):

- Elementos raw (`<button>`/`<input>`/`<textarea>`/`<select>`) → componente shadcn.
- Cores cruas da paleta Tailwind (`bg-blue-600`, `text-neutral-500`, `text-white`...) → tokens semânticos.

Spacing/layout (`p-`/`gap-`/`rounded-`/`flex-`) é **livre** — é Tailwind legítimo (ao contrário do crmcredito, onde o Tailwind é todo proibido por usar styled-jsx).

**Escape pontual justificado** (ex: elemento não-semântico, ou um `<input type="file">` sem componente ainda):

```tsx
// eslint-disable-next-line no-restricted-syntax — <input type=file> sem componente shadcn (padroes-ui.md)
<input type="file" ... />
```

Porquê este guard existe: a convenção sozinha não chega — sem enforcement o código diverge (foi o que aconteceu antes desta regra: 3 buttons diferentes, só a homepage certa). Ver o comentário do bloco no `eslint.config.mjs`.
