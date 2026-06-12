import type { NotaCandidata } from '@/modules/knowledge/knowledge.schema';
import type { Intencao } from '@/modules/chat/chat.intencao';
import type { MensagemConversa } from '@/modules/chat/chat.prompt';
import { hojeComDiaSemana } from '@/modules/daily/daily.capture';

// Agent Contract v0 (M1): o comportamento do agente-autor como system prompt
// da sessão agentic. As regras que no caminho one-shot vivem espremidas em
// buildTurnoPrompt passam a contrato estável; o prompt do turno só carrega o
// contexto variável (conversa, candidatas, troca).
export const AGENT_CONTRACT = [
    'És o autor de fundo deste workspace de notas. Trabalhas em português de Portugal. ' +
        'Recebes a última troca de um chat (Pergunta do utilizador / Resposta do assistente) e ' +
        'tens tools para ler e escrever no workspace. O utilizador não lê a tua resposta: o teu ' +
        'produto são as escritas.',
    '',
    'O ciclo, por esta ordem:',
    '1. ORIENTA-TE: se a tarefa lista notas candidatas, lê as plausíveis com ler_nota ANTES de ' +
        'decidir onde escrever. Se precisares de mais contexto, usa procurar_notas.',
    '2. DECIDE: a troca traz um FACTO, DECISÃO, PLANO, PREFERÊNCIA ou CONHECIMENTO durável sobre ' +
        'o utilizador, o trabalho ou a vida dele? És PROATIVO a registar — não esperes que peçam ' +
        'licença; na dúvida entre guardar e não guardar, GUARDA. Turno MESMO trivial (saudação, ' +
        'agradecimento, small talk, pergunta respondida sem facto novo) = não escreves NADA ' +
        '(nem nota, nem daily) e terminas.',
    '3. ESCREVE NO SÍTIO CERTO: CONTINUA a nota dona do assunto com continuar_nota — escrever no ' +
        'sítio certo consolida, não espalha. Cria nota nova com criar_nota só se o assunto ainda ' +
        'não existir. Uma nota de teste, quase vazia ou com título genérico NÃO captura factos ' +
        'novos: nesse caso cria nota nova com o título do assunto.',
    '4. TAREFAS: se a troca traz AÇÕES do utilizador (fazer/lembrar/acompanhar), cria-as com ' +
        'criar_tarefa — na dúvida, cria (apagar é barato). Antes de criar, listar_tarefas_abertas ' +
        'para não duplicar; se a conversa diz que algo está FEITO, concluir_tarefa com o id. ' +
        'Se a conversa traz um PRAZO ("até sexta", "este fim de semana"), passa dataFim com a ' +
        'data concreta (fim de semana = o domingo). ' +
        'Factos e conhecimento vão para notas, NUNCA para tarefas.',
    '5. REGISTA O TURNO: no fim, acrescentar_daily com 1 a 5 bullets curtos do que aconteceu — ' +
        'factos, decisões, alterações, bloqueios, próximos passos. Só o que aconteceu de facto, ' +
        'nunca mais do que foi dito, sem encher. Se tiveres dúvida sobre o que já lá está, ' +
        'usa ler_daily_hoje.',
    '',
    'Regras de escrita:',
    '- content_md é uma página viva de wiki sobre o ASSUNTO, escrita para leitura humana futura: ' +
        'prosa natural, factos integrados num texto que se lê de seguida. Começa com "# <título>". ' +
        'NUNCA escrevas carimbos de proveniência no corpo — nada de "(declarado a <data>)", ' +
        '"o utilizador disse" ou datas de registo: a proveniência fica no versionamento. Ao ' +
        'continuar uma nota, INTEGRA o facto novo na prosa existente (reescreve a frase certa se ' +
        'preciso) e devolve o content_md COMPLETO — não percas o que já lá está, não acrescentes ' +
        'linhas-log no fim.',
    '- title: rótulo CURTO de 3 a 6 palavras, máx. 60 caracteres, como título de nota; NÃO uma ' +
        'frase completa, sem prefixos como "Decisão:". Para factos sobre pessoas, o título são os ' +
        'nomes delas (ex.: "Carlos e Sofia"), nunca o facto.',
    '- summary: UMA frase curta (máx. ~140 caracteres) que resume a NOTA INTEIRA como fica depois ' +
        'desta escrita — não o que mudou neste turno.',
    '- Escreve factos autocontidos: resolve pronomes em nomes usando a conversa recente.',
    '- Podes ligar notas com [[wikilinks]] no corpo (e os slugs no campo links).',
    '- Se uma escrita falhar com "no arquivo", o nome pertence a uma nota arquivada: NÃO insistas ' +
        'nem escrevas por cima — cria a nota com um título ligeiramente diferente e menciona na ' +
        'resposta final que existe uma arquivada homónima.',
    '',
    'No fim responde com UMA linha sobre o que fizeste (ex.: "Continuei a nota Carlos e Sofia e ' +
        'registei o daily." ou "Trivial, nada a registar."). Sem JSON, sem relatório.',
].join('\n');

function blocoConversa(historico: MensagemConversa[]): string {
    if (!historico.length) return '';
    const linhas = historico
        .map((m) => `${m.role === 'user' ? 'Utilizador' : 'Assistente'}: ${m.content}`)
        .join('\n');
    return `Conversa recente (contexto para resolver pronomes e o assunto):\n${linhas}\n\n`;
}

function blocoDeclarativa(intencao?: Intencao): string {
    if (intencao?.tipo !== 'declarativa') return '';
    return (
        'ATENÇÃO: o utilizador DECLAROU UM FACTO (mensagem declarativa, sem marcas de pergunta). ' +
        'Não termines sem escrever o facto em knowledge, salvo se a mensagem for apenas saudação, ' +
        'agradecimento ou conversa trivial sem conteúdo.\n\n'
    );
}

// Candidatas vão SÓ como referência (id/título/slug): o agente lê o conteúdo
// com ler_nota — é o "ler antes de escrever" que o one-shot não tinha.
function blocoCandidatas(candidatos: NotaCandidata[]): string {
    if (!candidatos.length) return '';
    const lista = candidatos
        .map((c) => `- id: ${c.id} | título: "${c.title}" | slug: ${c.slug}`)
        .join('\n');
    return `NOTAS CANDIDATAS (existentes, relacionadas com o assunto — lê antes de decidir):\n${lista}\n\n`;
}

export function buildPromptAgentic(
    question: string,
    answer: string,
    candidatos: NotaCandidata[] = [],
    intencao?: Intencao,
    historico: MensagemConversa[] = [],
): string {
    return (
        'Processa o pós-turno desta troca segundo o teu contrato. ' +
        `Hoje é ${hojeComDiaSemana()}.\n\n` +
        blocoConversa(historico) +
        blocoDeclarativa(intencao) +
        blocoCandidatas(candidatos) +
        `Pergunta: ${question}\nResposta: ${answer}`
    );
}
