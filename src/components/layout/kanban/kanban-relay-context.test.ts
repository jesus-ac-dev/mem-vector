import { describe, expect, it } from 'vitest';

import type { Tarefa } from '@/modules/tarefas/tarefas.schema';

import type { EventoRelayLido } from '@/modules/relay/relay.eventos';

import {
    agruparEventosPorRun,
    custoDoPasso,
    custoDosEventos,
    formatarCusto,
    formatarDuracao,
    promptKillSwitchRelay,
    rotuloEvento,
} from './kanban-relay-context';

function tarefa(parcial: Partial<Tarefa> = {}): Tarefa {
    return {
        id: 't1',
        titulo: 'Corrigir sync do relay',
        estado: 'testes',
        prioridade: 'normal',
        projetoId: null,
        projeto: 'mem-vector',
        descricao: 'O card não acompanha a fase bloqueada.',
        dependeDe: null,
        dataFim: null,
        criadaEm: '2026-06-22T00:00:00Z',
        concluidaEm: null,
        repoGithub: 'jesus-ac-dev/mem-vector',
        issueGithub: 150,
        relayEstado: 'bloqueado',
        relayFase: 'testes',
        relayPrUrl: 'https://github.com/jesus-ac-dev/mem-vector/pull/152',
        relayProgresso: null,
        acceptance: null,
        blocker: null,
        evidence: null,
        ...parcial,
    };
}

describe('promptKillSwitchRelay', () => {
    it('monta contexto rico para o chat recuperar o kill-switch', () => {
        const prompt = promptKillSwitchRelay(tarefa(), '~/src/mem-vector');
        expect(prompt).toContain('recuperar o kill-switch');
        expect(prompt).toContain('Tarefa: Corrigir sync do relay');
        expect(prompt).toContain('Repo: jesus-ac-dev/mem-vector');
        expect(prompt).toContain('Issue: #150');
        expect(prompt).toContain('Fase bloqueada: Testes');
        expect(prompt).toContain('Motivo provável (sem-consenso)');
        expect(prompt).toContain('Link PR: https://github.com/jesus-ac-dev/mem-vector/pull/152');
        expect(prompt).toContain('Working copy local: ~/src/mem-vector');
    });

    it('inclui reason-code de erro quando a fase bloqueada é erro', () => {
        const prompt = promptKillSwitchRelay(tarefa({ relayFase: 'erro' }), '~/src/mem-vector');
        expect(prompt).toContain('Fase bloqueada: Erro');
        expect(prompt).toContain('Motivo provável (erro)');
    });

    it('inclui reason-code de órfão quando a fase bloqueada é órfão', () => {
        const prompt = promptKillSwitchRelay(tarefa({ relayFase: 'órfão' }), '~/src/mem-vector');
        expect(prompt).toContain('Fase bloqueada: órfão');
        expect(prompt).toContain('Motivo provável (orfao)');
    });
});

function evento(parcial: Partial<EventoRelayLido> = {}): EventoRelayLido {
    return {
        runId: 'run-1',
        tipo: 'passo',
        fase: 'dev',
        ronda: 1,
        provider: 'claude',
        papel: 'principal',
        veredito: null,
        detalhe: 'fez',
        modelo: null,
        custoUsd: null,
        custoEstimado: null,
        duracaoMs: null,
        criadoEm: '2026-07-01T10:00:00Z',
        ...parcial,
    };
}

describe('agruparEventosPorRun (#129)', () => {
    it('agrupa eventos consecutivos da mesma corrida, mantendo a ordem', () => {
        const runs = agruparEventosPorRun([
            evento({ runId: 'a' }),
            evento({ runId: 'a', tipo: 'fim' }),
            evento({ runId: 'b' }),
        ]);
        expect(runs.map((r) => r.runId)).toEqual(['a', 'b']);
        expect(runs[0].eventos).toHaveLength(2);
        expect(runs[1].eventos).toHaveLength(1);
    });
    it('lista vazia → sem runs', () => {
        expect(agruparEventosPorRun([])).toEqual([]);
    });
});

describe('custoDosEventos (#129)', () => {
    it('soma só os passos; estimado se algum passo o for', () => {
        const r = custoDosEventos([
            evento({ custoUsd: 0.2, custoEstimado: false }),
            evento({ custoUsd: 0.05, custoEstimado: true, papel: 'validador' }),
            evento({ tipo: 'testes', custoUsd: 99 }), // não é passo → fora
        ]);
        expect(r.total).toBeCloseTo(0.25);
        expect(r.estimado).toBe(true);
    });
});

describe('formatação (#129)', () => {
    it('custo com ~ quando estimado', () => {
        expect(formatarCusto(0.25, false)).toBe('$0.25');
        expect(formatarCusto(0.25, true)).toBe('~$0.25');
    });
    it('duração em ms/s/minutos', () => {
        expect(formatarDuracao(800)).toBe('800ms');
        expect(formatarDuracao(12_000)).toBe('12s');
        expect(formatarDuracao(125_000)).toBe('2m05s');
    });
    it('rótulo por tipo de evento', () => {
        expect(rotuloEvento(evento())).toBe('claude · principal');
        expect(rotuloEvento(evento({ tipo: 'testes' }))).toBe('test-gate');
        expect(rotuloEvento(evento({ tipo: 'steering' }))).toBe('humano · steering');
    });
    it('custo do passo: real com $, não-reportado = "custo n/d" (nunca célula vazia)', () => {
        expect(custoDoPasso(evento({ custoUsd: 0.25, custoEstimado: false }))).toBe('$0.25');
        expect(custoDoPasso(evento({ custoUsd: 0, custoEstimado: true }))).toBe('custo n/d');
        expect(custoDoPasso(evento({ tipo: 'transicao', custoUsd: 0.5 }))).toBeNull();
    });
});
