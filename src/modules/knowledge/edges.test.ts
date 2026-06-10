import { describe, expect, it } from 'vitest';
import { resolverIdAlvo } from '@/modules/knowledge/edges';

describe('resolverIdAlvo', () => {
    const homonimos = [
        { id: 'a', caminho: 'novamente/será' },
        { id: 'b', caminho: 'outra/será' },
    ];

    it('path certo resolve pela nota desse caminho', () => {
        expect(resolverIdAlvo('novamente/será', homonimos)).toBe('a');
        expect(resolverIdAlvo('outra/será', homonimos)).toBe('b');
    });

    it('path desatualizado com slug único faz fallback (a nota mudou de pasta)', () => {
        expect(resolverIdAlvo('novamente/será', [{ id: 'a', caminho: 'sdsd/será' }])).toBe('a');
    });

    it('path desatualizado com homónimos não adivinha', () => {
        expect(resolverIdAlvo('antiga/será', homonimos)).toBeNull();
    });

    it('sem path: slug único resolve, homónimos ficam pendentes', () => {
        expect(resolverIdAlvo(null, [{ id: 'a', caminho: 'x/y' }])).toBe('a');
        expect(resolverIdAlvo(null, homonimos)).toBeNull();
    });

    it('sem matches fica pendente', () => {
        expect(resolverIdAlvo('qualquer/coisa', [])).toBeNull();
        expect(resolverIdAlvo(null, [])).toBeNull();
    });
});
