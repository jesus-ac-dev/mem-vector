import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**']),

    // `_arg` sinaliza "obrigatório por contrato mas não usado neste corpo".
    {
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                },
            ],
        },
    },

    // ── Visual Identity Guard (shadcn) ──────────────────────────
    // A casa fala shadcn/ui + tokens semânticos (ver .claude/skills/padroes-ui.md).
    // NÃO é o guard do crmcredito (que proíbe Tailwind TODO, por usar styled-jsx):
    // aqui Tailwind é a base. Proibimos só o que quebra a convergência do UX:
    //   1. Elementos raw com equivalente shadcn → usar o componente.
    //   2. Cores cruas da paleta Tailwind → usar tokens (bg-primary, bg-muted...).
    // Escape pontual justificado (ex: <input type="file"> sem componente ainda):
    //   // eslint-disable-next-line no-restricted-syntax — ref .claude/skills/padroes-ui.md
    // Excluído: src/components/ui/** (onde os <button>/<input>/<textarea> reais vivem).
    {
        files: ['src/**/*.tsx'],
        ignores: ['src/components/ui/**'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: "JSXOpeningElement[name.name='button']",
                    message:
                        'Usa <Button> de @/components/ui/button em vez de <button> raw. Ver .claude/skills/padroes-ui.md',
                },
                {
                    selector: "JSXOpeningElement[name.name='input']",
                    message:
                        'Usa <Input> de @/components/ui/input em vez de <input> raw. Ver .claude/skills/padroes-ui.md',
                },
                {
                    selector: "JSXOpeningElement[name.name='textarea']",
                    message:
                        'Usa <Textarea> de @/components/ui/textarea em vez de <textarea> raw. Ver .claude/skills/padroes-ui.md',
                },
                {
                    selector: "JSXOpeningElement[name.name='select']",
                    message:
                        'Usa <Select> de @/components/ui/select (npx shadcn add select) em vez de <select> raw. Ver .claude/skills/padroes-ui.md',
                },
                {
                    selector:
                        "JSXAttribute[name.name='className'] Literal[value=/(?:^|\\s)(?:(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]|(?:bg|text|border)-(?:white|black)\\b)/]",
                    message:
                        'Cor crua da paleta Tailwind. Usa tokens semânticos (bg-primary, bg-muted, text-muted-foreground, border...). Ver .claude/skills/padroes-ui.md',
                },
            ],
        },
    },

    // NOTA: arquitetura por FEATURE (src/modules/<feature>/). Quando houver vários
    // módulos e valer a pena, reintroduzir uma regra de isolamento entre features
    // (um módulo não importa os ficheiros internos de outro). Por agora, simples.
]);

export default eslintConfig;
