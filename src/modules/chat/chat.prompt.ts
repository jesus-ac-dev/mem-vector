import { REGRA_DATAMARK, envolverDados } from '@/lib/datamark';

import type { Intencao } from './chat.intencao';

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
    'Estás dentro da app mem-vector, não dentro do Obsidian nem de um terminal. ' +
    'Nunca proponhas comandos do Obsidian, CLI, vault local ou aprovações para ferramentas externas. ' +
    'Quando o utilizador pedir para criar/guardar/registar daily notes, notas ou memória, responde em termos ' +
    'do workspace e do agente-autor; o pós-turno persistente tratará do registo quando houver conteúdo durável. ' +
    'O contexto acima é a tua fonte preferencial — usa-o quando cobrir a pergunta. ' +
    'Quando afirmares que uma nota ou fonte contém algo, cita o trecho literal entre aspas ' +
    'a partir do contexto acima; nunca digas que uma fonte contém o que não está lá. ' +
    'Se a pergunta for sobre o workspace (decisões, tarefas, notas ou factos específicos daqui) ' +
    'e o contexto não a cobrir, diz que não tens essa informação no workspace — não inventes. ' +
    'Se for conhecimento geral, podes responder do teu conhecimento, deixando claro de forma breve ' +
    'que é conhecimento geral e não vem do workspace.';

// Regra para afirmações declarativas (#19): sem marcas de pergunta = facto a registar.
// A escrita real acontece no pós-turno (job de destilação); aqui só se confirma.
function regraFacto(incerta: boolean): string {
    return (
        'A mensagem do utilizador é uma afirmação declarativa, SEM marcas de pergunta — ' +
        'trata-a como FACTO A REGISTAR, não como pergunta. Se contém um facto, preferência, ' +
        'decisão ou informação sobre o utilizador, o trabalho ou a vida dele, responde ' +
        'exatamente uma linha no formato "Registado: <facto reformulado curto>." — sem pedir ' +
        'confirmação nem perguntar se deve registar. O facto reformulado deve ser autocontido: ' +
        'resolve pronomes ("eles", "deles", "ela") com os nomes da conversa recente acima. ' +
        'O pós-turno persistente fará a escrita; não digas que não consegues guardar. ' +
        (incerta
            ? 'A afirmação traz uma marca de incerteza ("talvez", "acho que"…): regista na ' +
              'mesma e acrescenta no fim " (assumi que é facto — se era pergunta, diz)". '
            : '') +
        'Só se a mensagem for apenas saudação, agradecimento ou conversa trivial sem facto ' +
        'é que respondes normalmente, sem registar.'
    );
}

export interface MensagemConversa {
    role: 'user' | 'assistant';
    content: string;
}

// Janela de conversa: sem o fio, "eles têm dois filhos" não tem sujeito.
function blocoConversa(historico: MensagemConversa[]): string {
    if (!historico.length) return '';
    const linhas = historico
        .map((m) => `${m.role === 'user' ? 'Utilizador' : 'Assistente'}: ${m.content}`)
        .join('\n');
    return `Conversa recente (mais antiga primeiro):\n${envolverDados(linhas, 'conversa')}\n\n`;
}

// Monta o prompt do ping-pong a partir da pergunta e das fontes recuperadas.
// Com intenção declarativa, o rótulo e a regra mudam: é um facto a registar.
export function buildPrompt(
    question: string,
    sources: Source[],
    intencao?: Intencao,
    historico: MensagemConversa[] = [],
    kernel = '',
): string {
    const context = sources.length
        ? envolverDados(sources.map((s, i) => `[${i + 1}] ${s.content}`).join('\n\n'), 'rag')
        : '(sem contexto)';

    const declarativa = intencao?.tipo === 'declarativa';
    const rotulo = declarativa ? 'Afirmação do utilizador' : 'Pergunta';
    const regrasBase = declarativa
        ? `${regraFacto(intencao?.incerta === true)}\n\n${REGRA}`
        : REGRA;
    const regras = `${regrasBase}\n\n${REGRA_DATAMARK}`;

    return (
        // Kernel do workspace (#34) primeiro: identidade/regras do utilizador
        // moldam a resposta antes do contexto recuperado.
        (kernel ? `${kernel}\n` : '') +
        `Contexto recuperado da base de conhecimento:\n\n${context}\n\n` +
        blocoConversa(historico) +
        `${rotulo}: ${question}\n\n` +
        regras
    );
}
