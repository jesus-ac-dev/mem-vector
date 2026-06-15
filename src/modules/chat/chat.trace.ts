import {
    confirmacaoModelo,
    PROVIDER_LABEL,
    PROVIDERS,
    type Provider,
} from '@/modules/definicoes/definicoes.schema';

export interface ChatTrace {
    provider?: Provider | string | null;
    requestedModel?: string | null;
    effectiveModel?: string | null;
    costUsd?: number | null;
    tokensIn?: number | null; // total (fresco + cache no claude)
    tokensCache?: number | null; // porção de cache (só o claude reporta)
    tokensOut?: number | null;
    latencyMs?: number | null;
    sourcesCount?: number | null;
    createdAt?: string | null;
    distillationJobId?: string | null;
}

export type TraceModelState = 'confirmado' | 'divergente' | 'nao-reportado';

export interface TraceModelEvidence {
    state: TraceModelState;
    label: string;
}

function isProvider(value: string): value is Provider {
    return (PROVIDERS as readonly string[]).includes(value);
}

export function traceProviderLabel(provider: ChatTrace['provider']): string {
    if (!provider) return 'Provider desconhecido';
    return isProvider(provider) ? PROVIDER_LABEL[provider] : provider;
}

export function traceBadgeLabel(trace: ChatTrace | null | undefined): string {
    if (!trace) return 'Trace indisponível';
    const model = trace.effectiveModel ?? trace.requestedModel ?? 'modelo default';
    return `${traceProviderLabel(trace.provider)} · ${model}`;
}

// Tokens do turno (#65) para o inspector de trace. Com cache (claude) parte o
// total em fresco/cache/out — um número só engana (parece enorme, mas o grosso
// é cache barato). Sem cache (codex/gemini/ollama) mostra só in/out. Nenhum
// reportado = diz alto; só um = travessão no lado em falta.
export function formatarTokens(
    tokensIn: number | null | undefined,
    tokensCache: number | null | undefined,
    tokensOut: number | null | undefined,
): string {
    const semIn = tokensIn === null || tokensIn === undefined;
    const semOut = tokensOut === null || tokensOut === undefined;
    if (semIn && semOut) return 'não reportado pelo provider';
    if (typeof tokensIn === 'number' && typeof tokensCache === 'number' && tokensCache > 0) {
        const fresco = Math.max(0, tokensIn - tokensCache);
        return `${fresco} fresco · ${tokensCache} cache · ${semOut ? '—' : tokensOut} out`;
    }
    return `${semIn ? '—' : tokensIn} in · ${semOut ? '—' : tokensOut} out`;
}

export interface TraceTotais {
    custoUsd: number | null;
    tokensIn: number | null;
    tokensCache: number | null;
    tokensOut: number | null;
}

function somar(valores: (number | null | undefined)[]): number | null {
    const numeros = valores.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    return numeros.length ? numeros.reduce((a, b) => a + b, 0) : null;
}

// Totalizador da conversa (#65, pedido do Carlos): soma custo e tokens de todos
// os turnos para o footer fixo do trace. Soma só o que foi reportado — null se
// nenhum turno o trouxe (turnos pré-feature não estragam o total).
export function totaisDoTrace(traces: (ChatTrace | null | undefined)[]): TraceTotais {
    const t = traces.filter((x): x is ChatTrace => !!x);
    return {
        custoUsd: somar(t.map((x) => x.costUsd)),
        tokensIn: somar(t.map((x) => x.tokensIn)),
        tokensCache: somar(t.map((x) => x.tokensCache)),
        tokensOut: somar(t.map((x) => x.tokensOut)),
    };
}

export function traceModelEvidence(trace: ChatTrace): TraceModelEvidence {
    const state = confirmacaoModelo(
        trace.requestedModel ?? undefined,
        trace.effectiveModel ?? undefined,
    );

    if (state === 'divergente') {
        return { state, label: 'modelo diferente do pedido' };
    }
    if (state === 'nao-reportado') {
        return { state, label: 'provider não reportou modelo efetivo' };
    }
    return { state, label: 'modelo confirmado pelo provider' };
}
