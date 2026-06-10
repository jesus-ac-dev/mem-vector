import { generate } from '@/lib/claude';
import {
    EscritaKnowledgeSchema,
    type EscritaKnowledge,
    type NotaCandidata,
} from '@/modules/knowledge/knowledge.schema';
import { parseDailyCapture } from '@/modules/daily/daily.capture';
import type { Intencao } from './chat.intencao';
import type { MensagemConversa } from './chat.prompt';

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
        'CONTINUA uma destas APENAS se o facto pertencer mesmo ao assunto dela (título e ' +
        'conteúdo sobre o MESMO assunto): usa EXATAMENTE o mesmo "title" e devolve o ' +
        '"content_md" COMPLETO com o facto novo integrado (não percas o que já lá está). ' +
        'Uma nota de teste, quase vazia ou com título genérico NÃO captura factos novos — ' +
        'nesse caso cria nota nova com o título do assunto (pessoas → os nomes delas).\n\n'
    );
}

// Janela de conversa: a destilação resolve pronomes pelo fio, não adivinha.
function blocoConversaTurno(historico: MensagemConversa[]): string {
    if (!historico.length) return '';
    const linhas = historico
        .map((m) => `${m.role === 'user' ? 'Utilizador' : 'Assistente'}: ${m.content}`)
        .join('\n');
    return `Conversa recente (contexto para resolver pronomes e o assunto):\n${linhas}\n\n`;
}

// Bloco para intenção declarativa (#19): o utilizador declarou um facto sem
// marcas de pergunta — a nota deixa de ser opcional, salvo trivialidade.
function blocoFactoDeclarado(intencao?: Intencao): string {
    if (intencao?.tipo !== 'declarativa') return '';
    return (
        'ATENÇÃO: o utilizador DECLAROU UM FACTO (mensagem declarativa, sem marcas de ' +
        'pergunta). Neste turno "nota": null NÃO é opção, salvo se a mensagem for apenas ' +
        'saudação, agradecimento ou conversa trivial sem conteúdo: escreve o facto em ' +
        'knowledge — CONTINUA a nota candidata se houver, cria nova só se o assunto não existir. ' +
        'Escreve o FACTO autocontido (pronomes resolvidos em nomes via conversa recente), ' +
        'não meta-comentário sobre a conversa ou sobre o que falta esclarecer.\n\n'
    );
}

// Prompt único que funde as duas tarefas de pós-resposta (resumo do daily +
// decisão/escrita de nota knowledge) numa só chamada ao CLI, em vez de duas.
// Com candidatos, enviesa para UPDATE (continuar a nota dona do assunto).
export function buildTurnoPrompt(
    question: string,
    answer: string,
    candidatos: NotaCandidata[] = [],
    intencao?: Intencao,
    historico: MensagemConversa[] = [],
): string {
    return (
        'És o autor do workspace. Recebes uma troca (Pergunta/Resposta) e fazes DUAS coisas, ' +
        'devolvidas num ÚNICO bloco ```json``` com a forma {"daily": [...], "nota": null | {...}}.\n\n' +
        '1) "daily": array de 0 a 5 bullets curtos (strings, PT-PT) que resumem o que aconteceu ' +
        'neste turno — factos, decisões, alterações, bloqueios, próximos passos. Só o recap, não ' +
        'respondas ao utilizador. Escreve só o que aconteceu de facto, nunca mais do que foi dito ' +
        '— sem encher. Turno trivial (saudação, agradecimento, small talk sem conteúdo) = ' +
        '"daily": [] — o daily não regista o nada.\n' +
        '2) "nota": és PROATIVO a registar. Se a troca traz um FACTO, DECISÃO, PLANO, PREFERÊNCIA ou ' +
        'CONHECIMENTO durável sobre o utilizador, o trabalho ou a vida dele, ESCREVE-O — não esperes ' +
        'que peçam licença. Na dúvida entre guardar e não guardar, GUARDA: continua a nota dona (se ' +
        'houver candidata) e as versões são a rede; escrever no sítio certo consolida, não espalha. ' +
        'Só "nota": null para conversa MESMO trivial: saudações, agradecimentos, ou perguntas sem ' +
        'facto novo. Quando escreves, "nota": ' +
        '{"title": "...", "content_md": "markdown, podes ligar com [[wikilinks]]", "links": ["slug-alvo"], "reason": "porquê é durável"}.\n' +
        'REGRA PARA title: rótulo CURTO de 3 a 6 palavras, máx. 60 caracteres, como título de nota ' +
        '(ex.: "BD tipada vs memsearch"); NÃO uma frase completa, sem prefixos como "Daily Notes" ou ' +
        '"Decisão:", e sem descrever o contexto — só o tópico. Para factos sobre pessoas, o título ' +
        'são os nomes delas (ex.: "Carlos e Sofia"), nunca o facto.\n' +
        'REGRA PARA content_md: a nota é uma página viva de wiki sobre o ASSUNTO, escrita para ' +
        'leitura humana futura — prosa natural, factos integrados num texto que se lê de seguida ' +
        '(ex.: "O Carlos gosta da Sofia. Têm dois filhos juntos, o Lucas e o Filipe."). Começa com ' +
        '"# <título>". NUNCA escrevas carimbos de proveniência no corpo — nada de "(declarado a ' +
        '<data>)", "o utilizador disse" ou datas de registo: a proveniência fica no versionamento, ' +
        'fora do texto. Ao continuar uma nota, INTEGRA o facto novo na prosa existente ' +
        '(reescreve a frase certa se preciso), não acrescentes linhas-log no fim.\n\n' +
        blocoConversaTurno(historico) +
        blocoFactoDeclarado(intencao) +
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
    intencao?: Intencao,
    historico: MensagemConversa[] = [],
): Promise<TurnoDestiladoRaw> {
    const { text } = await generate(
        buildTurnoPrompt(question, answer, candidatos, intencao, historico),
    );
    return parseTurno(text);
}
