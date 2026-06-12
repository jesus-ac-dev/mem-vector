export interface ClientErrorContext {
    area: string;
    action: string;
    meta?: Record<string, unknown>;
}

export interface ClientErrorLogEntry {
    ts: string;
    url: string | null;
    context: ClientErrorContext;
    error: {
        name: string;
        message: string;
        stack: string | null;
        digest: string | null;
        cause: string | null;
    };
}

type WindowWithMemVectorErrors = Window & {
    __MEM_VECTOR_ERRORS__?: ClientErrorLogEntry[];
};

function stringifyUnknown(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

const UNEXPECTED_SERVER_ACTION_RESPONSE = 'An unexpected response was received from the server.';

export function isUnexpectedServerActionResponse(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : (stringifyUnknown(error) ?? 'Erro desconhecido');
    return message.includes(UNEXPECTED_SERVER_ACTION_RESPONSE);
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryTransientClientAction<T>(
    action: () => Promise<T>,
    options: { retries?: number; delayMs?: number } = {},
): Promise<T> {
    const retries = options.retries ?? 1;
    const delayMs = options.delayMs ?? 250;
    let tentativa = 0;

    while (true) {
        try {
            return await action();
        } catch (error) {
            if (tentativa >= retries || !isUnexpectedServerActionResponse(error)) {
                throw error;
            }
            tentativa += 1;
            if (delayMs > 0) await wait(delayMs);
        }
    }
}

function normalizarErro(error: unknown): ClientErrorLogEntry['error'] {
    if (error instanceof Error) {
        const extra = error as Error & { digest?: unknown; cause?: unknown };
        return {
            name: error.name,
            message: error.message,
            stack: error.stack ?? null,
            digest: stringifyUnknown(extra.digest),
            cause: stringifyUnknown(extra.cause),
        };
    }

    return {
        name: typeof error,
        message: stringifyUnknown(error) ?? 'Erro desconhecido',
        stack: null,
        digest: null,
        cause: null,
    };
}

export function logClientError(context: ClientErrorContext, error: unknown): ClientErrorLogEntry {
    const entry: ClientErrorLogEntry = {
        ts: new Date().toISOString(),
        url: typeof window === 'undefined' ? null : window.location.href,
        context,
        error: normalizarErro(error),
    };

    if (typeof window !== 'undefined') {
        const w = window as WindowWithMemVectorErrors;
        w.__MEM_VECTOR_ERRORS__ = [entry, ...(w.__MEM_VECTOR_ERRORS__ ?? [])].slice(0, 25);
    }

    console.error('[mem-vector/client-error]', entry);
    return entry;
}

// Evento de app stale (#49): "unexpected response" = build novo com tab aberto
// (action IDs rodados) OU sessão expirada (redirect de auth). Em vez de morrer
// em silêncio, avisa-se a UI para oferecer a recarga.
export const STALE_APP_EVENT = 'memvector:stale-app';

export async function runClientAction<T>(
    context: ClientErrorContext,
    action: () => Promise<T>,
): Promise<T | undefined> {
    try {
        return await action();
    } catch (error) {
        logClientError(context, error);
        if (typeof window !== 'undefined' && isUnexpectedServerActionResponse(error)) {
            window.dispatchEvent(new CustomEvent(STALE_APP_EVENT, { detail: context }));
        }
        return undefined;
    }
}
