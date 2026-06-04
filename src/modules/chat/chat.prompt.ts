// Documento recuperado do RAG que alimenta o prompt do chat.
export interface Source {
    content: string;
    source: string | null;
    similarity: number;
}

// Regra RAG-preferred + LLM-fallback: o contexto é a fonte preferencial e conduz a
// resposta, mas a LLM nunca fica refém dele. Factos do workspace que não estejam no
// contexto não se inventam; conhecimento geral pode responder, sinalizado como tal.
const REGRA =
    'O contexto acima é a tua fonte preferencial — usa-o quando cobrir a pergunta. ' +
    'Se a pergunta for sobre o workspace (decisões, tarefas, notas ou factos específicos daqui) ' +
    'e o contexto não a cobrir, diz que não tens essa informação no workspace — não inventes. ' +
    'Se for conhecimento geral, podes responder do teu conhecimento, deixando claro de forma breve ' +
    'que é conhecimento geral e não vem do workspace.';

// Monta o prompt do ping-pong a partir da pergunta e das fontes recuperadas.
export function buildPrompt(question: string, sources: Source[]): string {
    const context = sources.length
        ? sources.map((s, i) => `[${i + 1}] ${s.content}`).join('\n\n')
        : '(sem contexto)';

    return (
        `Contexto recuperado da base de conhecimento:\n\n${context}\n\n` +
        `Pergunta: ${question}\n\n` +
        REGRA
    );
}
