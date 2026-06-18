import { describe, expect, it } from 'vitest';

import { resolverDataDaily } from './daily.service';

// #85 fatia 2: a tool ler_daily resolve referências temporais → data (AAAA-MM-DD).
// O RAG por semelhança falha em queries de data ("o que fiz ontem"); a tool é
// determinística. `hoje` injeta-se para o teste ser estável.
describe('resolverDataDaily (#85)', () => {
    it('hoje (e vazio) → a data de hoje', () => {
        expect(resolverDataDaily('hoje', '2026-06-18')).toBe('2026-06-18');
        expect(resolverDataDaily('', '2026-06-18')).toBe('2026-06-18');
    });

    it('ontem → o dia anterior', () => {
        expect(resolverDataDaily('ontem', '2026-06-18')).toBe('2026-06-17');
    });

    it('ontem atravessa a fronteira do mês', () => {
        expect(resolverDataDaily('ontem', '2026-07-01')).toBe('2026-06-30');
    });

    it('data absoluta AAAA-MM-DD passa tal qual', () => {
        expect(resolverDataDaily('2026-06-15', '2026-06-18')).toBe('2026-06-15');
    });

    it('é tolerante a maiúsculas e espaços', () => {
        expect(resolverDataDaily('  ONTEM ', '2026-06-18')).toBe('2026-06-17');
    });

    it('referência não reconhecida → null', () => {
        expect(resolverDataDaily('amanhã', '2026-06-18')).toBeNull();
        expect(resolverDataDaily('semana passada', '2026-06-18')).toBeNull();
    });

    it('data com formato válido mas calendário inválido → null', () => {
        expect(resolverDataDaily('2026-13-99', '2026-06-18')).toBeNull();
        expect(resolverDataDaily('2026-02-30', '2026-06-18')).toBeNull();
    });
});
