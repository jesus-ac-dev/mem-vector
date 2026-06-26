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
    promptValidador,
    relayFaseLabel,
    textoProgresso,
    type IoOrquestrador,
    type RelayFase,
    type Semaforo,
} from './relay.orchestrator';

function resp(text: string): RespostaRepo {
    return { text, costUsd: 0, costIsEstimate: true };
}

function fakeIo(over: Partial<IoOrquestrador> = {}) {
    const comentarios: string[] = [];
    const semaforos: Semaforo[] = [];
    const progressos: {
        fase: RelayFase;
        semaforo: Semaforo;
        prUrl?: string | null;
        relayProgresso?: string | null;
    }[] = [];
    const progressoTextos: string[] = [];
    const corridas: { provider: Provider; escrever: boolean }[] = [];
    const io: IoOrquestrador = {
        comentar: vi.fn(async (b: string) => void comentarios.push(b)),
        progresso: vi.fn(async (texto: string) => void progressoTextos.push(texto)),
        moverSemaforo: vi.fn(async (_de, para) => void semaforos.push(para)),
        atualizarProgresso: vi.fn(async (fase, semaforo, campos) => {
            progressos.push({
                fase,
                semaforo,
                prUrl: campos?.prUrl,
                relayProgresso: campos?.relayProgresso,
            });
        }),
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
    return { io, comentarios, semaforos, progressos, progressoTextos, corridas };
}

const okCruzamento: ResultadoCruzamento = {
    output: 'feito',
    rondas: 1,
    validado: true,
    historico: [{ ronda: 1, output: 'feito' }],
};

describe('orquestrarCom — pipeline verde', () => {
    it('abre branch, corre os cruzamentos, e no verde com código faz PR (sem auto-merge)', async () => {
        const { io, comentarios, progressos } = fakeIo();
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
        expect(progressos).toEqual([
            { fase: 'analise', semaforo: 'processando', prUrl: undefined, relayProgresso: null },
            { fase: 'dev', semaforo: 'processando', prUrl: undefined, relayProgresso: null },
            {
                fase: 'pr',
                semaforo: 'pronto',
                prUrl: 'https://github.com/o/r/pull/9',
                relayProgresso: null,
            },
        ]);
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
        // Cada repo-writer ESCREVE a sua perna (principal e validador); o gemini (api,
        // não escreve no repo) participa sempre read-only.
        expect(corridas).toEqual([
            { provider: 'claude', escrever: true }, // principal
            { provider: 'codex', escrever: true }, // validador codex (cli) escreve por cima
            { provider: 'gemini', escrever: false }, // validador gemini (api) revê read-only
            { provider: 'codex', escrever: true }, // principal
            { provider: 'claude', escrever: true }, // validador claude (cli) escreve por cima
            { provider: 'gemini', escrever: false }, // validador gemini (api) revê read-only
        ]);
    });

    it('override: fase configurada pelo user honra a config (1 principal), não roda', async () => {
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
            // O user configurou 'dev' → override: só o claude (validadores: []).
            fasesConfiguradas: ['dev'],
        });
        expect(corridas).toEqual([{ provider: 'claude', escrever: true }]);
    });

    it('override: se o principal declarado não escreve, cai para um validador repo-writer e mantém o original read-only', async () => {
        const { io, corridas } = fakeIo({ diff: vi.fn(async () => '   ') });
        await orquestrarCom({
            issue: 4,
            spec: 's',
            defs: {
                cruzamentos: { dev: { principal: 'gemini', validadores: ['claude'] } },
                agentes: {
                    gemini: { ativo: true, modo: 'api' },
                    claude: { ativo: true, modo: 'cli' },
                },
            } as never,
            io,
            fasesConfiguradas: ['dev'],
        });
        expect(corridas).toEqual([
            { provider: 'claude', escrever: true },
            { provider: 'gemini', escrever: false },
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
        const { io, comentarios, progressos } = fakeIo();
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
        expect(progressos).toEqual([
            { fase: 'analise', semaforo: 'processando', prUrl: undefined, relayProgresso: null },
            { fase: 'dev', semaforo: 'processando', prUrl: undefined, relayProgresso: null },
            { fase: 'dev', semaforo: 'bloqueado', prUrl: undefined, relayProgresso: null },
        ]);
        expect(comentarios.some((c) => c.includes('🔴') && c.includes('falta o teste'))).toBe(true);
    });
});

describe('orquestrarCruzamentoCom — handoff por substep', () => {
    it('dev: principal escreve e o validador também escreve a sua melhoria por cima', async () => {
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
        // Validador também ESCREVE a sua melhoria por cima (sem restrição de escritores
        // no teste direto = pode escrever).
        expect(corridas).toEqual([
            { provider: 'codex', escrever: true },
            { provider: 'claude', escrever: true },
        ]);
        expect(comentarios.some((c) => c.startsWith('— Codex · principal · Desenvolvimento'))).toBe(
            true,
        );
        expect(
            comentarios.some((c) => c.startsWith('— Claude · validador · Desenvolvimento')),
        ).toBe(true);
    });

    it('validador repo-writer escreve por cima; o não-escritor (escritores) revê read-only', async () => {
        const { io, corridas } = fakeIo();
        await orquestrarCruzamentoCom({
            cruzamento: 'dev',
            spec: 's',
            principal: 'claude',
            validadores: ['codex', 'gemini'],
            escritores: ['claude', 'codex'], // gemini fora → não escreve
            maxRondas: 1,
            io,
        });
        expect(corridas).toEqual([
            { provider: 'claude', escrever: true }, // principal
            { provider: 'codex', escrever: true }, // validador writer → escreve a melhoria
            { provider: 'gemini', escrever: false }, // validador não-writer → revê read-only
        ]);
    });

    it('test-gate: suite vermelha barra a convergência (corre DEPOIS de todos escreverem)', async () => {
        const { io, comentarios } = fakeIo({
            testar: vi.fn(async () => ({ ok: false, output: 'FAIL x.test' })),
        });
        const r = await orquestrarCruzamentoCom({
            cruzamento: 'dev',
            spec: 's',
            principal: 'codex',
            validadores: ['claude'],
            maxRondas: 1,
            io,
        });
        // Mesmo com todos a aprovar, a suite vermelha não deixa convergir (não finge verde).
        expect(r.validado).toBe(false);
        expect(comentarios.some((c) => c.includes('suite vermelha'))).toBe(true);
    });

    it('test-gate: também corre quando a fase não tem validadores', async () => {
        const { io, comentarios, corridas } = fakeIo({
            testar: vi.fn(async () => ({ ok: false, output: 'FAIL sem validadores' })),
        });
        const r = await orquestrarCruzamentoCom({
            cruzamento: 'dev',
            spec: 's',
            principal: 'codex',
            validadores: [],
            maxRondas: 1,
            io,
        });
        expect(corridas).toEqual([{ provider: 'codex', escrever: true }]);
        expect(r.validado).toBe(false);
        expect(comentarios.some((c) => c.includes('FAIL sem validadores'))).toBe(true);
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
            // O validador agora ESCREVE e dá veredito (a resposta é o veredito) — mocka-se
            // pelo prompt (VALIDADOR), não pelo flag escrever. claude aprova, gemini objeta.
            correr: vi.fn(async (provider: Provider, p: string, _escrever: boolean) => {
                if (p.includes('VALIDADOR')) {
                    return resp(
                        provider === 'claude' ? 'APROVADO' : 'REJEITADO: falta o caso de erro',
                    );
                }
                return resp('escrevi'); // principal
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
        // Ambos são repo-writers → cada um escreve como principal E por cima como validador.
        expect(corridas).toEqual([
            { provider: 'claude', escrever: true },
            { provider: 'codex', escrever: true },
            { provider: 'codex', escrever: true },
            { provider: 'claude', escrever: true },
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
            cruzamentos: {},
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
        expect(faseDeRetoma(['dev:vermelho'])).toBe('dev');
        expect(faseDeRetoma(['auditoria:vermelho'])).toBe('auditoria');
    });
    it('null quando não há label de fase', () => {
        expect(faseDeRetoma(['bug', 'relay'])).toBeNull();
    });
});

describe('relayFaseLabel', () => {
    it('usa o formato curto <fase>:<cor>', () => {
        expect(relayFaseLabel('analise', 'processando')).toBe('analise:laranja');
        expect(relayFaseLabel('pr', 'pronto')).toBe('pr:verde');
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
    it('o Kernel entra em TODAS as fases (não só na Análise): os coders herdam o método', () => {
        const mem = 'KERNEL DO WORKSPACE: o Carlos prioriza o CRMCredito.';
        expect(promptPrincipal('analise', 's', null, mem)).toContain('CRMCredito');
        expect(promptPrincipal('dev', 's', null, mem)).toContain('CRMCredito');
        expect(promptPrincipal('docs', 's', null, mem)).toContain('CRMCredito');
    });
});

describe('promptValidador', () => {
    it('o validador herda o Kernel; em fases de escrita MELHORA por cima, em auditoria DERRUBA', () => {
        const mem = 'KERNEL DO WORKSPACE: sem fachadas write-only.';
        const dev = promptValidador('dev', 's', 'o diff', mem);
        expect(dev).toContain('write-only'); // a regra da casa chega ao validador
        expect(dev).toContain('melhora'); // fase de escrita: faz o seu melhor por cima
        const aud = promptValidador('auditoria', 's', 'o output', mem);
        expect(aud).toContain('DERRUBAR'); // auditoria (read-only) continua adversarial
    });
});

describe('textoProgresso (sub-passo live)', () => {
    it('fase · ronda · provider · ação', () => {
        expect(textoProgresso('dev', 3, 'codex', 'a validar')).toBe(
            'dev · ronda 3 · codex a validar',
        );
    });
    it('sem provider (test-gate)', () => {
        expect(textoProgresso('testes', 2, null, 'a correr testes')).toBe(
            'testes · ronda 2 · a correr testes',
        );
    });
});

describe('progresso live por substep (mata o blackout)', () => {
    it('emite o sub-passo do principal e de cada validador', async () => {
        const { io, progressoTextos } = fakeIo();
        await orquestrarCruzamentoCom({
            cruzamento: 'dev',
            spec: 's',
            principal: 'claude',
            validadores: ['codex'],
            maxRondas: 1,
            io,
        });
        expect(progressoTextos).toContain('dev · ronda 1 · claude a trabalhar');
        expect(progressoTextos).toContain('dev · ronda 1 · codex a validar');
    });

    it('emite o passo de testes quando há test-gate', async () => {
        const { io, progressoTextos } = fakeIo({
            testar: vi.fn(async () => ({ ok: true, output: '' })),
        });
        await orquestrarCruzamentoCom({
            cruzamento: 'dev',
            spec: 's',
            principal: 'claude',
            validadores: ['codex'],
            maxRondas: 1,
            io,
        });
        expect(progressoTextos).toContain('dev · ronda 1 · a correr testes');
    });
});
