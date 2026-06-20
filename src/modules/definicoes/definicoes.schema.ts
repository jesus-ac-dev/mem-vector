import { z } from 'zod';

// #60: definições por utilizador — o que a mega modal lê e grava.
// Secções: Comportamento (como o agente-autor age — acumula ideias),
// Agentes (os providers/orquestradores) e Módulos (toggles).

export const METODOS_DESTILACAO = ['one-shot', 'agentic'] as const;
export type MetodoDestilacao = (typeof METODOS_DESTILACAO)[number];

// Agentes (#60 r2/r3, design do Carlos): os PROVIDERS que podem servir de
// orquestrador — por cli (subscrição/local) ou api (key obrigatória). O
// FactoryProvider (src/lib/providers) distribui; o chat responde com o
// provider escolhido em `chatProvider`.
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

// Modos REAIS por provider (#60 r9/r10): só se oferece o que o factory
// implementa. claude/codex/gemini correm por CLI (subscrição/login) ou API
// (key); ollama é o daemon local (sem key, sem escolha).
export const MODOS_POR_PROVIDER: Record<Provider, readonly ModoAgente[]> = {
    claude: ['cli', 'api'],
    codex: ['cli', 'api'],
    gemini: ['cli', 'api'],
    ollama: ['cli'],
};

/** Coage um modo gravado/default ao primeiro suportado pelo provider. */
export function modoEfetivo(provider: Provider, modo: ModoAgente): ModoAgente {
    const suportados = MODOS_POR_PROVIDER[provider];
    return suportados.includes(modo) ? modo : suportados[0];
}

// Garantia por resposta (#60 r12): escolher um modelo não chega — cada
// resposta confirma se o pedido foi honrado. O real vem da metadata do
// provider e pode trazer prefixo de família e sufixo de versão ('haiku' →
// 'claude-haiku-4-5', 'gemini-2.5-flash' → 'gemini-2.5-flash-002'). A
// comparação é por tokens: o pedido tem de aparecer contíguo no real e o que
// sobra a seguir só pode ser versão (números/latest) — nunca uma variante com
// nome ('gpt-5.5' vs 'gpt-5.5-mini' é downgrade, não confirmação).
function tokensModelo(s: string): string[] {
    return s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

export function confirmacaoModelo(
    pedido: string | undefined,
    real: string | undefined,
): 'confirmado' | 'divergente' | 'nao-reportado' {
    if (!real) return 'nao-reportado';
    if (!pedido) return 'confirmado'; // default do provider — nada para comparar
    const p = tokensModelo(pedido);
    const r = tokensModelo(real);
    for (let i = 0; i + p.length <= r.length; i++) {
        if (p.every((t, j) => r[i + j] === t)) {
            const resto = r.slice(i + p.length);
            if (resto.every((t) => /^[0-9]+$/.test(t) || t === 'latest')) return 'confirmado';
        }
    }
    return 'divergente';
}

// Esforço de raciocínio (referência: codex aceita model_reasoning_effort).
export const ESFORCOS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const;
export type Esforco = (typeof ESFORCOS)[number];

// Fallback de modelos por provider, usado até o "Testar ligação" descobrir a
// lista real (#60 r5/r6): codex/gemini/ollama dão lista VIVA (codex via
// `codex debug models` — solução do Carlos); claude usa os aliases oficiais
// do CLI (sem listagem no binário; a real viria da API /v1/models).
export const MODELOS_SUGERIDOS: Record<Provider, string[]> = {
    claude: ['opus', 'sonnet', 'haiku'],
    codex: [],
    gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
    ollama: [],
};

// Config de um provider tal como o CLIENTE a escreve: apiKey só viaja na
// gravação (undefined = manter a existente; '' = limpar).
export const AgenteConfigSchema = z.object({
    ativo: z.boolean().default(false),
    modo: z.enum(MODOS_AGENTE).default('cli'),
    modelo: z
        .string()
        .max(100)
        .nullish()
        .transform((v) => v || undefined),
    esforco: z
        .enum(ESFORCOS)
        .nullish()
        .transform((v) => v ?? undefined),
    apiKey: z
        .string()
        .max(300)
        .nullish()
        .transform((v) => (v === null ? '' : (v ?? undefined))), // null vira '' = limpar
    // Descobertos pelo Testar ligação; viajam NO GUARDAR (r13) — o teste já
    // não escreve na BD (criava meia-config fantasma com modo default).
    modelos: z.array(z.string().max(100)).max(300).optional(),
});
export type AgenteConfig = z.infer<typeof AgenteConfigSchema>;

// A ESCOLHA do chat (mini-modal, r13): update cirúrgico — só o provider que
// responde e o modelo/esforço dele. null = limpar; undefined = manter.
export const EscolhaChatSchema = z.object({
    provider: z.enum(PROVIDERS),
    modelo: z.string().max(100).nullish(),
    esforco: z.enum(ESFORCOS).nullish(),
});
export type EscolhaChat = z.infer<typeof EscolhaChatSchema>;

const AgentesSchema = z
    .object({
        claude: AgenteConfigSchema.optional(),
        codex: AgenteConfigSchema.optional(),
        gemini: AgenteConfigSchema.optional(),
        ollama: AgenteConfigSchema.optional(),
    })
    .default({});
export type Agentes = z.infer<typeof AgentesSchema>;

// O que o CLIENTE vê de um provider: a key NUNCA volta ao browser — só a
// máscara (cifra at rest em src/lib/cripto.ts).
export interface AgenteVista {
    ativo: boolean;
    modo: ModoAgente;
    modelo?: string;
    esforco?: Esforco;
    modelos?: string[]; // descobertos pelo Testar ligação (#60 r5)
    temApiKey: boolean;
    apiKeySufixo?: string;
}

export interface DefinicoesVista {
    metodoDestilacao: MetodoDestilacao;
    modulosAtivos: Modulo[];
    chatProvider: Provider;
    matchCount: number;
    webHabilitada: boolean;
    // #45: key Tavily da pesquisa web — máscara (a key nunca volta ao browser).
    webTemKey: boolean;
    webKeySufixo?: string;
    comportamento?: string; // #122: como o agente-autor age (texto livre)
    // M7: connection GitHub — o token nunca volta ao browser (só máscara).
    githubTemToken: boolean;
    githubKeySufixo?: string;
    githubRepos: string[];
    agentes: Partial<Record<Provider, AgenteVista>>;
}

// O que o SERVIDOR usa (factory): key decifrada, nunca serializada p/ fora.
export interface AgenteServidor {
    ativo: boolean;
    modo: ModoAgente;
    modelo?: string;
    esforco?: Esforco;
    modelos?: string[];
    apiKey?: string;
}

export interface DefinicoesServidor {
    metodoDestilacao: MetodoDestilacao;
    modulosAtivos: Modulo[];
    chatProvider: Provider;
    matchCount: number;
    webHabilitada: boolean;
    webKey?: string; // #45: decifrada, p/ a pesquisa web; nunca serializada p/ fora
    comportamento?: string; // #122: injetado no prompt do agente a seguir ao Kernel
    githubToken?: string; // M7: decifrado, vira o GH_TOKEN do subprocesso; nunca serializado p/ fora
    githubRepos: string[]; // M7: repos ligados ("owner/nome")
    agentes: Partial<Record<Provider, AgenteServidor>>;
}

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

// Input do Testar ligação (#60 r9): o teste corre contra a config PENDENTE do
// form (modo/modelo/key por gravar), não contra a gravada — uma key escrita ao
// calhas tem de rebentar ANTES do Guardar. apiKey undefined = usa a gravada.
export const TestarProviderSchema = z.object({
    provider: z.enum(PROVIDERS),
    config: AgenteConfigSchema.optional(),
});

// Input de gravação (a porta valida isto).
export const DefinicoesSchema = z.object({
    metodoDestilacao: z.enum(METODOS_DESTILACAO).default('one-shot'),
    modulosAtivos: z.array(z.enum(MODULOS)).default([]),
    chatProvider: z.enum(PROVIDERS).default('claude'),
    // #67: nº de fontes do retrieval do chat (antes fixo em 5). Limites sãos —
    // poucas perde contexto, muitas enchem o prompt de ruído e custo.
    matchCount: z.number().int().min(1).max(50).default(5),
    // #45: quando ON, a resposta do chat corre agentic-com-web (pesquisa a
    // internet). OFF (default) = comportamento de sempre.
    webHabilitada: z.boolean().default(false),
    // #45: key de pesquisa web (Tavily por omissão; opcional). undefined = manter
    // a cifrada; '' = limpar; string = cifrar. Mesmo contrato das keys dos providers.
    webKey: z.string().optional(),
    // #122 (Ponte F): texto livre onde o utilizador molda COMO o agente-autor age
    // (o equivalente web a editar o CLAUDE.md). Injetado no prompt a seguir ao
    // Kernel. Cap alinhado com o do Kernel para não engolir o prompt.
    comportamento: z.string().max(4000).optional(),
    // M7 Fatia 1: token GitHub (PAT fine-grained) — MESMO contrato das keys:
    // undefined = manter a cifrada; '' = limpar; string = cifrar. Decifrado vira
    // o GH_TOKEN do subprocesso gh (a conta do user do SaaS, não o gh do host).
    githubToken: z.string().optional(),
    // Repos ligados que o agente pode usar ("owner/nome"); não são segredo.
    githubRepos: z
        .array(z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'usa o formato owner/nome'))
        .max(50)
        .optional(),
    agentes: AgentesSchema,
});

export type Definicoes = z.infer<typeof DefinicoesSchema>;

// Sem defaults (#40, caminho a): um user novo NÃO nasce com provider ativo —
// configura as suas ligações em Definições > Agentes. Nenhum agente herda a
// conta/subscrição da máquina.
export const DEFINICOES_VISTA_DEFAULT: DefinicoesVista = {
    metodoDestilacao: 'one-shot',
    modulosAtivos: [],
    chatProvider: 'claude',
    matchCount: 5,
    webHabilitada: false,
    webTemKey: false,
    githubTemToken: false,
    githubRepos: [],
    agentes: {},
};
