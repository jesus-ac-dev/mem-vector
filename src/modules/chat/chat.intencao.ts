// Classificador determinístico da intenção da mensagem do utilizador (#19).
// Decisão Carlos 2026-06-10: declarativa sem marcas de pergunta = FACTO A REGISTAR;
// pergunta explícita = query. A mesma função alimenta o prompt do chat e a
// destilação pós-turno — determinística, as duas camadas nunca divergem.
// A trivialidade (saudações, agradecimentos) fica para o LLM no prompt; aqui
// só se separa pergunta de afirmação.

export interface Intencao {
    tipo: 'pergunta' | 'declarativa';
    // Hedge ("talvez", "acho que"…): regista na mesma, mas a resposta sinaliza
    // a assunção ("assumi que é facto — se era pergunta, diz").
    incerta: boolean;
}

// Comparação sem acentos nem maiúsculas, para apanhar escrita casual ("sera que").
function normalizar(texto: string): string {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

// Interrogativos de arranque que fazem pergunta mesmo sem "?".
const ARRANQUES_INTERROGATIVOS = [
    'sera que',
    'achas',
    'quem',
    'qual',
    'quais',
    'quando',
    'onde',
    'como',
    'porque',
    'por que',
    'o que',
    'e se',
];

// Imperativos de pesquisa: pedem ao workspace, não declaram factos.
const ARRANQUES_CONSULTA = [
    'mostra',
    'procura',
    'pesquisa',
    'lista',
    'diz-me',
    'diz me',
    'conta-me',
    'conta me',
    'lembra-me',
    'lembra me',
    'encontra',
    'consulta',
];

// Dúvida do próprio utilizador, em qualquer ponto da frase = query.
const MARCAS_DUVIDA = ['nao sei se', 'pergunto-me se', 'pergunto me se', 'fico na duvida'];

// Hedge declarativo: o facto vem com incerteza, mas continua a ser facto.
const HEDGES = [
    'talvez',
    'se calhar',
    'acho que',
    'penso que',
    'creio que',
    'provavelmente',
    'parece que',
    'parece-me',
];

function comecaPor(texto: string, prefixos: string[]): boolean {
    return prefixos.some((p) => texto === p || texto.startsWith(`${p} `));
}

function contem(texto: string, marcas: string[]): boolean {
    return marcas.some((m) => texto.includes(m));
}

export function classificarIntencao(question: string): Intencao {
    const txt = normalizar(question);

    const ehPergunta =
        txt.includes('?') ||
        comecaPor(txt, ARRANQUES_INTERROGATIVOS) ||
        comecaPor(txt, ARRANQUES_CONSULTA) ||
        contem(txt, MARCAS_DUVIDA);

    if (ehPergunta) return { tipo: 'pergunta', incerta: false };

    return { tipo: 'declarativa', incerta: contem(txt, HEDGES) };
}
