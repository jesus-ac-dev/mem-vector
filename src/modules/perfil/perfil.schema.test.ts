import { describe, it, expect } from 'vitest';
import {
    AtualizarNomeSchema,
    AtualizarEmailSchema,
    AtualizarPasswordSchema,
    caminhoAvatar,
    validarAvatar,
    AVATAR_MAX_BYTES,
} from './perfil.schema';

describe('AtualizarNomeSchema', () => {
    it('apara espaços e aceita um nome válido', () => {
        expect(AtualizarNomeSchema.parse({ displayName: '  Carlos  ' })).toEqual({
            displayName: 'Carlos',
        });
    });
    it('rejeita nome vazio (ou só espaços)', () => {
        expect(() => AtualizarNomeSchema.parse({ displayName: '   ' })).toThrow();
    });
    it('rejeita nome acima de 80 caracteres', () => {
        expect(() => AtualizarNomeSchema.parse({ displayName: 'a'.repeat(81) })).toThrow();
    });
});

describe('AtualizarEmailSchema', () => {
    it('aceita email válido', () => {
        expect(AtualizarEmailSchema.parse({ email: 'a@b.pt' })).toEqual({ email: 'a@b.pt' });
    });
    it('rejeita email inválido', () => {
        expect(() => AtualizarEmailSchema.parse({ email: 'nao-e-email' })).toThrow();
    });
});

describe('AtualizarPasswordSchema', () => {
    it('aceita password com 8+ caracteres', () => {
        expect(AtualizarPasswordSchema.parse({ password: '12345678' })).toEqual({
            password: '12345678',
        });
    });
    it('rejeita password curta', () => {
        expect(() => AtualizarPasswordSchema.parse({ password: '1234567' })).toThrow();
    });
});

describe('validarAvatar', () => {
    it('aceita png dentro do limite', () => {
        expect(validarAvatar({ type: 'image/png', size: 1000 })).toEqual({ ok: true });
    });
    it('rejeita tipo não-imagem', () => {
        const r = validarAvatar({ type: 'application/pdf', size: 1000 });
        expect(r.ok).toBe(false);
    });
    it('rejeita ficheiro acima do limite', () => {
        const r = validarAvatar({ type: 'image/png', size: AVATAR_MAX_BYTES + 1 });
        expect(r.ok).toBe(false);
    });
});

describe('caminhoAvatar', () => {
    it('monta {uid}/avatar.<ext> pela mime', () => {
        expect(caminhoAvatar('user-1', 'image/png')).toBe('user-1/avatar.png');
        expect(caminhoAvatar('user-1', 'image/jpeg')).toBe('user-1/avatar.jpg');
        expect(caminhoAvatar('user-1', 'image/webp')).toBe('user-1/avatar.webp');
    });
    it('rejeita mime não suportado', () => {
        expect(() => caminhoAvatar('user-1', 'image/gif')).toThrow();
    });
});
