import { describe, expect, it, vi } from 'vitest';

import type { Cruzamento, Provider } from '@/modules/definicoes/definicoes.schema';
import type { RespostaRepo } from '@/lib/providers/escrita-no-repo';
import type { ResultadoCruzamento } from './relay.runner';

import {
    faseDeRetoma,
    goalDaAnalise,
    montarSpec,
    normalizarDefsRelay,
    orquestrarCom,
    orquestrarCruzamentoCom,
    orquestrarFaseSequencialCom,
    promptPrincipal,
    type IoOrquestrador,
    type Semaforo,
} from './relay.orchestrator';

function resp(text: string): RespostaRepo {
    return { text, costUsd: 0, costIsEstimate: true };
}

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

const okCruzamento: ResultadoCruzamento = {
    output: 'feito',
    rondas: 1,
    validado: true,
    historico: [{ ronda: 1, output: 'feito' }],
};

describe('orquestrarCom — pipeline verde', () => {
    it('abre branch, corre os cruzamentos, e no verde com código faz PR (sem auto-merge)', async () => {
        const { io, comentarios, semaforos } = fakeIo();
        const ordem: Cruzamento[] = [];
        const out = await orquestrarCom({
            issue: 42,
            spec: 's',
            defs: { cruzamentos: { analise: {}, dev: {} } } as never,
            io,
            executarCruzamento: async (c) => {
                ordem.push(c);
                return okCruzamento;
            },
        });

        expect(out).toEqual({ estado: 'pr-aberto', prUrl: 'https://github.com/o/r/pull/9' });
        expect(io.abrirBranch).toHaveBeenCalledWith('feat/issue-42', false); // fresh, não retoma
        // Estrela: análise antes da execução.
        expect(ordem).toEqual(['analise', 'dev']);
        expect(semaforos).toEqual(['processando', 'pronto']);
        expect(io.commitPush).toHaveBeenCalledTimes(1);
        expect(comentarios.some((c) => c.includes('🟢'))).toBe(true);
    });

    it('fase real: todos os providers ativos validam, mas só repo-writers escrevem', async () => {
        const { io, corridas } = fakeIo({ diff: vi.fn(async () => '   ') });
        await orquestrarCom({
            issue: 2,
            spec: 's',
            defs: {
                cruzamentos: { dev: { principal: 'claude', validadores: [] } },
                agentes: {
                    claude: { ativo: true, modo: 'cli' },
                    codex: { ativo: true, modo: 'cli' },
                    gemini: { ativo: true, modo: 'api' },
                },
            } as never,
            io,
        });
        expect(corridas).toEqual([
            { provider: 'claude', escrever: true },
            { provider: 'codex', escrever: false },
            { provider: 'gemini', escrever: false },
            { provider: 'codex', escrever: true },
            { provider: 'claude', escrever: false },
            { provider: 'gemini', escrever: false },
        ]);
    });

    it('fase configurada não encurta o relay: continuam a rodar os providers ativos', async () => {
        const { io, corridas } = fakeIo({ diff: vi.fn(async () => '   ') });
        await orquestrarCom({
            issue: 3,
            spec: 's',
            defs: {
                cruzamentos: { dev: { principal: 'claude', validadores: [] } },
                agentes: {
                    claude: { ativo: true, modo: 'cli' },
                    codex: { ativo: true, modo: 'cli' },
                },
            } as never,
            io,
        });
        expect(corridas).toEqual([
            { provider: 'claude', escrever: true },
            { provider: 'codex', escrever: false },
            { provider: 'codex', escrever: true },
            { provider: 'claude', escrever: false },
        ]);
    });

    it('retoma: abre o branch em modo CONTINUAR (retoma=true), não reseta', async () => {
        const { io } = fakeIo();
        await orquestrarCom({
            issue: 9,
            spec: 's',
            defs: { cruzamentos: { auditoria: {} } } as never,
            io,
            desde: 'auditoria',
            executarCruzamento: async () => okCruzamento,
        });
        expect(io.abrirBranch).toHaveBeenCalledWith('feat/issue-9', true);
    });

    it('verde mas sem diff (análise/auditoria-só) não abre PR', async () => {
        const { io } = fakeIo({ diff: vi.fn(async () => '   ') });
        const out = await orquestrarCom({
            issue: 1,
            spec: 's',
            defs: { cruzamentos: { analise: {} } } as never,
            io,
            executarCruzamento: async () => okCruzamento,
        });
        expect(out).toEqual({ estado: 'pronto' });
        expect(io.criarPR).not.toHaveBeenCalled();
    });
});

describe('orquestrarCom — kill-switch', () => {
    it('um cruzamento que não valida → 🔴 bloqueado, sem PR', async () => {
        const { io, comentarios, semaforos } = fakeIo();
        const out = await orquestrarCom({
            issue: 7,
            spec: 's',
            defs: { cruzamentos: { analise: {}, dev: {} } } as never,
            io,
            executarCruzamento: async (c) =>
                c === 'dev'
                    ? {
                          output: 'x',
                          rondas: 2,
                          validado: false,
                          historico: [
                              {
                                  ronda: 2,
                                  output: 'x',
                                  veredito: { ok: false, feedback: 'falta o teste' },
                              },
                          ],
                      }
                    : okCruzamento,
        });
        expect(out).toEqual({ estado: 'bloqueado', cruzamento: 'dev' });
        expect(io.criarPR).not.toHaveBeenCalled();
        expect(io.commitPush).not.toHaveBeenCalled();
        expect(semaforos).toEqual(['processando', 'bloqueado']);
        expect(comentarios.some((c) => c.includes('🔴') && c.includes('falta o teste'))).toBe(true);
    });
});

describe('orquestrarCruzamentoCom — handoff por substep', () => {
    it('dev: principal escreve (escrever=true), validador valida o diff (false)', async () => {
        const { io, comentarios, corridas } = fakeIo();
        const r = await orquestrarCruzamentoCom({
            cruzamento: 'dev',
            spec: 's',
            principal: 'codex',
            validadores: ['claude'],
            maxRondas: 3,
            io,
        });
        expect(r.validado).toBe(true);
        expect(corridas).toEqual([
            { provider: 'codex', escrever: true },
            { provider: 'claude', escrever: false },
        ]);
        expect(comentarios.some((c) => c.startsWith('— Codex · principal · Desenvolvimento'))).toBe(
            true,
        );
        expect(
            comentarios.some((c) => c.startsWith('— Claude · validador · Desenvolvimento')),
        ).toBe(true);
    });

    it('test-gate: suite vermelha rejeita ANTES do validador LLM (não o corre)', async () => {
        const validadorCorrido = vi.fn();
        const { io } = fakeIo({
            testar: vi.fn(async () => ({ ok: false, output: 'FAIL x.test' })),
            correr: vi.fn(async (_provider: Provider, _p: string, escrever: boolean) => {
                if (!escrever) validadorCorrido();
                return resp(escrever ? 'escrevi' : 'APROVADO');
            }),
        });
        const r = await orquestrarCruzamentoCom({
            cruzamento: 'dev',
            spec: 's',
            principal: 'codex',
            validadores: ['claude'],
            maxRondas: 1,
            io,
        });
        expect(r.validado).toBe(false);
        // O validador LLM nunca correu — o gate dos testes barrou antes.
        expect(validadorCorrido).not.toHaveBeenCalled();
    });

    it('analise: read-only (principal escrever=false), valida o output', async () => {
        const { corridas } = await (async () => {
            const f = fakeIo();
            await orquestrarCruzamentoCom({
                cruzamento: 'analise',
                spec: 's',
                principal: 'claude',
                validadores: ['codex'],
                maxRondas: 1,
                io: f.io,
            });
            return f;
        })();
        expect(corridas[0]).toEqual({ provider: 'claude', escrever: false });
    });
});

describe('orquestrarCruzamentoCom — agregação fina (split)', () => {
    it('split (um aprova, outro objeta) rotula "SEM CONSENSO" com os dois lados', async () => {
        const { io } = fakeIo({
            correr: vi.fn(async (provider: Provider, _p: string, escrever: boolean) => {
                if (escrever) return resp('escrevi');
                return resp(provider === 'claude' ? 'APROVADO' : 'REJEITADO: falta o caso de erro');
            }),
        });
        const r = await orquestrarCruzamentoCom({
            cruzamento: 'dev',
            spec: 's',
            principal: 'codex',
            validadores: ['claude', 'gemini'],
            maxRondas: 1,
            io,
        });
        expect(r.validado).toBe(false);
        const feedback = r.historico.at(-1)?.veredito?.feedback ?? '';
        expect(feedback).toContain('SEM CONSENSO');
        expect(feedback).toContain('falta o caso de erro');
    });
});

describe('orquestrarFaseSequencialCom — todos os providers ativos por fase', () => {
    it('cada provider corre como principal, sequencialmente, com os outros a validar', async () => {
        const { io, corridas } = fakeIo();
        const r = await orquestrarFaseSequencialCom({
            cruzamento: 'dev',
            spec: 's',
            providers: ['claude', 'codex'],
            maxRondas: 1,
            io,
        });
        expect(r.validado).toBe(true);
        expect(corridas).toEqual([
            { provider: 'claude', escrever: true },
            { provider: 'codex', escrever: false },
            { provider: 'codex', escrever: true },
            { provider: 'claude', escrever: false },
        ]);
        expect(r.output).toContain('## claude');
        expect(r.output).toContain('## codex');
    });
});

describe('normalizarDefsRelay', () => {
    it('expande o relay real para Análise→Dev→Testes→Docs com todos os providers ativos', () => {
        const defs = normalizarDefsRelay({
            metodoDestilacao: 'one-shot',
            modulosAtivos: [],
            chatProvider: 'claude',
            matchCount: 5,
            webHabilitada: false,
            githubRepos: [],
            cruzamentos: {
                auditoria: { principal: 'claude', validadores: [] },
            },
            agentes: {
                claude: { ativo: true, modo: 'cli' },
                codex: { ativo: true, modo: 'cli' },
            },
        });
        expect(Object.keys(defs.cruzamentos)).toEqual(['analise', 'dev', 'testes', 'docs']);
        expect(defs.cruzamentos.testes).toEqual({
            principal: 'claude',
            validadores: ['codex'],
        });
    });
});

describe('faseDeRetoma', () => {
    it('encontra a fase gravada nas labels', () => {
        expect(faseDeRetoma(['relay:🟠', 'relay:fase:dev'])).toBe('dev');
        expect(faseDeRetoma(['relay:fase:auditoria'])).toBe('auditoria');
    });
    it('null quando não há label de fase', () => {
        expect(faseDeRetoma(['relay:🔴', 'bug'])).toBeNull();
    });
});

describe('goalDaAnalise', () => {
    it('extrai o goal do último handoff "principal · Análise"', () => {
        const goal = goalDaAnalise([
            { corpo: '— Codex · principal · Análise · ronda 1\n\nGoal antigo' },
            { corpo: '— Claude · validador · Análise · ronda 1\n\nAPROVADO' },
            {
                corpo: '— Codex · principal · Análise · ronda 2\n\nGoal: fazer X e Y, testado por Z.',
            },
        ]);
        expect(goal).toBe('Goal: fazer X e Y, testado por Z.');
    });
    it('null quando não há handoff de Análise', () => {
        expect(goalDaAnalise([{ corpo: 'comentário humano qualquer' }])).toBeNull();
    });
});

describe('montarSpec — retoma por comentários humanos', () => {
    it('junta os comentários humanos (não os handoffs do relay)', () => {
        const s = montarSpec({
            title: 'T',
            body: 'B',
            comentarios: [
                { autor: 'bot', corpo: '— Codex · principal · Desenvolvimento · ronda 1\n\nfiz' },
                { autor: 'carlos', corpo: 'Na verdade o caso de erro é diferente.' },
                { autor: 'bot', corpo: '🔴 Bloqueado no cruzamento "dev"' },
            ],
        });
        expect(s).toContain('Na verdade o caso de erro é diferente.');
        expect(s).not.toContain('Bloqueado');
        expect(s).not.toContain('— Codex');
    });
    it('sem comentários humanos, é só título + corpo', () => {
        expect(montarSpec({ title: 'T', body: 'B' })).toBe('T\n\nB');
    });
});

describe('promptPrincipal', () => {
    it('cada cruzamento tem a sua função; feedback entra a partir da 2ª ronda', () => {
        expect(promptPrincipal('dev', 's', null)).toContain('PROGRAMADOR');
        expect(promptPrincipal('analise', 's', null)).toContain('ANALISTA');
        expect(promptPrincipal('dev', 's', 'corrige X')).toContain('corrige X');
    });
    it('a memória do SaaS entra SÓ na Análise, não no Dev', () => {
        const mem = 'KERNEL DO WORKSPACE: o Carlos prioriza o CRMCredito.';
        expect(promptPrincipal('analise', 's', null, mem)).toContain('CRMCredito');
        expect(promptPrincipal('dev', 's', null, mem)).not.toContain('CRMCredito');
    });
});
