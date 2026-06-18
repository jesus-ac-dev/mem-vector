// #85 fatia 1 — two-phase: o caminho rápido (streaming, com RAG) responde sozinho
// quando o contexto chega, ou emite o sentinela [[ESCALAR]] para pedir o agente
// com tools (internet/exploração). O detetor segura os primeiros chars do stream
// até decidir: sentinela → suprime tudo e sinaliza escalar; senão → deixa passar
// (com latência quase nula — só os primeiros chars ficam em buffer).

export const SENTINELA_ESCALAR = '[[ESCALAR]]';

// Instrução que ensina o modelo a emitir o sentinela. Anexa-se ao prompt do
// caminho rápido (só quando a web está ligada — sem web não há para onde escalar).
// O contexto vem por SEMELHANÇA: cobre perguntas gerais, mas falha em datas e em
// notas/tarefas específicas. Escala-se para IR BUSCAR o que falta — fatia 2: além
// da web, também daily-por-data e notas/tarefas nomeadas (o bug do "o que fiz
// ontem?" que dizia "não há" tendo a daily). Geral que o contexto cobre → não escala.
export const INSTRUCAO_ESCALADA =
    'INSTRUÇÃO DE ESCALADA: tens o contexto do workspace acima, recuperado por SEMELHANÇA — ' +
    'cobre perguntas gerais, mas não traz datas nem tudo o que existe. Responde com ele quando ' +
    'chega. Responde com EXATAMENTE "[[ESCALAR]]" e mais nada (um agente com tools vai buscar) ' +
    'quando precisas de algo que NÃO está no contexto:\n' +
    '- facto ATUAL/EXTERNO do mundo (notícias, desporto, preços, versões, meteorologia) → internet;\n' +
    '- a DAILY ou as TAREFAS de uma DATA ("o que fiz ontem?", "tarefas de 3ª feira") → o contexto ' +
    'por semelhança não traz dailies por data, mesmo que pareça que "não há";\n' +
    '- uma NOTA ou DECISÃO específica que o utilizador nomeia e que não vês no contexto.\n' +
    'Para perguntas gerais que o contexto JÁ responde ("resume o projeto X", "como vão os devs"), ' +
    'NÃO escales — responde já.';

export function criarDetetorEscalada(
    sentinela: string,
    emitir: (texto: string) => void,
): { processar: (texto: string) => void; finalizar: () => { escalou: boolean } } {
    let buffer = '';
    let decidido = false;
    let escalou = false;

    return {
        processar(texto: string) {
            if (decidido) {
                if (!escalou) emitir(texto);
                return;
            }
            buffer += texto;
            const t = buffer.trimStart();
            if (t === '') return; // só whitespace — ainda indeciso
            if (t.startsWith(sentinela)) {
                decidido = true;
                escalou = true; // suprime tudo
                return;
            }
            if (sentinela.startsWith(t)) return; // prefixo do sentinela — espera mais
            // divergiu do sentinela → é resposta: deixa passar o que estava em buffer
            decidido = true;
            emitir(buffer);
            buffer = '';
        },
        finalizar() {
            // Stream acabou em prefixo parcial (ex.: "[[ESC") → não era o sentinela.
            if (!decidido) {
                decidido = true;
                if (buffer) emitir(buffer);
            }
            return { escalou };
        },
    };
}
