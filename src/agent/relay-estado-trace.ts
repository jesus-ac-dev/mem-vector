import { motivoBloqueio } from '@/modules/relay/relay.motivo';

export interface EstadoRelayIssue {
    relayEstado: string | null;
    relayFase: string | null;
}

export interface ComentarioIssue {
    autor: string;
    corpo: string;
}

export type EstadoRelayAgente<T extends EstadoRelayIssue> =
    | T
    | (T & {
          motivo: ReturnType<typeof motivoBloqueio>;
          trace?: ComentarioIssue[];
          traceAviso?: string;
      });

export function montarEstadoRelayAgente<T extends EstadoRelayIssue>(
    estado: T,
    trace?: ComentarioIssue[],
    traceAviso?: string,
): EstadoRelayAgente<T> {
    if (estado.relayEstado !== 'bloqueado') return estado;
    return {
        ...estado,
        motivo: motivoBloqueio(estado.relayFase),
        ...(trace ? { trace } : {}),
        ...(traceAviso ? { traceAviso } : {}),
    };
}

export async function montarEstadoRelayAgenteComTrace<T extends EstadoRelayIssue>(
    estado: T,
    lerTrace: () => Promise<ComentarioIssue[]>,
): Promise<EstadoRelayAgente<T>> {
    if (estado.relayEstado !== 'bloqueado') return estado;
    try {
        return montarEstadoRelayAgente(estado, await lerTrace());
    } catch (e) {
        const detalhe = e instanceof Error ? e.message : String(e);
        return montarEstadoRelayAgente(
            estado,
            undefined,
            `Não consegui ler os comentários/trace da issue: ${detalhe}`,
        );
    }
}
