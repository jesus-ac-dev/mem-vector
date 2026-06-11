import { describe, it, expect } from 'vitest';
import { rotuloAutor } from './versao-autor';

describe('rotuloAutor', () => {
    it('user mostra o NOME de quem escreveu (proveniência por pessoa, #23)', () => {
        expect(rotuloAutor('user', 'Carlos')).toBe('Carlos');
        expect(rotuloAutor('user', 'dev@mem-vector.local')).toBe('dev@mem-vector.local');
    });

    it('user sem nome resolvido cai para "utilizador" (nunca o cru "user")', () => {
        expect(rotuloAutor('user')).toBe('utilizador');
        expect(rotuloAutor('user', null)).toBe('utilizador');
    });

    it('agent é o agente-autor do workspace, ignora nome', () => {
        expect(rotuloAutor('agent')).toBe('agente');
        expect(rotuloAutor('agent', 'Carlos')).toBe('agente');
    });

    it('autor desconhecido passa tal-e-qual (não esconde dados)', () => {
        expect(rotuloAutor('codex')).toBe('codex');
    });
});
