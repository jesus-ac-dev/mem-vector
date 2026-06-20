// O runner de UM cruzamento: o principal produz, o validador verifica, repete até
// passar ou esgotar as rondas (kill switch). A convergência NÃO é consenso — o
// validador adversarial (review) tenta DERRUBAR e avança quando não consegue; o
// gerativo (análise) melhora até estabilizar. Em ambos, "ok" = terminar.
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

    for (let ronda = 1; ronda <= maxRondas; ronda++) {
        output = await produzir(feedback);
        if (!validar) {
            historico.push({ ronda, output });
            return { output, rondas: ronda, validado: true, historico };
        }
        const veredito = await validar(output);
        historico.push({ ronda, output, veredito });
        if (veredito.ok) {
            return { output, rondas: ronda, validado: true, historico };
        }
        feedback = veredito.feedback ?? null;
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
    if (/^\s*APROVADO\b/i.test(t)) return { ok: true };
    const m = t.match(/REJEITADO[:\s-]*([\s\S]*)/i);
    return { ok: false, feedback: (m?.[1] ?? t).trim() || undefined };
}
