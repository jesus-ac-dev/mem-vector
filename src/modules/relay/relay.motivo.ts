export type MotivoBloqueio = 'erro' | 'orfao' | 'sem-consenso';

// O motivo do bloqueio já está codificado no `relay_fase` escrito pelo orchestrator:
// 'erro' = falhou antes de concluir (ex. provider sem tokens, #141); 'órfão'/'orfao'
// = o processo morreu a meio (crash/restart, #M7-D); uma fase real (dev/testes/…) = não
// convergiu nessa fase (sem-consenso). Derivar > duplicar (sem coluna nova).
export function motivoBloqueio(relayFase: string | null): {
    codigo: MotivoBloqueio;
    descricao: string;
} {
    const fase = normalizarRelayFase(relayFase);

    if (fase === 'erro')
        return {
            codigo: 'erro',
            descricao: 'o relay falhou antes de concluir (ex.: provider sem tokens)',
        };
    if (fase === 'orfao')
        return {
            codigo: 'orfao',
            descricao: 'o processo do relay morreu a meio (crash/restart) e foi marcado órfão',
        };
    return {
        codigo: 'sem-consenso',
        descricao: 'os agentes não convergiram nesta fase dentro do número de rondas',
    };
}

function normalizarRelayFase(relayFase: string | null): string {
    return (relayFase ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}
