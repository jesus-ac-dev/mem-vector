import { describe, expect, it } from 'vitest';

import { cifrar, decifrar, sufixoKey } from './cripto';

const SEGREDO = 'segredo-de-teste';

describe('cripto das API keys (#60)', () => {
    it('roundtrip cifra → decifra', () => {
        const cifrado = cifrar('sk-key-secreta-1234', SEGREDO);
        expect(cifrado.startsWith('gcm:')).toBe(true);
        expect(cifrado).not.toContain('sk-key-secreta-1234');
        expect(decifrar(cifrado, SEGREDO)).toBe('sk-key-secreta-1234');
    });

    it('ivs aleatórios: cifrar duas vezes dá resultados diferentes', () => {
        expect(cifrar('mesma', SEGREDO)).not.toBe(cifrar('mesma', SEGREDO));
    });

    it('plaintext legado (sem prefixo) devolve-se intacto', () => {
        expect(decifrar('key-antiga-plaintext', SEGREDO)).toBe('key-antiga-plaintext');
    });

    it('segredo errado falha alto (não devolve lixo)', () => {
        const cifrado = cifrar('segura', SEGREDO);
        expect(() => decifrar(cifrado, 'outro-segredo')).toThrow();
    });

    it('sufixoKey dá os últimos 4 para a máscara', () => {
        expect(sufixoKey('sk-abcd-wxyz')).toBe('wxyz');
    });
});
