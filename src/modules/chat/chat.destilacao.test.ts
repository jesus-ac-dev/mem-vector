import { describe, it, expect, vi } from 'vitest';
import { aplicarDestilacao } from './chat.service';

describe('aplicarDestilacao', () => {
    it('escreve a nota quando a destilação devolve algo e retorna NotaEscrita', async () => {
        const destilar = vi
            .fn()
            .mockResolvedValue({ title: 'X', content_md: 'c', links: [], reason: 'r' });
        const escrever = vi.fn().mockResolvedValue({
            id: '1',
            slug: 'x',
            title: 'X',
            contentMd: 'c',
            updatedAt: '',
            diff: null,
        });
        const result = await aplicarDestilacao('q', 'a', { destilar, escrever });
        expect(escrever).toHaveBeenCalledOnce();
        expect(result).toEqual({ slug: 'x', title: 'X', criada: true });
    });
    it('criada é false quando diff não é null (atualização)', async () => {
        const destilar = vi
            .fn()
            .mockResolvedValue({ title: 'X', content_md: 'c', links: [], reason: 'r' });
        const escrever = vi.fn().mockResolvedValue({
            id: '1',
            slug: 'x',
            title: 'X',
            contentMd: 'c',
            updatedAt: '',
            diff: [{ type: 'equal', value: 'c' }],
        });
        const result = await aplicarDestilacao('q', 'a', { destilar, escrever });
        expect(result).toEqual({ slug: 'x', title: 'X', criada: false });
    });
    it('não escreve quando devolve null', async () => {
        const destilar = vi.fn().mockResolvedValue(null);
        const escrever = vi.fn();
        const result = await aplicarDestilacao('q', 'a', { destilar, escrever });
        expect(escrever).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });
});
