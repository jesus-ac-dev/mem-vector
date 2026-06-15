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
