import { afterEach, describe, expect, it, vi } from 'vitest';

import { lerRunsRelayCom, registarRunRelayCom, runDoResultado } from './relay.runs';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('runDoResultado (resultado do orquestrador → campos do run-ledger)', () => {
    it('pr-aberto → estado + prUrl, sem fase', () => {
        expect(runDoResultado({ estado: 'pr-aberto', prUrl: 'http://pr/1' })).toEqual({
            estado: 'pr-aberto',
            fase: null,
            prUrl: 'http://pr/1',
        });
    });
    it('bloqueado → estado + fase (onde parou), sem prUrl', () => {
        expect(runDoResultado({ estado: 'bloqueado', cruzamento: 'testes' })).toEqual({
            estado: 'bloqueado',
            fase: 'testes',
            prUrl: null,
        });
    });
    it('pronto (verde sem PR) → só estado', () => {
        expect(runDoResultado({ estado: 'pronto' })).toEqual({
            estado: 'pronto',
            fase: null,
            prUrl: null,
        });
    });
});

describe('registarRunRelayCom', () => {
    it('é best-effort: sem sessão não lança nem tenta inserir', async () => {
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        const insert = vi.fn();
        const db = {
            auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
            from: vi.fn(() => ({ insert })),
        };

        await expect(
            registarRunRelayCom(db as never, {
                repo: 'o/r',
                issue: 1,
                resultado: { estado: 'pronto' },
                inicio: new Date('2026-06-25T20:00:00Z'),
            }),
        ).resolves.toBeUndefined();

        expect(insert).not.toHaveBeenCalled();
        expect(erro).toHaveBeenCalledWith(
            'registar run do relay: sem sessão para o owner (saltado).',
        );
    });

    it('é best-effort: erro do insert não lança', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const db = {
            auth: {
                getSession: vi.fn().mockResolvedValue({
                    data: { session: { user: { id: 'user-1' } } },
                }),
            },
            from: vi.fn(() => ({
                insert: vi.fn().mockResolvedValue({ error: { message: 'RLS bloqueou' } }),
            })),
        };

        await expect(
            registarRunRelayCom(db as never, {
                repo: 'o/r',
                issue: 2,
                resultado: { estado: 'bloqueado', cruzamento: 'testes' },
                inicio: new Date('2026-06-25T20:00:00Z'),
            }),
        ).resolves.toBeUndefined();
    });

    it('é best-effort: exceção inesperada não lança', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const db = {
            auth: { getSession: vi.fn().mockRejectedValue(new Error('sem cookies')) },
        };

        await expect(
            registarRunRelayCom(db as never, {
                repo: 'o/r',
                issue: 3,
                resultado: { estado: 'pr-aberto', prUrl: 'https://pr' },
                inicio: new Date('2026-06-25T20:00:00Z'),
            }),
        ).resolves.toBeUndefined();
    });
});

describe('lerRunsRelayCom', () => {
    it('limita defensivamente entre 1 e 50', async () => {
        const limit = vi.fn().mockResolvedValue({ data: [], error: null });
        const db = {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    order: vi.fn(() => ({ limit })),
                })),
            })),
        };

        await lerRunsRelayCom(db as never, { limite: 999 });
        expect(limit).toHaveBeenCalledWith(50);
    });
});
