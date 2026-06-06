import { generate } from '@/lib/claude';
import {
    EscritaKnowledgeSchema,
    type EscritaKnowledge,
    type NotaCandidata,
} from '@/modules/knowledge/knowledge.schema';
import { parseDailyCapture } from '@/modules/daily/daily.capture';

export interface TurnoDestiladoRaw {
    resumoMd: string;
    nota: EscritaKnowledge | null;
}

// Secção de UPDATE-bias: oferece as notas existentes relacionadas para o agente
// CONTINUAR a certa, em vez de criar uma nota nova por facto.
function blocoCandidatos(candidatos: NotaCandidata[]): string {
    if (!candidatos.length) return '';
    // Conteúdo entre <nota>…</nota> para o limite ser inequívoco (evita que um
    // título ou um bloco de código dentro da nota se confunda com o prompt).
    const lista = candidatos
        .map((c) => `- título: "${c.title}"\n  conteúdo atual:\n<nota>\n${c.contentMd}\n</nota>`)
        .join('\n\n');
    return (
        'NOTAS EXISTENTES (preferir CONTINUAR uma destas a criar nova):\n' +
        `${lista}\n\n` +
        'Se o facto pertencer a uma destas notas, CONTINUA-A: usa EXATAMENTE o mesmo "title" e ' +
        'devolve o "content_md" COMPLETO com o facto novo integrado (não percas o que já lá está). ' +
        'Só cria nota nova se for mesmo um assunto novo.\n\n'
    );
}

// Prompt único que funde as duas tarefas de pós-resposta (resumo do daily +
// decisão/escrita de nota knowledge) numa só chamada ao CLI, em vez de duas.
// Com candidatos, enviesa para UPDATE (continuar a nota dona do assunto).
export function buildTurnoPrompt(
    question: string,
    answer: string,
    candidatos: NotaCandidata[] = [],
): string {
    return (
        'És o autor do workspace. Recebes uma troca (Pergunta/Resposta) e fazes DUAS coisas, ' +
        'devolvidas num ÚNICO bloco ```json``` com a forma {"daily": [...], "nota": null | {...}}.\n\n' +
        '1) "daily": array de 2 a 5 bullets curtos (strings, PT-PT) que resumem o que aconteceu ' +
        'neste turno — factos, decisões, alterações, bloqueios, próximos passos. Só o recap, não ' +
        'respondas ao utilizador.\n' +
        '2) "nota": és PROATIVO a registar. Se a troca traz um FACTO, DECISÃO, PLANO, PREFERÊNCIA ou ' +
        'CONHECIMENTO durável sobre o utilizador, o trabalho ou a vida dele, ESCREVE-O — não esperes ' +
        'que peçam licença. Na dúvida entre guardar e não guardar, GUARDA: continua a nota dona (se ' +
        'houver candidata) e as versões são a rede; escrever no sítio certo consolida, não espalha. ' +
        'Só "nota": null para conversa MESMO trivial: saudações, agradecimentos, ou perguntas sem ' +
        'facto novo. Quando escreves, "nota": ' +
        '{"title": "...", "content_md": "markdown, podes ligar com [[wikilinks]]", "links": ["slug-alvo"], "reason": "porquê é durável"}.\n' +
        'REGRA PARA title: rótulo CURTO de 3 a 6 palavras, máx. 60 caracteres, como título de nota ' +
        '(ex.: "BD tipada vs memsearch"); NÃO uma frase completa, sem prefixos como "Daily Notes" ou ' +
        '"Decisão:", e sem descrever o contexto — só o tópico.\n\n' +
        blocoCandidatos(candidatos) +
        `Pergunta: ${question}\nResposta: ${answer}\n\n` +
        'Responde só com o bloco ```json```.'
    );
}

// Extrai o objeto JSON da resposta do CLI, robusto a blocos de código internos:
// tenta primeiro o intervalo do 1.º `{` ao último `}` (fences ` ``` ` ficam dentro
// de strings JSON, não partem o parse), depois o bloco cercado, depois o cru.
function extrairObjeto(txt: string): Record<string, unknown> | null {
    const tentativas: string[] = [];
    const ini = txt.indexOf('{');
    const fim = txt.lastIndexOf('}');
    if (ini !== -1 && fim > ini) tentativas.push(txt.slice(ini, fim + 1));
    const fence = txt.match(/```(?:json)?\s*([\s\S]*)```/);
    if (fence) tentativas.push(fence[1]);
    tentativas.push(txt);

    for (const t of tentativas) {
        try {
            const o: unknown = JSON.parse(t);
            if (o && typeof o === 'object' && !Array.isArray(o)) {
                return o as Record<string, unknown>;
            }
        } catch {
            // tenta a próxima
        }
    }
    return null;
}

// Parser tolerante: se não houver objeto válido, salva o daily tratando o texto
// como bullets (o recap nunca se perde por causa de uma nota mal-formada).
export function parseTurno(raw: string): TurnoDestiladoRaw {
    const rec = extrairObjeto(raw.trim());
    if (!rec) return { resumoMd: parseDailyCapture(raw), nota: null };

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
// Os candidatos (notas existentes relacionadas) enviesam para UPDATE.
export async function destilarResumirTurno(
    question: string,
    answer: string,
    candidatos: NotaCandidata[] = [],
): Promise<TurnoDestiladoRaw> {
    const { text } = await generate(buildTurnoPrompt(question, answer, candidatos));
    return parseTurno(text);
}
