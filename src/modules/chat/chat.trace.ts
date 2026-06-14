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
