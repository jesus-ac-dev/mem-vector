const LIMITE_TITULO = 56;

function capitalizarPrimeira(s: string): string {
    return s ? s.charAt(0).toLocaleUpperCase('pt') + s.slice(1) : s;
}

export function tituloInicialConversa(pergunta: string): string {
    let titulo = pergunta.replace(/\s+/g, ' ').trim();
    if (!titulo) return 'Conversa';

    titulo = titulo.replace(/\s+e\s+guarda\b.*$/i, '');
    titulo = titulo.replace(/\s+por favor\b.*$/i, '');
    titulo = titulo.replace(/\s+sff\b.*$/i, '');
    titulo = titulo.replace(/[?!.\s]+$/g, '');
    titulo = titulo.replace(/^resume\s+(?:o|a|os|as)?\s*/i, '');
    titulo = titulo.replace(/^cria\s+(?:uma|um)?\s*/i, '');
    titulo = titulo.replace(/^regista\s+(?:o|a|os|as)?\s*/i, '');
    titulo = capitalizarPrimeira(titulo.trim());

    if (!titulo) return 'Conversa';
    return titulo.length > LIMITE_TITULO ? `${titulo.slice(0, LIMITE_TITULO - 1)}…` : titulo;
}
