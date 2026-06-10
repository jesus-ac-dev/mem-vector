const H1_RE = /^#\s+(.+?)\s*#*\s*$/;

export function primeiroTituloMarkdown(markdown: string): string | null {
    for (const linha of markdown.split('\n')) {
        const match = H1_RE.exec(linha);
        if (!match) continue;
        const titulo = match[1].trim();
        return titulo.length > 0 ? titulo : null;
    }
    return null;
}

export function substituirPrimeiroTituloMarkdown(markdown: string, titulo: string): string {
    const linhas = markdown.split('\n');
    const novoTitulo = `# ${titulo.trim()}`;

    for (let i = 0; i < linhas.length; i++) {
        if (!H1_RE.test(linhas[i])) continue;
        linhas[i] = novoTitulo;
        return linhas.join('\n');
    }

    return `${novoTitulo}\n\n${markdown}`;
}
