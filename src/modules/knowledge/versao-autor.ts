// Rótulo humano do autor de uma file_version (#23): a autoria é por PESSOA —
// com partilhas de grupo "user" é ambíguo, mostra-se o nome de quem escreveu
// (display name/email resolvido em versoes-nomes). "agente" identifica o
// agente-autor do workspace.
export function rotuloAutor(author: string, autorNome?: string | null): string {
    if (author === 'agent') return 'agente';
    if (author === 'user') return autorNome ?? 'utilizador';
    return author;
}
