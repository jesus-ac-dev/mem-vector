// Rótulo humano do autor de uma file_version (#23): o histórico mostra a
// autoria sem ambiguidade — "tu" vs "agente" — em vez dos valores crus da BD.
export function rotuloAutor(author: string): string {
    if (author === 'agent') return 'agente';
    if (author === 'user') return 'tu';
    return author;
}
