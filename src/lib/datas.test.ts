import { describe, expect, it } from 'vitest';

import { dataCurtaPt, dataPt } from './datas';

describe('datas à portuguesa (#55)', () => {
    it('dataPt: dia ISO → dd-mm-aaaa', () => {
        expect(dataPt('2026-06-12')).toBe('12-06-2026');
    });

    it('dataPt: aceita ISO completo (timestamptz)', () => {
        expect(dataPt('2026-06-12T10:45:58.733Z')).toBe('12-06-2026');
    });

    it('dataCurtaPt: dia ISO → dd-MMM', () => {
        expect(dataCurtaPt('2026-06-12')).toBe('12-Jun');
        expect(dataCurtaPt('2026-12-01')).toBe('01-Dez');
    });

    it('não-data devolve-se intacta (títulos de notas nunca se estragam)', () => {
        expect(dataPt('Carlos e Sofia')).toBe('Carlos e Sofia');
        expect(dataCurtaPt('Carlos e Sofia')).toBe('Carlos e Sofia');
    });
});
