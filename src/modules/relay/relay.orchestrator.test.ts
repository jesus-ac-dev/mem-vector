import { describe, expect, it, vi } from 'vitest';

import type { Provider } from '@/modules/definicoes/definicoes.schema';
import type { RespostaRepo } from '@/lib/providers/escrita-no-repo';

import {
    orquestrarDevCom,
    promptDevPrincipal,
    type IoOrquestrador,
    type Semaforo,
} from './relay.orchestrator';

function resp(text: string): RespostaRepo {
    return { text, costUsd: 0, costIsEstimate: true };
}

// Fake da IO: regista comentários, semáforos, PR e as corridas dos providers.
function fakeIo(over: Partial<IoOrquestrador> = {}) {
    const comentarios: string[] = [];
    const semaforos: Semaforo[] = [];
    const corridas: { provider: Provider; escrever: boolean }[] = [];
    const io: IoOrquestrador = {
        comentar: vi.fn(async (b: string) => void comentarios.push(b)),
        moverSemaforo: vi.fn(async (_de, para) => void semaforos.push(para)),
        abrirBranch: vi.fn(async () => {}),
        diff: vi.fn(async () => 'diff fake'),
        commitPush: vi.fn(async () => {}),
        criarPR: vi.fn(async () => 'https://github.com/o/r/pull/9'),
        correr: vi.fn(async (provider: Provider, _p: string, escrever: boolean) => {
            corridas.push({ provider, escrever });
            return resp('APROVADO');
        }),
        ...over,
    };
    return { io, comentarios, semaforos, corridas };
}

describe('orquestrarDevCom — verde', () => {
    it('abre branch, posta handoff por substep, e no verde faz PR sem auto-merge', async () => {
        const { io, comentarios, semaforos, corridas } = fakeIo();
        const out = await orquestrarDevCom({
            issue: 42,
            spec: 'Implementa X',
            cfg: { principal: 'codex', validadores: ['claude'], maxRondas: 3 },
            io,
        });

        expect(out.estado).toBe('pr-aberto');
        if (out.estado === 'pr-aberto') expect(out.prUrl).toContain('/pull/9');

        // Branch da Intern Rule aberto antes de produzir.
        expect(io.abrirBranch).toHaveBeenCalledWith('feat/issue-42');

        // Substeps: principal escreve (escrever=true), validador valida (false).
        expect(corridas).toEqual([
            { provider: 'codex', escrever: true },
            { provider: 'claude', escrever: false },
        ]);

        // Handoff POR SUBSTEP (não no fim): ≥1 do principal + 1 do validador +
        // o comentário final de 🟢 pronto.
        expect(comentarios.some((c) => c.startsWith('— Codex · principal'))).toBe(true);
        expect(comentarios.some((c) => c.startsWith('— Claude · validador'))).toBe(true);
        expect(comentarios.some((c) => c.includes('🟢'))).toBe(true);

        // Semáforo: processando → pronto. Nunca bloqueado.
        expect(semaforos).toEqual(['processando', 'pronto']);

        // PR com Closes #N; SEM auto-merge (não há chamada de merge na io).
        expect(io.criarPR).toHaveBeenCalledTimes(1);
        expect(io.commitPush).toHaveBeenCalledTimes(1);
    });

    it('sem validadores, passa à primeira (só principal)', async () => {
        const { io, semaforos } = fakeIo();
        const out = await orquestrarDevCom({
            issue: 1,
            spec: 's',
            cfg: { principal: 'codex', validadores: [], maxRondas: 3 },
            io,
        });
        expect(out.estado).toBe('pr-aberto');
        expect(semaforos).toEqual(['processando', 'pronto']);
    });
});

describe('orquestrarDevCom — kill-switch', () => {
    it('validador rejeita sempre → bloqueado 🔴 ao fim das rondas, sem PR', async () => {
        const { io, comentarios, semaforos } = fakeIo({
            correr: vi.fn(async (_provider: Provider, _p: string, escrever: boolean) =>
                escrever ? resp('escrevi algo') : resp('REJEITADO: falta o caso de erro'),
            ),
        });
        const out = await orquestrarDevCom({
            issue: 7,
            spec: 's',
            cfg: { principal: 'codex', validadores: ['claude'], maxRondas: 2 },
            io,
        });

        expect(out).toEqual({ estado: 'bloqueado', rondas: 2 });
        expect(io.criarPR).not.toHaveBeenCalled();
        expect(io.commitPush).not.toHaveBeenCalled();
        expect(semaforos).toEqual(['processando', 'bloqueado']);
        expect(comentarios.some((c) => c.includes('🔴'))).toBe(true);
        // A objeção do validador chega ao programador na 2ª ronda (handoff feedback).
        expect(comentarios.some((c) => c.includes('falta o caso de erro'))).toBe(true);
    });
});

describe('promptDevPrincipal', () => {
    it('a 1ª ronda não traz feedback; as seguintes trazem a correção', () => {
        expect(promptDevPrincipal('spec', null)).not.toContain('reprovada');
        expect(promptDevPrincipal('spec', 'falta X')).toContain('falta X');
    });
});
