// O runner de UM cruzamento: ronda após ronda, produz-se e o caller decide se
// convergiu (validar → ok), até passar ou esgotar as rondas (kill switch). No relay
// real, em fases de escrita cada validador faz o seu melhor e ESCREVE por cima, e a
// convergência é CONCORDAREM (todos aprovam); em análise (gerativo) estabiliza quando
// não há mais a acrescentar. "ok" = terminar.
//
// Os providers entram INJETADOS (produzir/validar) — esta função é a lógica do
// circuito, pura e testável. A construção dos providers e os prompts ficam para
// o caller (que usa o resolverCruzamento + a factory).

export interface Veredito {
    // adversarial: não conseguiu derrubar. gerativo: estável (sem mais a mudar).
    ok: boolean;
    // objeção/sugestão específica para a próxima ronda (vazio quando ok).
    feedback?: string;
}

export interface ResultadoCruzamento {
    output: string;
    rondas: number;
    validado: boolean; // passou a validação (ou não havia validador)
    historico: { ronda: number; output: string; veredito?: Veredito }[];
    // Parou cedo por repetição: o principal devolveu o mesmo output 2 rondas seguidas
    // apesar do feedback (não convergia) → não se gastaram as rondas restantes.
    stall?: boolean;
}

export async function correrCruzamento(opts: {
    maxRondas: number;
    produzir: (feedbackAnterior: string | null) => Promise<string>;
    // null = double-tap 'none' (só principal, sem validação).
    validar: ((output: string) => Promise<Veredito>) | null;
}): Promise<ResultadoCruzamento> {
    const { maxRondas, produzir, validar } = opts;
    const historico: ResultadoCruzamento['historico'] = [];
    let feedback: string | null = null;
    let output = '';
    let outputAnterior: string | null = null;

    for (let ronda = 1; ronda <= maxRondas; ronda++) {
        output = await produzir(feedback);
        if (!validar) {
            historico.push({ ronda, output });
            return { output, rondas: ronda, validado: true, historico };
        }
        // Stall: repetiu o output da ronda anterior apesar do feedback → não está a
        // convergir; pára cedo (poupa rondas/tokens) e devolve não-validado.
        if (outputAnterior !== null && output === outputAnterior) {
            historico.push({ ronda, output });
            return { output, rondas: ronda, validado: false, historico, stall: true };
        }
        const veredito = await validar(output);
        historico.push({ ronda, output, veredito });
        if (veredito.ok) {
            return { output, rondas: ronda, validado: true, historico };
        }
        feedback = veredito.feedback ?? null;
        outputAnterior = output;
    }

    // Esgotou as rondas sem passar (kill switch): devolve o último, NÃO validado —
    // o caller leva-o à Análise (a junta humana), não finge sucesso.
    return { output, rondas: maxRondas, validado: false, historico };
}

// Lê o veredito do validador a partir do texto. Adversarial: SÓ passa com
// "APROVADO" explícito — qualquer outra coisa (objeção, dúvida, ruído) conta como
// NÃO passou (default-to-refuted), para o erro não escapar por ambiguidade.
export function parseVeredito(texto: string): Veredito {
    const t = texto.trim();
    const primeiraLinha = t.split(/\r?\n/, 1)[0]?.trim() ?? '';
    if (/^APROVADO[.!]?$/i.test(primeiraLinha)) return { ok: true };
    const m = t.match(/REJEITADO[:\s-]*([\s\S]*)/i);
    return { ok: false, feedback: (m?.[1] ?? t).trim() || undefined };
}
