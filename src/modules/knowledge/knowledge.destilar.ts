import { generate } from '@/lib/claude';
import { EscritaKnowledgeSchema, type EscritaKnowledge } from './knowledge.schema';

export function buildDestilarPrompt(question: string, answer: string): string {
    return (
        'És o autor do workspace. Decide se esta troca contém um FACTO, DECISÃO ou CONHECIMENTO ' +
        'novo e DURÁVEL que valha guardar como nota. Critério apertado: NÃO guardes conversa trivial, ' +
        'saudações, nem o que já é óbvio. Se o utilizador pedir explicitamente para registar, guardar, ' +
        'anotar ou lembrar uma decisão/facto durável, isso é intenção forte de escrita: cria ou atualiza a nota.\n\n' +
        `Pergunta: ${question}\nResposta: ${answer}\n\n` +
        'Se NÃO valer, responde exatamente a palavra NADA.\n' +
        'Se valer, responde só um bloco ```json``` com: ' +
        '{"title": "...", "content_md": "markdown, podes ligar com [[wikilinks]]", "links": ["slug-alvo"], "reason": "porquê é durável"}.\n' +
        'REGRA PARA title: deve ser um rótulo CURTO de 3 a 6 palavras, máx. 60 caracteres, ' +
        'como um título de nota/wiki (ex.: "BD tipada vs memsearch"). ' +
        'NÃO deve ser uma frase completa, NÃO deve ter prefixos como "Daily Notes" ou "Decisão:", ' +
        'e NÃO deve descrever o contexto — só o tópico.'
    );
}

export function parseDestilacao(raw: string): EscritaKnowledge | null {
    const txt = raw.trim();
    if (txt === 'NADA' || txt.toUpperCase() === 'NADA') return null;
    const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fence ? fence[1] : txt;
    try {
        const parsed = EscritaKnowledgeSchema.safeParse(JSON.parse(candidate));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export async function destilar(question: string, answer: string): Promise<EscritaKnowledge | null> {
    const { text } = await generate(buildDestilarPrompt(question, answer));
    return parseDestilacao(text);
}
