import { describe, expect, it } from 'vitest';

import {
    formatarTokens,
    totaisDoTrace,
    traceBadgeLabel,
    traceModelEvidence,
    type ChatTrace,
} from './chat.trace';

describe('chat trace', () => {
    it('mostra provider e modelo efetivo quando o provider reporta o modelo real', () => {
        const trace: ChatTrace = {
            provider: 'codex',
            requestedModel: 'gpt-5.5',
            effectiveModel: 'gpt-5.5-2026-04-01',
        };

        expect(traceBadgeLabel(trace)).toBe('Codex · gpt-5.5-2026-04-01');
        expect(traceModelEvidence(trace)).toEqual({
            state: 'confirmado',
            label: 'modelo confirmado pelo provider',
        });
    });

    it('marca divergência como aviso informativo, sem bloquear a resposta', () => {
        const trace: ChatTrace = {
            provider: 'codex',
            requestedModel: 'gpt-5.5',
            effectiveModel: 'gpt-5.4-mini',
        };

        expect(traceModelEvidence(trace)).toEqual({
            state: 'divergente',
            label: 'modelo diferente do pedido',
        });
    });

    it('assume modelo default quando não há pedido explícito', () => {
        const trace: ChatTrace = {
            provider: 'claude',
            effectiveModel: 'claude-sonnet-4-6',
        };

        expect(traceBadgeLabel(trace)).toBe('Claude · claude-sonnet-4-6');
        expect(traceModelEvidence(trace).state).toBe('confirmado');
    });

    it('diz alto quando o provider não reporta modelo real', () => {
        const trace: ChatTrace = {
            provider: 'ollama',
            requestedModel: 'llama3.2',
        };

        expect(traceBadgeLabel(trace)).toBe('Ollama · llama3.2');
        expect(traceModelEvidence(trace)).toEqual({
            state: 'nao-reportado',
            label: 'provider não reportou modelo efetivo',
        });
    });
});

describe('totaisDoTrace (#65 — totalizador da conversa)', () => {
    it('soma custo e tokens (in/cache/out) de todos os turnos', () => {
        const turnos: ChatTrace[] = [
            { costUsd: 0.1054, tokensIn: 23952, tokensCache: 15182, tokensOut: 969 },
            { costUsd: 0.1124, tokensIn: 23545, tokensCache: 14775, tokensOut: 1412 },
        ];
        expect(totaisDoTrace(turnos)).toEqual({
            custoUsd: 0.1054 + 0.1124,
            tokensIn: 23952 + 23545,
            tokensCache: 15182 + 14775,
            tokensOut: 969 + 1412,
        });
    });

    it('ignora turnos sem valor (pré-feature) e dá null se nenhum reportou', () => {
        const turnos: ChatTrace[] = [
            { costUsd: 0.2, tokensIn: null, tokensCache: null, tokensOut: null },
            { costUsd: null, tokensIn: 100, tokensCache: null, tokensOut: 40 },
        ];
        expect(totaisDoTrace(turnos)).toEqual({
            custoUsd: 0.2,
            tokensIn: 100,
            tokensCache: null, // nenhum turno reportou cache
            tokensOut: 40,
        });
    });

    it('conversa vazia = tudo null', () => {
        expect(totaisDoTrace([])).toEqual({
            custoUsd: null,
            tokensIn: null,
            tokensCache: null,
            tokensOut: null,
        });
    });
});

describe('formatarTokens (#65)', () => {
    it('com cache (claude): mostra fresco/cache/out para o total não enganar', () => {
        // o valor que assustou o Carlos: 23962 "in" eram 6679 frescos + 17283 cache.
        expect(formatarTokens(23962, 17283, 532)).toBe('6679 fresco · 17283 cache · 532 out');
    });

    it('sem cache (codex/gemini/ollama): mostra só in · out', () => {
        expect(formatarTokens(30, null, 12)).toBe('30 in · 12 out');
        // cache zero não merece breakdown
        expect(formatarTokens(30, 0, 12)).toBe('30 in · 12 out');
    });

    it('diz alto quando nenhum provider reporta tokens', () => {
        expect(formatarTokens(null, null, null)).toBe('não reportado pelo provider');
        expect(formatarTokens(undefined, undefined, undefined)).toBe('não reportado pelo provider');
    });

    it('mostra travessão no lado em falta quando só um é reportado', () => {
        expect(formatarTokens(9, null, null)).toBe('9 in · — out');
        expect(formatarTokens(null, null, 117)).toBe('— in · 117 out');
    });
});
