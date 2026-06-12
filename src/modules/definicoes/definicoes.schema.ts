import { z } from 'zod';

// #60: definições por utilizador — o que a mega modal lê e grava.
// Secções: Comportamento (como o agente-autor age — acumula ideias),
// Agentes (os providers/orquestradores) e Módulos (toggles).

export const METODOS_DESTILACAO = ['one-shot', 'agentic'] as const;
export type MetodoDestilacao = (typeof METODOS_DESTILACAO)[number];

// Agentes (#60 ronda 2, design do Carlos): os PROVIDERS que podem servir de
// orquestrador — por cli (subscrição/local) ou api (precisa de key). Quem os
// consome é o relay/orquestração; aqui é a declaração.
export const PROVIDERS = ['claude', 'codex', 'gemini', 'ollama'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABEL: Record<Provider, string> = {
    claude: 'Claude',
    codex: 'Codex',
    gemini: 'Gemini',
    ollama: 'Ollama',
};

export const MODOS_AGENTE = ['cli', 'api'] as const;
export type ModoAgente = (typeof MODOS_AGENTE)[number];

export const AgenteConfigSchema = z.object({
    ativo: z.boolean().default(false),
    modo: z.enum(MODOS_AGENTE).default('cli'),
    // Em modo api a key é obrigatória para o provider contar como utilizável.
    // Plaintext na BD local (single-tenant); encriptar antes de multi-tenant.
    apiKey: z
        .string()
        .max(300)
        .nullish()
        .transform((v) => v ?? undefined),
});
export type AgenteConfig = z.infer<typeof AgenteConfigSchema>;

const AgentesSchema = z
    .object({
        claude: AgenteConfigSchema.optional(),
        codex: AgenteConfigSchema.optional(),
        gemini: AgenteConfigSchema.optional(),
        ollama: AgenteConfigSchema.optional(),
    })
    .default({});
export type Agentes = z.infer<typeof AgentesSchema>;

// O orquestrador de hoje: claude por cli (subscrição) — é o default vivo.
export const AGENTES_DEFAULT: Agentes = {
    claude: { ativo: true, modo: 'cli', apiKey: undefined },
};

// Módulos conhecidos (#60): a página de toggles. GitHub é o primeiro a sério;
// os restantes estão reservados (vault: brief §5 lista Campanhas; a visão do
// calendário aponta ao Google Workspace/agenda; Emails da escada).
export const MODULOS = ['github', 'emails', 'google-workspace', 'campanhas'] as const;
export type Modulo = (typeof MODULOS)[number];

export const MODULO_LABEL: Record<Modulo, string> = {
    github: 'GitHub',
    emails: 'Emails',
    'google-workspace': 'Google Workspace',
    campanhas: 'Campanhas',
};

export const DefinicoesSchema = z.object({
    metodoDestilacao: z.enum(METODOS_DESTILACAO).default('one-shot'),
    modulosAtivos: z.array(z.enum(MODULOS)).default([]),
    agentes: AgentesSchema,
});

export type Definicoes = z.infer<typeof DefinicoesSchema>;

export const DEFINICOES_DEFAULT: Definicoes = {
    metodoDestilacao: 'one-shot',
    modulosAtivos: [],
    agentes: AGENTES_DEFAULT,
};
