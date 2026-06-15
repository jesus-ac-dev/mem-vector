import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aplicarDailyTurno, aplicarDestilacao } from './chat.service';

describe('aplicarDestilacao', () => {
    it('escreve a nota quando a destilação devolve algo e retorna NotaEscrita[]', async () => {
        const destilar = vi
            .fn()
            .mockResolvedValue([{ title: 'X', content_md: 'c', links: [], reason: 'r' }]);
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
        expect(result).toEqual([{ slug: 'x', title: 'X', criada: true }]);
    });
    it('criada é false quando diff não é null (atualização)', async () => {
        const destilar = vi
            .fn()
            .mockResolvedValue([{ title: 'X', content_md: 'c', links: [], reason: 'r' }]);
        const escrever = vi.fn().mockResolvedValue({
            id: '1',
            slug: 'x',
            title: 'X',
            contentMd: 'c',
            updatedAt: '',
            diff: [{ type: 'equal', value: 'c' }],
        });
        const result = await aplicarDestilacao('q', 'a', { destilar, escrever });
        expect(result).toEqual([{ slug: 'x', title: 'X', criada: false }]);
    });
    it('escreve N notas num só turno (1 bloco → N notas)', async () => {
        const destilar = vi.fn().mockResolvedValue([
            { title: 'Sofia', content_md: '# Sofia', links: [], reason: 'r' },
            { title: 'Threshold', content_md: '# Threshold', links: [], reason: 'r' },
        ]);
        const escrever = vi
            .fn()
            .mockResolvedValueOnce({
                id: '1',
                slug: 'sofia',
                title: 'Sofia',
                contentMd: '',
                updatedAt: '',
                diff: null,
            })
            .mockResolvedValueOnce({
                id: '2',
                slug: 'threshold',
                title: 'Threshold',
                contentMd: '',
                updatedAt: '',
                diff: null,
            });
        const result = await aplicarDestilacao('q', 'a', { destilar, escrever });
        expect(escrever).toHaveBeenCalledTimes(2);
        expect(result.map((r) => r.slug)).toEqual(['sofia', 'threshold']);
    });
    it('não escreve quando não há notas', async () => {
        const destilar = vi.fn().mockResolvedValue([]);
        const escrever = vi.fn();
        const result = await aplicarDestilacao('q', 'a', { destilar, escrever });
        expect(escrever).not.toHaveBeenCalled();
        expect(result).toEqual([]);
    });
});

describe('aplicarDailyTurno', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-06T08:30:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('resume e escreve o daily mesmo sem nota knowledge', async () => {
        const resumir = vi.fn().mockResolvedValue('- Turno resumido');
        const escrever = vi.fn().mockResolvedValue({ dia: '2026-06-06', criado: true });

        const result = await aplicarDailyTurno('q', 'a', [], { resumir, escrever });

        expect(resumir).toHaveBeenCalledWith('q', 'a');
        expect(escrever).toHaveBeenCalledWith('### 09:30\n- Turno resumido');
        expect(result).toEqual({ dia: '2026-06-06', criado: true });
    });

    // Turno trivial: sem resumo e sem nota, o daily não regista o nada.
    it('não escreve o daily quando o turno não deixou resumo nem nota', async () => {
        const resumir = vi.fn().mockResolvedValue('');
        const escrever = vi.fn();

        const result = await aplicarDailyTurno('olá bom dia', 'Olá!', [], { resumir, escrever });

        expect(escrever).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('inclui link da nota quando a destilação escreveu conhecimento', async () => {
        const resumir = vi.fn().mockResolvedValue('- Turno resumido');
        const escrever = vi.fn().mockResolvedValue({ dia: '2026-06-06', criado: false });

        const result = await aplicarDailyTurno(
            'q',
            'a',
            [{ slug: 'prova-kernel', title: 'Prova Kernel', criada: false }],
            {
                resumir,
                escrever,
            },
        );

        expect(escrever).toHaveBeenCalledWith(
            '### 09:30\n' +
                '- Turno resumido\n' +
                '- Estado escrito: [[prova-kernel]] (atualizada: Prova Kernel)',
        );
        expect(result).toEqual({ dia: '2026-06-06', criado: false });
    });

    it('liga o heading à conversa-fonte quando recebe conversationId', async () => {
        const resumir = vi.fn().mockResolvedValue('- Turno resumido');
        const escrever = vi.fn().mockResolvedValue({ dia: '2026-06-06', criado: true });

        await aplicarDailyTurno('q', 'a', [], { resumir, escrever }, 'abc-123');

        expect(escrever).toHaveBeenCalledWith(
            '### 09:30 · [[conversa:abc-123|conversa]]\n- Turno resumido',
        );
    });
});
