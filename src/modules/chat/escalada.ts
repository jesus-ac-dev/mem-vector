// #85 fatia 1 — two-phase: o caminho rápido (streaming, com RAG) responde sozinho
// quando o contexto chega, ou emite o sentinela [[ESCALAR]] para pedir o agente
// com tools (internet/exploração). O detetor segura os primeiros chars do stream
// até decidir: sentinela → suprime tudo e sinaliza escalar; senão → deixa passar
// (com latência quase nula — só os primeiros chars ficam em buffer).

export const SENTINELA_ESCALAR = '[[ESCALAR]]';

// Instrução que ensina o modelo a emitir o sentinela. Anexa-se ao prompt do
// caminho rápido (só quando a web está ligada — sem web não há para onde escalar).
// Fatia 1: escala-se SÓ para factos do mundo (web). Perguntas do workspace
// respondem-se já do contexto — não escalam (era o que fazia o agente lento e o
// que o Carlos apanhou). A exploração profunda do workspace fica para a fatia 2.
export const INSTRUCAO_ESCALADA =
    'INSTRUÇÃO DE ESCALADA: responde com o contexto do workspace acima. SÓ se a pergunta ' +
    'precisar de informação ATUAL ou EXTERNA que o workspace não pode conter (notícias, ' +
    'desporto, preços, cotações, versões de software, meteorologia, factos públicos do mundo) ' +
    'é que respondes com EXATAMENTE "[[ESCALAR]]" e mais nada — um agente vai à internet buscar. ' +
    'Para tudo o que é sobre o trabalho do utilizador (notas, projetos, dailies, tarefas, ' +
    'decisões, "como vão os devs"), responde JÁ com o contexto, NÃO escales. Na dúvida, não escales.';

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
