import { describe, expect, it } from 'vitest';

import type { Tarefa } from '@/modules/tarefas/tarefas.schema';

import { promptKillSwitchRelay } from './kanban-relay-context';

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
        expect(prompt).toContain('Link PR: https://github.com/jesus-ac-dev/mem-vector/pull/152');
        expect(prompt).toContain('Working copy local: ~/src/mem-vector');
    });
});
