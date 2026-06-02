import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import boundaries from 'eslint-plugin-boundaries';

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**']),

    // ── no-unused-vars: ignorar identificadores prefixados com `_` ──
    // `_arg` sinaliza "param obrigatório por contrato mas não usado neste corpo".
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

    // ── Clean Architecture Boundaries (da casa, adaptado) ──────────
    // Cadeia: app → hooks → actions → use-cases → repositories → domain.
    // domain é puro (zero dependências). lib são utilitários base.
    {
        plugins: { boundaries },
        settings: {
            'boundaries/elements': [
                { type: 'domain', pattern: ['src/domain/**'] },
                { type: 'use-cases', pattern: ['src/use-cases/**'] },
                { type: 'repositories', pattern: ['src/repositories/**'] },
                { type: 'services', pattern: ['src/services/**'] },
                { type: 'actions', pattern: ['src/app/actions/**'] },
                { type: 'hooks', pattern: ['src/hooks/**'] },
                { type: 'components', pattern: ['src/components/**'] },
                { type: 'schemas', pattern: ['src/schemas/**'] },
                { type: 'types', pattern: ['src/types/**'] },
                { type: 'constants', pattern: ['src/constants/**'] },
                { type: 'context', pattern: ['src/context/**'] },
                { type: 'lib', pattern: ['src/lib/**'] },
                { type: 'app', pattern: ['src/app/**'] },
            ],
            'boundaries/ignore': ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', 'src/tests/**'],
        },
        rules: {
            'boundaries/dependencies': [
                'error',
                {
                    default: 'disallow',
                    rules: [
                        { from: { type: 'domain' }, allow: { to: { type: ['domain', 'lib'] } } },
                        {
                            from: { type: 'use-cases' },
                            allow: { to: { type: ['domain', 'use-cases', 'lib'] } },
                        },
                        {
                            from: { type: 'repositories' },
                            allow: { to: { type: ['domain', 'repositories', 'services', 'lib'] } },
                        },
                        { from: { type: 'services' }, allow: { to: { type: ['services', 'lib'] } } },
                        {
                            from: { type: 'actions' },
                            allow: {
                                to: {
                                    type: [
                                        'use-cases',
                                        'repositories',
                                        'schemas',
                                        'domain',
                                        'lib',
                                        'types',
                                        'constants',
                                    ],
                                },
                            },
                        },
                        {
                            from: { type: 'hooks' },
                            allow: {
                                to: {
                                    type: ['actions', 'use-cases', 'types', 'context', 'lib', 'domain'],
                                },
                            },
                        },
                        {
                            from: { type: 'app' },
                            allow: {
                                to: {
                                    type: [
                                        'hooks',
                                        'components',
                                        'types',
                                        'schemas',
                                        'constants',
                                        'context',
                                        'lib',
                                        'app',
                                        'domain',
                                        'actions',
                                    ],
                                },
                            },
                        },
                        {
                            from: { type: 'components' },
                            allow: {
                                to: {
                                    type: [
                                        'components',
                                        'types',
                                        'constants',
                                        'context',
                                        'hooks',
                                        'lib',
                                        'schemas',
                                        'actions',
                                    ],
                                },
                            },
                        },
                        {
                            from: { type: 'schemas' },
                            allow: { to: { type: ['schemas', 'constants', 'domain'] } },
                        },
                        { from: { type: 'types' }, allow: { to: { type: ['types', 'constants'] } } },
                        {
                            from: { type: 'constants' },
                            allow: { to: { type: ['constants', 'types'] } },
                        },
                        {
                            from: { type: 'context' },
                            allow: { to: { type: ['types', 'constants', 'context', 'lib'] } },
                        },
                        { from: { type: 'lib' }, allow: { to: { type: ['lib', 'types'] } } },
                    ],
                },
            ],
        },
    },
]);

export default eslintConfig;
