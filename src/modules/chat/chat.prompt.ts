export interface SourceMetadata {
    entity_type?: string;
    entity_id?: string;
    dia?: string;
    slug?: string;
    title?: string;
    [key: string]: unknown;
}

// Documento recuperado do RAG que alimenta o prompt do chat.
export interface Source {
    id?: string;
    content: string;
    source: string | null;
    similarity: number;
    lexical?: boolean; // o FTS bateu mesmo no termo da query (sinal léxico do híbrido)
    metadata?: SourceMetadata | null;
}

// Rede de segurança, não classificador. O e5-small comprime os scores de cosseno
// (medição em scripts/sim-measure.ts: relevantes ~0.83-0.89, irrelevantes ~0.76-0.80,
// janela ~0.03). Um corte que separe perfeitamente seria sobreajuste; este corte
// conservador fica com margem (~0.05) abaixo do menor relevante medido para nunca
// perder contexto bom, cortando só o lixo de fundo evidente. Revisível com mais dados.
export const RELEVANCE_THRESHOLD = 0.78;

// Filtra as fontes recuperadas, deixando só as relevantes o suficiente para servirem
// de contexto. Abaixo do corte, é melhor `(sem contexto)` + fallback do que injetar ruído.
// Threshold honesto do híbrido: uma fonte conta se for semanticamente próxima (cosseno
// >= threshold) OU se o FTS bateu no termo exato (lexical) — assim não se perdem slugs,
// erros ou IDs que o embedding dilui mas o utilizador escreveu literalmente.
export function relevantSources(
    sources: Source[],
    threshold: number = RELEVANCE_THRESHOLD,
): Source[] {
    return sources.filter((s) => s.similarity >= threshold || s.lexical === true);
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
