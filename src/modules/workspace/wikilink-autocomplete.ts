export interface NotaLinkavel {
    tipo: 'knowledge' | 'daily';
    id?: string;
    titulo: string; // texto mostrado e inserido entre [[ ]]
    chave: string; // slug (knowledge) ou dia (daily)
}

export interface GatilhoLink {
    termo: string; // texto já escrito a seguir ao [[
    inicio: number; // índice do primeiro caractere depois do [[
}

// Deteta se o cursor está dentro de um [[ aberto (sem ]] nem quebra de linha até
// ao cursor) e devolve o termo escrito. Devolve null se não há gatilho ativo.
export function detetarGatilho(texto: string, cursor: number): GatilhoLink | null {
    const antes = texto.slice(0, cursor);
    const abre = antes.lastIndexOf('[[');
    if (abre === -1) return null;
    const depois = antes.slice(abre + 2);
    if (depois.includes(']]') || depois.includes('\n')) return null;
    return { termo: depois, inicio: abre + 2 };
}

// Filtra as notas linkáveis pelo termo (substring, case-insensitive), com as
// knowledge antes das daily, limitado a `limite`.
export function filtrarNotasParaLink(
    notas: NotaLinkavel[],
    termo: string,
    limite = 8,
): NotaLinkavel[] {
    const t = termo.trim().toLowerCase();
    const corresponde = t ? notas.filter((n) => n.titulo.toLowerCase().includes(t)) : notas;
    const ordenadas = [...corresponde].sort((a, b) =>
        a.tipo === b.tipo ? 0 : a.tipo === 'knowledge' ? -1 : 1,
    );
    return ordenadas.slice(0, limite);
}
