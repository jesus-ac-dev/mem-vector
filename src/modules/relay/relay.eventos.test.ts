import { afterEach, describe, expect, it, vi } from 'vitest';

import { lerEventosRelayCom, registarEventoRelayCom, resumoEvento } from './relay.eventos';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('resumoEvento (texto longo → linha da timeline)', () => {
    it('colapsa whitespace e devolve curto intacto', () => {
        expect(resumoEvento('  ok\n\n  suite   verde ')).toBe('ok suite verde');
    });
    it('trunca no máximo com reticências', () => {
        const r = resumoEvento('a'.repeat(500), 100);
        expect(r.length).toBe(100);
        expect(r.endsWith('…')).toBe(true);
    });
});

describe('registarEventoRelayCom', () => {
    it('é best-effort: sem sessão não lança nem tenta inserir', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const insert = vi.fn();
        const db = {
            auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
            from: vi.fn(() => ({ insert })),
        };

        await expect(
            registarEventoRelayCom(db as never, {
                runId: 'run-1',
                repo: 'o/r',
                issue: 1,
                tipo: 'passo',
            }),
        ).resolves.toBeUndefined();

        expect(insert).not.toHaveBeenCalled();
    });

    it('insere o passo com os campos do provider (custo/modelo/duração)', async () => {
        const insert = vi.fn().mockResolvedValue({ error: null });
        const db = {
            auth: {
                getSession: vi
                    .fn()
                    .mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } }),
            },
            from: vi.fn(() => ({ insert })),
        };

        await registarEventoRelayCom(db as never, {
            runId: 'run-1',
            repo: 'o/r',
            issue: 7,
            tipo: 'passo',
            fase: 'dev',
            ronda: 2,
            provider: 'claude',
            papel: 'principal',
            detalhe: 'implementou o teste',
            modelo: 'claude-x',
            custoUsd: 0.12,
            custoEstimado: false,
            duracaoMs: 1234,
        });

        expect(db.from).toHaveBeenCalledWith('relay_eventos');
        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({
                owner_id: 'user-1',
                run_id: 'run-1',
                repo_github: 'o/r',
                issue_github: 7,
                tipo: 'passo',
                fase: 'dev',
                ronda: 2,
                provider: 'claude',
                papel: 'principal',
                detalhe: 'implementou o teste',
                modelo: 'claude-x',
                custo_usd: 0.12,
                custo_estimado: false,
                duracao_ms: 1234,
            }),
        );
    });

    it('é best-effort: erro do insert não lança', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const db = {
            auth: {
                getSession: vi
                    .fn()
                    .mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } }),
            },
            from: vi.fn(() => ({
                insert: vi.fn().mockResolvedValue({ error: { message: 'RLS bloqueou' } }),
            })),
        };

        await expect(
            registarEventoRelayCom(db as never, {
                runId: 'run-1',
                repo: 'o/r',
                issue: 1,
                tipo: 'fim',
                detalhe: 'pr-aberto',
            }),
        ).resolves.toBeUndefined();
    });
});

describe('lerEventosRelayCom', () => {
    it('lê os mais recentes e devolve em ordem cronológica (timeline)', async () => {
        const rows = [
            {
                run_id: 'run-2',
                tipo: 'fim',
                fase: 'pr',
                ronda: null,
                provider: null,
                papel: null,
                veredito: null,
                detalhe: 'https://pr/9',
                modelo: null,
                custo_usd: null,
                custo_estimado: null,
                duracao_ms: null,
                criado_em: '2026-07-01T11:00:00Z',
            },
            {
                run_id: 'run-2',
                tipo: 'passo',
                fase: 'dev',
                ronda: 1,
                provider: 'codex',
                papel: 'validador',
                veredito: 'ok',
                detalhe: 'aprovado',
                modelo: null,
                custo_usd: 0.05,
                custo_estimado: true,
                duracao_ms: 900,
                criado_em: '2026-07-01T10:00:00Z',
            },
        ];
        const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
        const order = vi.fn(() => ({ limit }));
        const eq2 = vi.fn(() => ({ order }));
        const eq1 = vi.fn(() => ({ eq: eq2 }));
        const db = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: eq1 })) })) };

        const eventos = await lerEventosRelayCom(db as never, { repo: 'o/r', issue: 9 });

        expect(limit).toHaveBeenCalledWith(200);
        expect(eventos.map((e) => e.tipo)).toEqual(['passo', 'fim']);
        expect(eventos[0]).toMatchObject({
            runId: 'run-2',
            provider: 'codex',
            papel: 'validador',
            veredito: 'ok',
            custoUsd: 0.05,
            custoEstimado: true,
            duracaoMs: 900,
            criadoEm: '2026-07-01T10:00:00Z',
        });
    });

    it('erro da query lança (a rota trata)', async () => {
        const limit = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
        const order = vi.fn(() => ({ limit }));
        const eq2 = vi.fn(() => ({ order }));
        const eq1 = vi.fn(() => ({ eq: eq2 }));
        const db = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: eq1 })) })) };

        await expect(lerEventosRelayCom(db as never, { repo: 'o/r', issue: 9 })).rejects.toThrow(
            /boom/,
        );
    });
});
