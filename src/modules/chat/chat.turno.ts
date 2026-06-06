import { generate } from '@/lib/claude';
import {
    EscritaKnowledgeSchema,
    type EscritaKnowledge,
} from '@/modules/knowledge/knowledge.schema';
import { parseDailyCapture } from '@/modules/daily/daily.capture';

export interface TurnoDestiladoRaw {
    resumoMd: string;
    nota: EscritaKnowledge | null;
}

// Prompt único que funde as duas tarefas de pós-resposta (resumo do daily +
// decisão/escrita de nota knowledge) numa só chamada ao CLI, em vez de duas.
export function buildTurnoPrompt(question: string, answer: string): string {
    return (
        'És o autor do workspace. Recebes uma troca (Pergunta/Resposta) e fazes DUAS coisas, ' +
        'devolvidas num ÚNICO bloco ```json``` com a forma {"daily": [...], "nota": null | {...}}.\n\n' +
        '1) "daily": array de 2 a 5 bullets curtos (strings, PT-PT) que resumem o que aconteceu ' +
        'neste turno — factos, decisões, alterações, bloqueios, próximos passos. Só o recap, não ' +
        'respondas ao utilizador.\n' +
        '2) "nota": decide se a troca contém um FACTO, DECISÃO ou CONHECIMENTO novo e DURÁVEL que ' +
        'valha guardar. Critério apertado: NÃO guardes conversa trivial, saudações nem o óbvio. Se o ' +
        'utilizador pedir explicitamente para registar/guardar/anotar/lembrar, é intenção forte de ' +
        'escrita. Se NÃO valer, "nota": null. Se valer, "nota": ' +
        '{"title": "...", "content_md": "markdown, podes ligar com [[wikilinks]]", "links": ["slug-alvo"], "reason": "porquê é durável"}.\n' +
        'REGRA PARA title: rótulo CURTO de 3 a 6 palavras, máx. 60 caracteres, como título de nota ' +
        '(ex.: "BD tipada vs memsearch"); NÃO uma frase completa, sem prefixos como "Daily Notes" ou ' +
        '"Decisão:", e sem descrever o contexto — só o tópico.\n\n' +
        `Pergunta: ${question}\nResposta: ${answer}\n\n` +
        'Responde só com o bloco ```json```.'
    );
}

// Parser tolerante: se o JSON falhar, salva o daily tratando o texto como bullets
// (o recap nunca se perde por causa de uma nota mal-formada).
export function parseTurno(raw: string): TurnoDestiladoRaw {
    const txt = raw.trim();
    const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fence ? fence[1] : txt;

    let obj: unknown;
    try {
        obj = JSON.parse(candidate);
    } catch {
        return { resumoMd: parseDailyCapture(raw), nota: null };
    }

    const rec = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {};
    const dailyRaw = Array.isArray(rec.daily)
        ? rec.daily.join('\n')
        : typeof rec.daily === 'string'
          ? rec.daily
          : '';
    const notaParsed = EscritaKnowledgeSchema.safeParse(rec.nota);

    return {
        resumoMd: parseDailyCapture(dailyRaw),
        nota: notaParsed.success ? notaParsed.data : null,
    };
}

// Uma só chamada ao CLI para o pós-turno (substitui destilar + resumir separados).
export async function destilarResumirTurno(
    question: string,
    answer: string,
): Promise<TurnoDestiladoRaw> {
    const { text } = await generate(buildTurnoPrompt(question, answer));
    return parseTurno(text);
}
