import { describe, expect, it } from 'vitest';
import { tituloInicialConversa } from './chat.titulo';

describe('tituloInicialConversa', () => {
    it('resume pedidos longos para um título curto', () => {
        expect(
            tituloInicialConversa(
                'Resume o estado atual do mem-vector e guarda o que for duravel.',
            ),
        ).toBe('Estado atual do mem-vector');
    });

    it('remove pedidos de cortesia no fim', () => {
        expect(tituloInicialConversa('Cria uma daily note sff')).toBe('Daily note');
    });

    it('corta títulos demasiado longos', () => {
        expect(tituloInicialConversa('pergunta '.repeat(20))).toHaveLength(56);
    });
});
