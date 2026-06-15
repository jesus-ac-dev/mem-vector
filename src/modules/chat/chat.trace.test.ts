import { describe, expect, it } from 'vitest';

import { formatarTokens, traceBadgeLabel, traceModelEvidence, type ChatTrace } from './chat.trace';

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

describe('formatarTokens (#65)', () => {
    it('mostra in e out quando o provider reporta', () => {
        expect(formatarTokens(9, 117)).toBe('9 in · 117 out');
    });

    it('diz alto quando nenhum provider reporta tokens', () => {
        expect(formatarTokens(null, null)).toBe('não reportado pelo provider');
        expect(formatarTokens(undefined, undefined)).toBe('não reportado pelo provider');
    });

    it('mostra travessão no lado em falta quando só um é reportado', () => {
        expect(formatarTokens(9, null)).toBe('9 in · — out');
        expect(formatarTokens(null, 117)).toBe('— in · 117 out');
    });
});
