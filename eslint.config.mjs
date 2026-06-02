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
    // NOTA: arquitetura por FEATURE (src/modules/<feature>/). Quando houver vários
    // módulos e valer a pena, reintroduzir uma regra de isolamento entre features
    // (um módulo não importa os ficheiros internos de outro). Por agora, simples.
]);

export default eslintConfig;
