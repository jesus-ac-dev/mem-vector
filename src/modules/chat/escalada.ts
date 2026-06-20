// #85 fatia 1 — two-phase: o caminho rápido (streaming, com RAG) responde sozinho
// quando o contexto chega, ou emite o sentinela [[ESCALAR]] para pedir o agente
// com tools (internet/exploração). O detetor segura os primeiros chars do stream
// até decidir: sentinela → suprime tudo e sinaliza escalar; senão → deixa passar
// (com latência quase nula — só os primeiros chars ficam em buffer).

export const SENTINELA_ESCALAR = '[[ESCALAR]]';

// Instrução que ensina o modelo a emitir o sentinela. Anexa-se ao prompt do
// caminho rápido quando há para onde escalar (web e/ou módulo GitHub ligados). O
// contexto vem por SEMELHANÇA: cobre perguntas gerais, mas falha em datas e em
// notas/tarefas específicas. Os gatilhos montam-se conforme o que está ligado —
// não se oferece web sem web nem GitHub sem o módulo (senão o agente escala para
// uma tool que não tem). O workspace (daily-por-data, nota nomeada) está sempre.
const ESCALADA_INTRO =
    'INSTRUÇÃO DE ESCALADA: tens o contexto do workspace acima, recuperado por SEMELHANÇA — ' +
    'cobre perguntas gerais, mas não traz datas nem tudo o que existe. Responde com ele quando ' +
    'chega. Responde com EXATAMENTE "[[ESCALAR]]" e mais nada (um agente com tools vai buscar) ' +
    'quando precisas de algo que NÃO está no contexto:';

const GATILHO_WEB =
    '\n- facto ATUAL/EXTERNO do mundo (notícias, desporto, preços, versões, meteorologia) → internet;';

const GATILHO_WORKSPACE =
    '\n- a DAILY ou as TAREFAS de uma DATA ("o que fiz ontem?", "tarefas de 3ª feira") → o contexto ' +
    'por semelhança não traz dailies por data, mesmo que pareça que "não há";\n' +
    '- uma NOTA ou DECISÃO específica que o utilizador nomeia e que não vês no contexto.';

const GATILHO_GITHUB =
    '\n- uma AÇÃO no GITHUB de um repo LIGADO: ver/listar issues, PROMOVER uma tarefa/bug durável ' +
    'para uma issue, ou comentar numa issue (relay) → um agente com tools trata.';

const ESCALADA_FECHO =
    '\nPara perguntas gerais que o contexto JÁ responde ("resume o projeto X", "como vão os devs"), ' +
    'NÃO escales — responde já.';

// Monta a instrução com os gatilhos das capacidades ligadas. A ordem (web antes
// de workspace) preserva a instrução original quando só a web está ligada.
export function construirInstrucaoEscalada(opts: { web: boolean; github: boolean }): string {
    return (
        ESCALADA_INTRO +
        (opts.web ? GATILHO_WEB : '') +
        GATILHO_WORKSPACE +
        (opts.github ? GATILHO_GITHUB : '') +
        ESCALADA_FECHO
    );
}

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
