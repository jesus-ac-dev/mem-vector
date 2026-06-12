import { generate } from '@/lib/claude';
import {
    EscritaKnowledgeSchema,
    type EscritaKnowledge,
    type NotaCandidata,
} from '@/modules/knowledge/knowledge.schema';
import { TarefaDestiladaSchema, type TarefaDestilada } from '@/modules/tarefas/tarefas.schema';
import { hojeComDiaSemana, parseDailyCapture } from '@/modules/daily/daily.capture';
import type { Intencao } from './chat.intencao';
import type { MensagemConversa } from './chat.prompt';

// Referência leve das tarefas em aberto para o prompt (#21): o agente decide
// criar/concluir com a lista à frente, sem inventar ids.
export interface TarefaAbertaRef {
    id: string;
    titulo: string;
    projeto: string | null;
}

export interface TurnoDestiladoRaw {
    resumoMd: string;
    nota: EscritaKnowledge | null;
    tarefas: TarefaDestilada[];
    concluirIds: string[];
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
// Bloco das tarefas em aberto (#21): o agente vê o que existe para não
// duplicar e para poder concluir por id real.
function blocoTarefasAbertas(tarefas: TarefaAbertaRef[]): string {
    if (!tarefas.length) return '';
    const lista = tarefas
        .slice(0, 20)
        .map((t) => `- id: ${t.id} | ${t.titulo}${t.projeto ? ` | #${t.projeto}` : ''}`)
        .join('\n');
    return `TAREFAS EM ABERTO (para não duplicar; concluir por id quando a conversa diz que está feito):\n${lista}\n\n`;
}

export function buildTurnoPrompt(
    question: string,
    answer: string,
    candidatos: NotaCandidata[] = [],
    intencao?: Intencao,
    historico: MensagemConversa[] = [],
    kernel = '',
    tarefasAbertas: TarefaAbertaRef[] = [],
): string {
    return (
        // Kernel do workspace (#34): as regras/identidade do utilizador também
        // moldam o que se regista e como se escreve.
        (kernel ? `${kernel}\n` : '') +
        'És o autor do workspace. Recebes uma troca (Pergunta/Resposta) e fazes QUATRO coisas, ' +
        'devolvidas num ÚNICO bloco ```json``` com a forma ' +
        '{"daily": [...], "nota": null | {...}, "tarefas": [...], "concluir": [...]}.\n\n' +
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
        '{"title": "...", "content_md": "markdown, podes ligar com [[wikilinks]]", "links": ["slug-alvo"], "reason": "porquê é durável", "summary": "resumo de 1 frase"}.\n' +
        'REGRA PARA summary: UMA frase curta (máx. ~140 caracteres) que resume a NOTA INTEIRA ' +
        'como fica depois desta escrita — não o que mudou neste turno. Ao continuar uma nota, ' +
        're-resume o todo (conteúdo antigo + facto novo).\n' +
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
        '(reescreve a frase certa se preciso), não acrescentes linhas-log no fim.\n' +
        '3) "tarefas": array (pode ser vazio) de AÇÕES do utilizador — coisas a fazer, lembretes, ' +
        'coisas a acompanhar (ex.: "ligar ao contabilista", "rever proposta"). Na dúvida entre ' +
        'criar e não criar, CRIA — apagar é barato. Cada uma: {"titulo": "verbo + objeto, curto", ' +
        '"projeto": "tag-curta" | null, "prioridade": "baixa" | "normal" | "alta", ' +
        '"dataFim": "AAAA-MM-DD" | null}. Se a conversa traz um PRAZO ("até sexta", "este fim de ' +
        'semana", "antes da reunião de dia X"), define "dataFim" com a data concreta — fim de ' +
        'semana = o domingo; senão null. NÃO dupliques ' +
        'tarefa já em aberto (lista abaixo). FACTOS e conhecimento vão para "nota", NUNCA para ' +
        '"tarefas" — tarefa é o que o utilizador tem de FAZER.\n' +
        '4) "concluir": array (pode ser vazio) com os IDS das tarefas em aberto que a conversa diz ' +
        'estarem FEITAS (ex.: "já liguei ao contabilista" → o id dessa tarefa). Só ids da lista.\n\n' +
        `Hoje é ${hojeComDiaSemana()} — usa isto para resolver prazos relativos.\n\n` +
        blocoConversaTurno(historico) +
        blocoFactoDeclarado(intencao) +
        blocoCandidatos(candidatos) +
        blocoTarefasAbertas(tarefasAbertas) +
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
    if (!rec) return { resumoMd: parseDailyCapture(raw), nota: null, tarefas: [], concluirIds: [] };

    const dailyRaw = Array.isArray(rec.daily)
        ? rec.daily.join('\n')
        : typeof rec.daily === 'string'
          ? rec.daily
          : '';
    const notaParsed = EscritaKnowledgeSchema.safeParse(rec.nota);

    // Tarefas (#21): cada entrada válida conta; uma malformada não custa as
    // restantes (mesmo espírito tolerante do resto do parse).
    const tarefas: TarefaDestilada[] = Array.isArray(rec.tarefas)
        ? rec.tarefas.flatMap((t) => {
              const p = TarefaDestiladaSchema.safeParse(t);
              return p.success ? [p.data] : [];
          })
        : [];
    const concluirIds: string[] = Array.isArray(rec.concluir)
        ? rec.concluir.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        : [];

    // "daily": [] é deliberado (turno trivial) — não passa pelo parseDailyCapture,
    // que tem fallback não-vazio e mataria o "não regista o nada".
    const dailyVazio = Array.isArray(rec.daily) && rec.daily.length === 0;

    return {
        resumoMd: dailyVazio ? '' : parseDailyCapture(dailyRaw),
        nota: notaParsed.success ? notaParsed.data : null,
        tarefas,
        concluirIds,
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
    kernel = '',
    tarefasAbertas: TarefaAbertaRef[] = [],
): Promise<TurnoDestiladoRaw> {
    const { text } = await generate(
        buildTurnoPrompt(question, answer, candidatos, intencao, historico, kernel, tarefasAbertas),
    );
    return parseTurno(text);
}
