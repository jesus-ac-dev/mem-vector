import { afterEach, describe, expect, it, vi } from 'vitest';

import { consumirSteeringCom, guardarSteeringCom, lerSteeringPendenteCom } from './relay.steering';

afterEach(() => {
    vi.restoreAllMocks();
});

function dbComSessao(overrides: Record<string, unknown> = {}) {
    return {
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } }),
        },
        ...overrides,
    };
}

describe('guardarSteeringCom', () => {
    it('rejeita texto vazio sem tocar a BD', async () => {
        const from = vi.fn();
        const r = await guardarSteeringCom(dbComSessao({ from }) as never, {
            repo: 'o/r',
            issue: 1,
            texto: '   ',
        });
        expect(r.ok).toBe(false);
        expect(from).not.toHaveBeenCalled();
    });

    it('grava a orientação pendente com o dono explícito', async () => {
        const insert = vi.fn().mockResolvedValue({ error: null });
        const db = dbComSessao({ from: vi.fn(() => ({ insert })) });

        const r = await guardarSteeringCom(db as never, {
            repo: 'o/r',
            issue: 4,
            texto: '  usa a tabela nova  ',
        });

        expect(r.ok).toBe(true);
        expect(insert).toHaveBeenCalledWith({
            owner_id: 'u1',
            repo_github: 'o/r',
            issue_github: 4,
            texto: 'usa a tabela nova',
        });
    });

    it('devolve erro legível quando o insert falha', async () => {
        const db = dbComSessao({
            from: vi.fn(() => ({
                insert: vi.fn().mockResolvedValue({ error: { message: 'RLS' } }),
            })),
        });
        const r = await guardarSteeringCom(db as never, { repo: 'o/r', issue: 4, texto: 'x' });
        expect(r.ok).toBe(false);
        expect(r.detalhe).toMatch(/RLS/);
    });
});

describe('consumirSteeringCom', () => {
    it('devolve os textos pendentes por ordem e marca-os consumidos com fase/ronda', async () => {
        const pendentes = [
            { id: 'a', texto: 'primeiro' },
            { id: 'b', texto: 'segundo' },
        ];
        const order = vi.fn().mockResolvedValue({ data: pendentes, error: null });
        const is = vi.fn(() => ({ order }));
        const eqSel2 = vi.fn(() => ({ is }));
        const eqSel1 = vi.fn(() => ({ eq: eqSel2 }));
        const inFn = vi.fn().mockResolvedValue({ error: null });
        const update = vi.fn(() => ({ in: inFn }));
        const db = {
            from: vi.fn(() => ({ select: vi.fn(() => ({ eq: eqSel1 })), update })),
        };

        const textos = await consumirSteeringCom(db as never, {
            repo: 'o/r',
            issue: 2,
            fase: 'dev',
            ronda: 3,
        });

        expect(textos).toEqual(['primeiro', 'segundo']);
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ consumido_fase: 'dev', consumido_ronda: 3 }),
        );
        expect(inFn).toHaveBeenCalledWith('id', ['a', 'b']);
    });

    it('é best-effort: erro devolve [] (o run nunca cai por causa do steering)', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const db = {
            from: vi.fn(() => ({
                select: vi.fn(() => {
                    throw new Error('boom');
                }),
            })),
        };
        await expect(
            consumirSteeringCom(db as never, { repo: 'o/r', issue: 2, fase: 'dev', ronda: 1 }),
        ).resolves.toEqual([]);
    });

    it('sem pendentes não faz update', async () => {
        const order = vi.fn().mockResolvedValue({ data: [], error: null });
        const is = vi.fn(() => ({ order }));
        const eqSel2 = vi.fn(() => ({ is }));
        const eqSel1 = vi.fn(() => ({ eq: eqSel2 }));
        const update = vi.fn();
        const db = {
            from: vi.fn(() => ({ select: vi.fn(() => ({ eq: eqSel1 })), update })),
        };

        const textos = await consumirSteeringCom(db as never, {
            repo: 'o/r',
            issue: 2,
            fase: 'analise',
            ronda: 1,
        });

        expect(textos).toEqual([]);
        expect(update).not.toHaveBeenCalled();
    });
});

describe('lerSteeringPendenteCom', () => {
    it('lista as pendentes em ordem de chegada', async () => {
        const rows = [{ id: 'a', texto: 'orienta', criado_em: '2026-07-01T10:00:00Z' }];
        const order = vi.fn().mockResolvedValue({ data: rows, error: null });
        const is = vi.fn(() => ({ order }));
        const eq2 = vi.fn(() => ({ is }));
        const eq1 = vi.fn(() => ({ eq: eq2 }));
        const db = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: eq1 })) })) };

        await expect(
            lerSteeringPendenteCom(db as never, { repo: 'o/r', issue: 2 }),
        ).resolves.toEqual([{ id: 'a', texto: 'orienta', criadoEm: '2026-07-01T10:00:00Z' }]);
    });
});
