export interface Cor {
    label: string;
    hex: string;
}

// Paleta curada — cores distinguíveis no grafo (tom médio, lê-se em claro/escuro).
export const PALETA: Cor[] = [
    { label: 'Azul', hex: '#3b82f6' },
    { label: 'Verde', hex: '#22c55e' },
    { label: 'Vermelho', hex: '#ef4444' },
    { label: 'Âmbar', hex: '#f59e0b' },
    { label: 'Roxo', hex: '#a855f7' },
    { label: 'Rosa', hex: '#ec4899' },
    { label: 'Ciano', hex: '#06b6d4' },
    { label: 'Lima', hex: '#84cc16' },
];

export const COR_DEFAULT = '#9ca3af'; // cinza — knowledge sem pasta/cor
export const COR_DAILY_DEFAULT = '#64748b'; // slate — daily sem cor configurada

// Resolve a cor guardada (hex ou null) para um hex utilizável, com fallback.
export function resolverCor(
    hex: string | null | undefined,
    fallback: string = COR_DEFAULT,
): string {
    return hex && hex.trim() ? hex : fallback;
}
