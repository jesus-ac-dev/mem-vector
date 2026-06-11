import { describe, it, expect } from 'vitest';
import { rotuloAutor } from './versao-autor';

describe('rotuloAutor', () => {
    it('traduz os autores canónicos para a leitura humana (#23)', () => {
        expect(rotuloAutor('agent')).toBe('agente');
        expect(rotuloAutor('user')).toBe('tu');
    });

    it('autor desconhecido passa tal-e-qual (não esconde dados)', () => {
        expect(rotuloAutor('codex')).toBe('codex');
    });
});
