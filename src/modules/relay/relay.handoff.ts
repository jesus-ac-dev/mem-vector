import {
    CRUZAMENTO_LABEL,
    type Cruzamento,
    type Provider,
} from '@/modules/definicoes/definicoes.schema';

// O handoff: cada substep de cada cruzamento PÁRA e deixa um comentário
// ASSINADO na issue (não um resumo no fim). 1ª linha = assinatura textual do
// provider (todos os comentários saem do mesmo PAT — o GitHub vê um autor; a
// assinatura distingue quem falou). O orchestrator põe os FACTOS (fase·provider·
// papel·ronda·veredito), a LLM o PORQUÊ. É o trace técnico do relay (a verdade
// do estado vive aqui, nos comentários da issue).

const PROVIDER_NOME: Record<Provider, string> = {
    claude: 'Claude',
    codex: 'Codex',
    gemini: 'Gemini',
    ollama: 'Ollama',
};

export type Papel = 'principal' | 'validador';

export interface Handoff {
    fase: Cruzamento;
    papel: Papel;
    provider: Provider;
    ronda: number;
    // 'ok'/'rejeitado' nos validadores; null no principal (produz, não vereditа).
    veredito?: 'ok' | 'rejeitado' | null;
    porque: string; // o texto da LLM (o porquê do output/veredito)
}

export function assinatura(h: Pick<Handoff, 'provider' | 'papel' | 'fase' | 'ronda'>): string {
    return `— ${PROVIDER_NOME[h.provider]} · ${h.papel} · ${CRUZAMENTO_LABEL[h.fase]} · ronda ${h.ronda}`;
}

export function construirHandoff(h: Handoff): string {
    const linhas: string[] = [assinatura(h), ''];
    if (h.veredito) {
        linhas.push(`**Veredito:** ${h.veredito === 'ok' ? '✅ aprovado' : '❌ rejeitado'}`, '');
    }
    linhas.push(h.porque.trim());
    return linhas.join('\n');
}

// Steering a quente (#129): a orientação humana consumida a meio da corrida fica
// assinada na issue como qualquer handoff — o GitHub continua a verdade auditável.
// Começa por "—" de propósito: o montarSpec da retoma não a re-injeta (já foi
// integrada quando foi consumida).
export function construirSteeringHandoff(fase: Cruzamento, ronda: number, texto: string): string {
    return [
        `— Humano · steering · ${CRUZAMENTO_LABEL[fase]} · ronda ${ronda}`,
        '',
        'Orientação recebida a meio da corrida (o principal integra-a nesta ronda):',
        '',
        texto.trim(),
    ].join('\n');
}
