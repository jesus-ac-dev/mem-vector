import { describe, it, expect } from 'vitest';

import { correrPipeline } from './relay.pipeline';
import type { ResultadoCruzamento } from './relay.runner';
import type { Cruzamento, DefinicoesServidor } from '@/modules/definicoes/definicoes.schema';

function defs(cruzamentos: DefinicoesServidor['cruzamentos']): DefinicoesServidor {
    return {
        metodoDestilacao: 'one-shot',
        modulosAtivos: [],
        chatProvider: 'claude',
        matchCount: 5,
        webHabilitada: false,
        githubRepos: [],
        cruzamentos,
        agentes: {},
    };
}

const ok = (output: string): ResultadoCruzamento => ({
    output,
    rondas: 1,
    validado: true,
    historico: [],
});

describe('correrPipeline (o circuito das atividades)', () => {
    it('só corre os cruzamentos CONFIGURADOS, na ordem canónica', async () => {
        const correram: Cruzamento[] = [];
        const r = await correrPipeline({
            defs: defs({
                auditoria: { principal: 'claude', validadores: [] },
                analise: { principal: 'claude', validadores: [] },
                dev: { principal: 'codex', validadores: ['claude'] },
            }),
            spec: 'tarefa',
            executar: async (c) => {
                correram.push(c);
                return ok(`out-${c}`);
            },
        });
        // docs não estava configurado; a ordem é canónica (analise→dev→auditoria).
        expect(r.ordem).toEqual(['analise', 'dev', 'auditoria']);
        expect(correram).toEqual(['analise', 'dev', 'auditoria']);
        expect(r.completo).toBe(true);
    });

    it('estrela: os de execução recebem o output da Análise', async () => {
        const specsVistos: Record<string, string> = {};
        await correrPipeline({
            defs: defs({
                analise: { principal: 'claude', validadores: [] },
                dev: { principal: 'codex', validadores: [] },
            }),
            spec: 'tarefa-base',
            executar: async (c, s) => {
                specsVistos[c] = s;
                return ok(c === 'analise' ? 'PLANO-X' : 'feito');
            },
        });
        expect(specsVistos.analise).toBe('tarefa-base'); // a Análise recebe a tarefa crua
        expect(specsVistos.dev).toContain('PLANO-X'); // o dev recebe a Análise como referência
    });

    it('retoma cirúrgica: desde + analiseInicial saltam a Análise e usam o goal dado', async () => {
        const correram: Cruzamento[] = [];
        const specsVistos: Record<string, string> = {};
        const r = await correrPipeline({
            defs: defs({
                analise: { principal: 'claude', validadores: [] },
                dev: { principal: 'codex', validadores: [] },
                auditoria: { principal: 'claude', validadores: [] },
            }),
            spec: 'tarefa',
            desde: 'auditoria',
            analiseInicial: 'GOAL-GUARDADO',
            executar: async (c, s) => {
                correram.push(c);
                specsVistos[c] = s;
                return ok(`out-${c}`);
            },
        });
        // Saltou analise e dev (já tinham passado); só correu a auditoria.
        expect(correram).toEqual(['auditoria']);
        // A estrela usou o goal guardado, sem redestilar a Análise.
        expect(specsVistos.auditoria).toContain('GOAL-GUARDADO');
        expect(r.completo).toBe(true);
    });

    it('pára e marca incompleto quando um cruzamento não valida (kill switch)', async () => {
        const r = await correrPipeline({
            defs: defs({
                analise: { principal: 'claude', validadores: [] },
                dev: { principal: 'codex', validadores: ['claude'] },
                docs: { principal: 'claude', validadores: [] },
            }),
            spec: 'tarefa',
            executar: async (c) =>
                c === 'dev'
                    ? { output: 'meh', rondas: 3, validado: false, historico: [] }
                    : ok(`out-${c}`),
        });
        expect(r.ordem).toEqual(['analise', 'dev']); // parou no dev, docs não correu
        expect(r.completo).toBe(false);
    });
});
