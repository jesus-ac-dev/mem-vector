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
