import type { Cruzamento, DefinicoesServidor } from '@/modules/definicoes/definicoes.schema';

import { executarCruzamento } from './relay.executar';
import type { ResultadoCruzamento } from './relay.runner';

// O circuito das atividades: corre os cruzamentos CONFIGURADOS na ordem canónica,
// respeitando o provider parametrizado de cada um. Topologia em ESTRELA — a Análise
// é a fonte de verdade; os de execução recebem o output dela como referência (não a
// narrativa do cruzamento anterior, para não propagar a árvore torta).
const ORDEM_CANONICA: Cruzamento[] = ['analise', 'dev', 'testes', 'docs', 'auditoria'];

export interface ResultadoPipeline {
    ordem: Cruzamento[]; // os que correram, por ordem
    porCruzamento: Partial<Record<Cruzamento, ResultadoCruzamento>>;
    analise: string | null; // a fonte de verdade produzida pela Análise
    completo: boolean; // true = todos validaram; false = parou num kill switch
}

export async function correrPipeline(opts: {
    defs: DefinicoesServidor;
    spec: string;
    // Injetado para testar a lógica do circuito sem chamar LLMs.
    executar: (cruzamento: Cruzamento, spec: string) => Promise<ResultadoCruzamento>;
    // Retoma cirúrgica: recomeça NESTA fase (salta as que já passaram), com a
    // Análise já produzida (analiseInicial) como fonte de verdade da estrela —
    // não se redestila o goal nem se repete o que ficou no working tree.
    desde?: Cruzamento;
    analiseInicial?: string;
}): Promise<ResultadoPipeline> {
    const { defs, spec, executar, desde, analiseInicial } = opts;
    const todos = ORDEM_CANONICA.filter((c) => defs.cruzamentos[c]);
    const idx = desde ? todos.indexOf(desde) : 0;
    const configurados = idx >= 0 ? todos.slice(idx) : todos;
    const porCruzamento: ResultadoPipeline['porCruzamento'] = {};
    const ordem: Cruzamento[] = [];
    let analise: string | null = analiseInicial ?? null;

    for (const c of configurados) {
        const specCruzamento =
            c === 'analise' || !analise
                ? spec
                : `${spec}\n\n--- Análise (fonte de verdade) ---\n${analise}`;
        const r = await executar(c, specCruzamento);
        porCruzamento[c] = r;
        ordem.push(c);
        if (c === 'analise') analise = r.output;
        // Kill switch: um cruzamento que não valida pára o circuito.
        // NOTA (decisão por discutir — Carlos 2026-06-20): o que "volta ao humano"
        // significa exatamente (como/onde o humano é chamado e o que pode fazer)
        // ainda não está fechado. Por agora só pára e marca `completo: false`.
        if (!r.validado) return { ordem, porCruzamento, analise, completo: false };
    }

    return { ordem, porCruzamento, analise, completo: true };
}

// Entrada real: liga o circuito ao executor de cruzamentos (que chama os providers).
export function executarPipeline(
    defs: DefinicoesServidor,
    spec: string,
): Promise<ResultadoPipeline> {
    return correrPipeline({ defs, spec, executar: (c, s) => executarCruzamento(defs, c, s) });
}
