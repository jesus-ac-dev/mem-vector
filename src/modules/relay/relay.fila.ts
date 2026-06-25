// Fila do relay: um relay por repo de cada vez (lock da working-copy git — dois
// relays na mesma cópia conflituam). Um 2º disparo no mesmo repo ENFILEIRA (FIFO,
// dedup) em vez de ser rejeitado; quando o atual termina, o próximo corre.
// In-memory (best-effort, como o lock antigo — um restart perde a fila; a deteção de
// órfãos #M7-D cobre os relays que estavam a correr no crash).
const ativos = new Map<string, number>();
const filas = new Map<string, number[]>();

// Tenta ocupar o repo. Livre → ocupa, devolve {correr:true, posicao:0}. Ocupado →
// enfileira a issue (dedup) e devolve {correr:false, posicao} com a posição REAL na
// fila (1-based) — tanto para uma issue nova como para uma já enfileirada (re-disparo).
// Se a mesma issue já está a correr, devolve {correr:false, posicao:0} e não duplica.
export function ocuparOuEnfileirar(
    repo: string,
    issue: number,
): { correr: boolean; posicao: number } {
    if (!ativos.has(repo)) {
        ativos.set(repo, issue);
        return { correr: true, posicao: 0 };
    }
    if (ativos.get(repo) === issue) return { correr: false, posicao: 0 };
    const q = filas.get(repo) ?? [];
    const existente = q.indexOf(issue);
    if (existente >= 0) return { correr: false, posicao: existente + 1 };
    q.push(issue);
    filas.set(repo, q);
    return { correr: false, posicao: q.length };
}

// O relay atual no repo terminou: devolve a próxima issue (mantendo o repo ocupado
// por ela), ou null e LIBERTA o repo se a fila está vazia.
export function proximaOuLibertar(repo: string): number | null {
    const q = filas.get(repo);
    if (q && q.length > 0) {
        const proxima = q.shift()!;
        ativos.set(repo, proxima);
        if (q.length === 0) filas.delete(repo);
        return proxima;
    }
    ativos.delete(repo);
    return null;
}

// Só para testes: limpa o estado in-memory entre casos.
export function _resetFila(): void {
    ativos.clear();
    filas.clear();
}
