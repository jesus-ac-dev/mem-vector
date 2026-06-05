import { describe, it, expect, vi } from 'vitest';
import { aplicarDestilacao } from './chat.service';

describe('aplicarDestilacao', () => {
    it('escreve a nota quando a destilação devolve algo', async () => {
        const destilar = vi
            .fn()
            .mockResolvedValue({ title: 'X', content_md: 'c', links: [], reason: 'r' });
        const escrever = vi.fn().mockResolvedValue({ id: '1' });
        await aplicarDestilacao('q', 'a', { destilar, escrever });
        expect(escrever).toHaveBeenCalledOnce();
    });
    it('não escreve quando devolve null', async () => {
        const destilar = vi.fn().mockResolvedValue(null);
        const escrever = vi.fn();
        await aplicarDestilacao('q', 'a', { destilar, escrever });
        expect(escrever).not.toHaveBeenCalled();
    });
});
