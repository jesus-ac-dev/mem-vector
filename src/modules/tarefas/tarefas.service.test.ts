import { describe, expect, it } from 'vitest';

import { montarUpdateOperacional, relayEstaOrfao } from './tarefas.service';

const AGORA = 1_000_000_000_000; // ms fixos (determinista)
const JANELA = 30 * 60 * 1000;

describe('relayEstaOrfao (#M7-D)', () => {
    it('heartbeat null → órfão (um processando sem heartbeat não está a ser seguido)', () => {
        expect(relayEstaOrfao(null, AGORA, JANELA)).toBe(true);
    });
    it('heartbeat recente → não órfão', () => {
        const recente = new Date(AGORA - 5 * 60 * 1000).toISOString();
        expect(relayEstaOrfao(recente, AGORA, JANELA)).toBe(false);
    });
    it('heartbeat mais velho que a janela → órfão', () => {
        const velho = new Date(AGORA - 31 * 60 * 1000).toISOString();
        expect(relayEstaOrfao(velho, AGORA, JANELA)).toBe(true);
    });
    it('heartbeat exatamente na fronteira (= janela) → não órfão', () => {
        const fronteira = new Date(AGORA - JANELA).toISOString();
        expect(relayEstaOrfao(fronteira, AGORA, JANELA)).toBe(false);
    });
    it('heartbeat inválido → órfão defensivo', () => {
        expect(relayEstaOrfao('isto-nao-e-data', AGORA, JANELA)).toBe(true);
    });
});

describe('montarUpdateOperacional (#tasks-operacional)', () => {
    it('inclui só os campos presentes', () => {
        expect(montarUpdateOperacional({ blocker: 'sem credenciais' })).toEqual({
            blocker: 'sem credenciais',
        });
    });
    it('string vazia limpa o campo (→ null)', () => {
        expect(montarUpdateOperacional({ acceptance: '', blocker: 'x' })).toEqual({
            acceptance: null,
            blocker: 'x',
        });
    });
    it('normaliza espaços e whitespace-only limpa o campo', () => {
        expect(montarUpdateOperacional({ acceptance: '  pronto  ', evidence: '   ' })).toEqual({
            acceptance: 'pronto',
            evidence: null,
        });
    });
    it('sem campos → objeto vazio (o caller rejeita)', () => {
        expect(montarUpdateOperacional({})).toEqual({});
    });
    it('os três de uma vez', () => {
        expect(montarUpdateOperacional({ acceptance: 'a', blocker: 'b', evidence: 'c' })).toEqual({
            acceptance: 'a',
            blocker: 'b',
            evidence: 'c',
        });
    });
});
