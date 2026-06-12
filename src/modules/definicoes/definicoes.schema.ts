import { z } from 'zod';

// #60: definições por utilizador — o que a mega modal lê e grava.

export const METODOS_DESTILACAO = ['one-shot', 'agentic'] as const;
export type MetodoDestilacao = (typeof METODOS_DESTILACAO)[number];

// Módulos conhecidos (#60): a página de toggles. GitHub é o primeiro a sério;
// Emails está reservado (toggle desativado até o módulo existir).
export const MODULOS = ['github', 'emails'] as const;
export type Modulo = (typeof MODULOS)[number];

export const MODULO_LABEL: Record<Modulo, string> = {
    github: 'GitHub',
    emails: 'Emails',
};

export const DefinicoesSchema = z.object({
    metodoDestilacao: z.enum(METODOS_DESTILACAO).default('one-shot'),
    modulosAtivos: z.array(z.enum(MODULOS)).default([]),
});

export type Definicoes = z.infer<typeof DefinicoesSchema>;

export const DEFINICOES_DEFAULT: Definicoes = {
    metodoDestilacao: 'one-shot',
    modulosAtivos: [],
};
