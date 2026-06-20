import { criarProvider } from '@/lib/providers/factory';
import {
    CRUZAMENTO_LABEL,
    type Cruzamento,
    type DefinicoesServidor,
} from '@/modules/definicoes/definicoes.schema';

import { resolverCruzamento } from './relay.resolver';
import { correrCruzamento, parseVeredito, type ResultadoCruzamento } from './relay.runner';

// Convergência por papel (glossário): a Análise é GERATIVA (o validador sugere a
// próxima melhoria até estabilizar); os restantes são ADVERSARIAIS (tenta derrubar).
function ehAdversarial(cruzamento: Cruzamento): boolean {
    return cruzamento !== 'analise';
}

function promptPrincipal(cruzamento: Cruzamento, spec: string, feedback: string | null): string {
    const papel = CRUZAMENTO_LABEL[cruzamento];
    const base =
        `És o PRINCIPAL do cruzamento "${papel}". Trabalhas em português de Portugal. ` +
        `Produz o teu output para esta tarefa:\n\n${spec}`;
    if (!feedback) return base;
    return `${base}\n\nA ronda anterior recebeu esta objeção/sugestão do validador — integra-a:\n${feedback}`;
}

function promptValidador(cruzamento: Cruzamento, spec: string, output: string): string {
    const papel = CRUZAMENTO_LABEL[cruzamento];
    const cabeca = `És o VALIDADOR do cruzamento "${papel}" (linhagem diferente do principal). Trabalhas em português de Portugal.\n\nTarefa:\n${spec}\n\nOutput do principal:\n${output}\n\n`;
    if (ehAdversarial(cruzamento)) {
        return (
            cabeca +
            'A tua função é tentar DERRUBAR o output, não concordar por concordar. Se encontrares ' +
            'um problema REAL, responde "REJEITADO: <a objeção específica>". Só se não conseguires ' +
            'derrubar, responde "APROVADO". Não aprovas por simpatia.'
        );
    }
    return (
        cabeca +
        'Sugere a PRÓXIMA melhoria concreta do output. Se ainda há algo a melhorar, responde ' +
        '"REJEITADO: <a melhoria>". Quando estiver estável (nada a acrescentar), responde "APROVADO".'
    );
}

// Executa UM cruzamento de ponta a ponta: resolve os providers do config, corre o
// round-loop com prompts reais. É a peça que liga as definições ao circuito (chama
// LLMs de verdade; a lógica pura — resolver/runner/parseVeredito — é a que se testa).
export async function executarCruzamento(
    defs: DefinicoesServidor,
    cruzamento: Cruzamento,
    spec: string,
    maxRondas = 3,
): Promise<ResultadoCruzamento> {
    const r = resolverCruzamento(defs, cruzamento);
    const principal = criarProvider(r.principal.provider, r.principal.config);
    const validador = r.validador ? criarProvider(r.validador.provider, r.validador.config) : null;

    return correrCruzamento({
        maxRondas,
        produzir: async (feedback) =>
            (await principal.gerar(promptPrincipal(cruzamento, spec, feedback))).text,
        validar: validador
            ? async (output) =>
                  parseVeredito(
                      (await validador.gerar(promptValidador(cruzamento, spec, output))).text,
                  )
            : null,
    });
}
