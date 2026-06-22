import type { SupabaseClient } from '@supabase/supabase-js';

import {
    CRUZAMENTOS,
    type Cruzamento,
    type DefinicoesServidor,
    type Provider,
} from '@/modules/definicoes/definicoes.schema';
import { correrNoRepo, type RespostaRepo } from '@/lib/providers/escrita-no-repo';
import { criarProvider } from '@/lib/providers/factory';
import {
    comentarIssue,
    criarPR,
    editarLabels,
    garantirLabels,
    ramoPrincipal,
    verIssue,
} from '@/lib/github';
import { blocoKernelCom } from '@/agent/kernel';
import { expandirHome } from '@/lib/paths';
import { atualizarRelayEstadoPorIssueCom } from '@/modules/tarefas/tarefas.service';
import { encontrarPorNomeCom } from '@/modules/projetos/projetos.service';
import { escreverNotaEmPastaCom } from '@/modules/knowledge/knowledge.service';
import { nomeCurtoDoRepo } from '@/modules/projeto-importado/projeto-importado.service';

import { construirHandoff } from './relay.handoff';
import { abrirBranch, commitPush, correrTestes, diffDoRepo, nomeBranch } from './relay.git';
import { correrPipeline, type ResultadoPipeline } from './relay.pipeline';
import { providersAtivos, resolverCruzamento } from './relay.resolver';
import { correrCruzamento, parseVeredito, type ResultadoCruzamento } from './relay.runner';

// O orchestrator: faz o GitHub ser trigger + estado do PIPELINE de cruzamentos
// (Análise→Dev→Testes→Docs) contra o working copy preparado (path das
// Definições, sem clonar por-issue). A lógica do circuito (estrela, rondas,
// kill-switch) é o miolo (#127, correrPipeline/correrCruzamento); aqui ligam-se
// os FACTOS ao GitHub: semáforo por label, handoff assinado POR SUBSTEP (não no
// fim), e — no verde — commit/push/PR. v1 SEM auto-merge: pára em 🟢 para o smoke.

export type Semaforo = 'processando' | 'bloqueado' | 'pronto';

export const SEMAFORO_LABEL: Record<Semaforo, string> = {
    processando: 'relay:🟠',
    bloqueado: 'relay:🔴',
    pronto: 'relay:🟢',
};

const RELAY_LABELS = [
    { name: SEMAFORO_LABEL.processando, color: 'f59e0b', description: 'Relay em processamento' },
    { name: SEMAFORO_LABEL.bloqueado, color: 'ef4444', description: 'Relay bloqueado' },
    { name: SEMAFORO_LABEL.pronto, color: '22c55e', description: 'Relay pronto para smoke' },
    ...CRUZAMENTOS.map((c) => ({
        name: faseLabel(c),
        color: '64748b',
        description: `Fase de retoma do relay: ${c}`,
    })),
];

const FASES_RELAY: Cruzamento[] = ['analise', 'dev', 'testes', 'docs'];

// Retoma cirúrgica: a fase onde o relay parou fica gravada numa label `relay:fase:<c>`.
// A retoma (re-disparo) lê-a e recomeça AÍ — não sempre na Análise.
export function faseLabel(c: Cruzamento): string {
    return `relay:fase:${c}`;
}

/** A fase de retoma gravada nas labels da issue, ou null (recomeça do início). */
export function faseDeRetoma(labels: string[]): Cruzamento | null {
    for (const c of CRUZAMENTOS) if (labels.includes(faseLabel(c))) return c;
    return null;
}

/** O goal destilado pela Análise, extraído do último handoff "principal · Análise"
 *  da issue — para a retoma cirúrgica não redestilar (a estrela já tem fonte). */
export function goalDaAnalise(comentarios: { corpo: string }[]): string | null {
    for (let i = comentarios.length - 1; i >= 0; i--) {
        const linhas = comentarios[i].corpo.split(/\r?\n/);
        if (/^—.*·\s*principal\s*·\s*Análise\s*·/.test(linhas[0] ?? '')) {
            return linhas.slice(1).join('\n').trim() || null;
        }
    }
    return null;
}

// Que cruzamentos ESCREVEM no repo (principal em modo escrita). Análise e
// Auditoria são read-only (produzem texto: o goal e o parecer).
const ESCREVE: Record<Cruzamento, boolean> = {
    analise: false,
    dev: true,
    testes: true,
    docs: true,
    auditoria: false,
};

const INTRO: Record<Cruzamento, string> = {
    analise:
        'És o ANALISTA. Lê o repo (docs/, README) e destila o GOAL desta tarefa num plano claro ' +
        'e verificável (o que muda, onde, como se confirma). NÃO escreves código.',
    dev:
        'És o PROGRAMADOR. Segue TDD à risca: primeiro os testes que falham, depois o código até ' +
        'TODOS passarem. Mexes só no âmbito da spec. NÃO corras git (o orchestrator faz o commit).',
    testes:
        'És a VERIFICAÇÃO de regressão/integração (não é o TDD do Dev nem a auditoria de segurança). ' +
        'Confirma que o que entrou no Dev RESPEITA o goal da Análise, e verifica que não partiu ' +
        'OUTRAS partes da app. Corre os testes, reforça a cobertura onde há buracos e corrige ' +
        'regressões reais — sem alargar o âmbito.',
    docs:
        'És o DOCUMENTADOR. Atualiza a documentação (docs/, README) para refletir a mudança. ' +
        'Escreve só o necessário, na língua e no estilo da casa.',
    auditoria:
        'És o AUDITOR de segurança e qualidade. Revê o que foi feito vs a spec e aponta riscos ' +
        'REAIS (bugs, fugas, âmbito). NÃO escreves código.',
};

export function promptPrincipal(
    cruzamento: Cruzamento,
    spec: string,
    feedback: string | null,
    memoria = '',
): string {
    // O Kernel do workspace (identidade, prioridades e REGRAS/método da casa) entra
    // em TODAS as fases — não só a Análise destila com contexto. O programador, o de
    // testes, o de docs e o auditor herdam o MÉTODO (cirúrgico, sem fachadas, docs
    // antes de código, verificar). É o que faz o relay trabalhar "como nós", não
    // coders genéricos — o vault é o protótipo, o relay produtiza-o (recursive-construction).
    const mem = memoria.trim() ? `${memoria.trim()}\n\n` : '';
    const base = `${mem}${INTRO[cruzamento]}\nTrabalhas em português de Portugal.\n\nSpec/goal:\n${spec}`;
    if (!feedback) return base;
    return `${base}\n\nA ronda anterior recebeu esta objeção/sugestão — integra-a:\n${feedback}`;
}

export function promptValidador(
    cruzamento: Cruzamento,
    spec: string,
    referencia: string,
    memoria = '',
): string {
    const rotulo = ESCREVE[cruzamento] ? 'Diff' : 'Output';
    // O validador também herda o Kernel: julga contra as REGRAS da casa (é cirúrgico?
    // respeita a spec? sem fachadas write-only?), não só contra a spec nua.
    const mem = memoria.trim() ? `${memoria.trim()}\n\n` : '';
    const cabeca =
        `${mem}És o VALIDADOR (linhagem diferente do principal). Trabalhas em português de Portugal.\n\n` +
        `Spec:\n${spec}\n\n${rotulo}:\n${referencia}\n\n`;
    // Análise é GERATIVA (sugere a próxima melhoria até estabilizar); os de
    // execução são ADVERSARIAIS (tentam derrubar). parseVeredito só passa em APROVADO.
    if (cruzamento === 'analise') {
        return (
            cabeca +
            'Sugere a PRÓXIMA melhoria concreta do plano. Se ainda há algo a afinar, responde ' +
            '"REJEITADO: <a melhoria>". Quando estiver estável (nada a acrescentar), "APROVADO".'
        );
    }
    return (
        cabeca +
        'A tua função é tentar DERRUBAR. Se encontrares um problema REAL, responde ' +
        '"REJEITADO: <a objeção>". Só se não conseguires derrubar, responde "APROVADO".'
    );
}

// IO injetada: tudo o que toca o mundo (GitHub, git, os CLIs agênticos). O teste
// passa fakes e verifica a LÓGICA (handoff por substep, PR no verde, 🔴 no kill).
export interface IoOrquestrador {
    comentar(body: string): Promise<void>;
    moverSemaforo(de: Semaforo | null, para: Semaforo): Promise<void>;
    // retoma=true continua o branch existente (não reseta — preserva o trabalho).
    abrirBranch(branch: string, retoma: boolean): Promise<void>;
    diff(): Promise<string>;
    commitPush(branch: string, mensagem: string): Promise<void>;
    criarPR(p: { head: string; title: string; body: string }): Promise<string>;
    // Corre o provider DENTRO do repo (escrever=true principal, false validador).
    correr(provider: Provider, prompt: string, escrever: boolean): Promise<RespostaRepo>;
    // Test-gate opcional: corre a suite do repo (vermelho = devolve ao principal
    // antes de gastar o validador). Ausente = sem gate (só validação por LLM).
    testar?(): Promise<{ ok: boolean; output: string }>;
    // Grava/limpa a fase de retoma (label `relay:fase:<c>`); null = limpa. Opcional.
    marcarRetoma?(cruzamento: Cruzamento | null): Promise<void>;
}

export type ResultadoOrquestracao =
    | { estado: 'pr-aberto'; prUrl: string }
    | { estado: 'pronto' } // verde mas sem alterações de código (sem PR)
    | { estado: 'bloqueado'; cruzamento: Cruzamento };

// Corre UM cruzamento com handoffs por substep. Reaproveita o round-loop puro do
// miolo (correrCruzamento) — aqui só se ligam os providers reais + os comentários.
export async function orquestrarCruzamentoCom(opts: {
    cruzamento: Cruzamento;
    spec: string;
    principal: Provider;
    validadores: Provider[];
    maxRondas: number;
    io: IoOrquestrador;
    memoria?: string;
}): Promise<ResultadoCruzamento> {
    const { cruzamento, spec, principal, validadores, maxRondas, io, memoria } = opts;
    const escreve = ESCREVE[cruzamento];
    let ronda = 0;

    return correrCruzamento({
        maxRondas,
        produzir: async (feedback) => {
            ronda += 1;
            const resp = await io.correr(
                principal,
                promptPrincipal(cruzamento, spec, feedback, memoria),
                escreve,
            );
            await io.comentar(
                construirHandoff({
                    fase: cruzamento,
                    papel: 'principal',
                    provider: principal,
                    ronda,
                    veredito: null,
                    porque: resp.text || '(o principal não devolveu texto; ver o diff)',
                }),
            );
            return resp.text;
        },
        validar:
            validadores.length === 0
                ? null
                : async (output) => {
                      // Test-gate (cruzamentos de escrita): a suite do repo é o juiz
                      // objetivo antes do validador-LLM. Vermelho = devolve já ao
                      // principal com o output dos testes (não gasta o validador).
                      if (escreve && io.testar) {
                          const t = await io.testar();
                          await io.comentar(
                              `— Testes · gate · ${cruzamento} · ronda ${ronda}\n\n` +
                                  (t.ok
                                      ? '✅ suite verde'
                                      : `❌ suite vermelha:\n\n\`\`\`\n${t.output}\n\`\`\``),
                          );
                          if (!t.ok) {
                              return { ok: false, feedback: `Testes vermelhos:\n${t.output}` };
                          }
                      }
                      // Execução valida o DIFF (o que se escreveu); análise/auditoria
                      // validam o OUTPUT (o texto produzido).
                      const referencia = escreve ? await io.diff() : output;
                      const vereditos = [];
                      for (const v of validadores) {
                          const resp = await io.correr(
                              v,
                              promptValidador(cruzamento, spec, referencia, memoria),
                              false,
                          );
                          const veredito = parseVeredito(resp.text);
                          await io.comentar(
                              construirHandoff({
                                  fase: cruzamento,
                                  papel: 'validador',
                                  provider: v,
                                  ronda,
                                  veredito: veredito.ok ? 'ok' : 'rejeitado',
                                  porque: resp.text,
                              }),
                          );
                          vereditos.push(veredito);
                      }
                      // Agregação any-rejeita (motor das rondas: qualquer objeção
                      // ganha uma ronda para ser resolvida — NÃO se vota a maioria,
                      // um validador a apanhar um bug real não é silenciado). Mas
                      // distingue-se o SPLIT (uns aprovam, outros objetam): um split
                      // que não converge chega ao humano rotulado "sem consenso", com
                      // os dois lados — é a adjudicação humana do kill-switch.
                      const objecoes = vereditos.filter((x) => !x.ok);
                      if (objecoes.length === 0) return { ok: true };
                      const corpo = objecoes
                          .map((o) => o.feedback)
                          .filter(Boolean)
                          .join('\n');
                      const split = objecoes.length < vereditos.length;
                      return {
                          ok: false,
                          feedback: split
                              ? `SEM CONSENSO (${vereditos.length - objecoes.length} aprovaram, ` +
                                `${objecoes.length} objetaram):\n${corpo}`
                              : corpo,
                      };
                  },
    });
}

export async function orquestrarFaseSequencialCom(opts: {
    cruzamento: Cruzamento;
    spec: string;
    providers: Provider[];
    validadores?: Provider[];
    maxRondas: number;
    io: IoOrquestrador;
    memoria?: string;
}): Promise<ResultadoCruzamento> {
    const historico: ResultadoCruzamento['historico'] = [];
    const outputs: string[] = [];
    let rondas = 0;

    if (opts.providers.length === 0) {
        throw new Error(`Sem provider capaz de executar a fase "${opts.cruzamento}".`);
    }

    for (const principal of opts.providers) {
        const validadores = (opts.validadores ?? opts.providers).filter((p) => p !== principal);
        const r = await orquestrarCruzamentoCom({
            cruzamento: opts.cruzamento,
            spec: opts.spec,
            principal,
            validadores,
            maxRondas: opts.maxRondas,
            io: opts.io,
            memoria: opts.memoria,
        });
        rondas += r.rondas;
        historico.push(...r.historico);
        outputs.push(`## ${principal}\n\n${r.output}`);
        if (!r.validado) {
            return {
                output: outputs.join('\n\n---\n\n'),
                rondas,
                validado: false,
                historico,
            };
        }
    }

    return {
        output: outputs.join('\n\n---\n\n'),
        rondas,
        validado: true,
        historico,
    };
}

function podeEscreverNoRepo(provider: Provider, defs: DefinicoesServidor): boolean {
    const cfg = defs.agentes[provider];
    return (
        cfg?.ativo === true && cfg.modo === 'cli' && (provider === 'claude' || provider === 'codex')
    );
}

function providersPrincipaisDaFase(defs: DefinicoesServidor, cruzamento: Cruzamento): Provider[] {
    const ativos = providersAtivos(defs).map((p) => p.provider);
    if (!ESCREVE[cruzamento]) return ativos;
    return ativos.filter((p) => podeEscreverNoRepo(p, defs));
}

// Garante que só as fases canónicas do relay real correm. Config antiga de
// cruzamentos fica fora daqui; o executor roda os providers ativos nas fases
// canónicas e estes valores só mantêm o pipeline compatível.
export function normalizarDefsRelay(defs: DefinicoesServidor): DefinicoesServidor {
    const ativos = providersAtivos(defs).map((p) => p.provider);
    if (ativos.length === 0) return defs;
    const [principal, ...resto] = ativos;
    const cruzamentos: DefinicoesServidor['cruzamentos'] = {};
    for (const fase of FASES_RELAY) {
        cruzamentos[fase] = { principal, validadores: resto };
    }
    return { ...defs, cruzamentos };
}

export async function orquestrarCom(opts: {
    issue: number;
    defs: DefinicoesServidor;
    spec: string;
    io: IoOrquestrador;
    maxRondas?: number;
    memoria?: string; // memória do SaaS (Kernel) para a Análise
    // Retoma cirúrgica: recomeça nesta fase com a Análise já produzida.
    desde?: Cruzamento;
    analiseInicial?: string;
    // Injetável p/ teste: corre 1 cruzamento (default = o real, com handoffs).
    executarCruzamento?: (cruzamento: Cruzamento, spec: string) => Promise<ResultadoCruzamento>;
}): Promise<ResultadoOrquestracao> {
    const { issue, defs, spec, io, memoria, desde, analiseInicial } = opts;
    const maxRondas = opts.maxRondas ?? 3;
    const branch = nomeBranch(issue);

    const executar =
        opts.executarCruzamento ??
        ((cruzamento: Cruzamento, specCruzamento: string) => {
            const ativos = providersAtivos(defs).map((p) => p.provider);
            if (ativos.length > 0 && FASES_RELAY.includes(cruzamento)) {
                return orquestrarFaseSequencialCom({
                    cruzamento,
                    spec: specCruzamento,
                    providers: providersPrincipaisDaFase(defs, cruzamento),
                    validadores: ativos,
                    maxRondas,
                    io,
                    memoria,
                });
            }
            const r = resolverCruzamento(defs, cruzamento);
            return orquestrarCruzamentoCom({
                cruzamento,
                spec: specCruzamento,
                principal: r.principal.provider,
                validadores: r.validadores.map((v) => v.provider),
                maxRondas,
                io,
                memoria,
            });
        });

    await io.moverSemaforo(null, 'processando');
    // Retoma (desde definido) continua o branch; senão abre fresh do ramo default.
    await io.abrirBranch(branch, desde !== undefined);

    // O miolo trata da estrela (execução lê a Análise) + do kill-switch (pára no
    // primeiro cruzamento que não valida). desde/analiseInicial = retoma cirúrgica.
    const pipeline: ResultadoPipeline = await correrPipeline({
        defs,
        spec,
        executar,
        desde,
        analiseInicial,
    });

    if (!pipeline.completo) {
        const cruzamento = pipeline.ordem.at(-1) ?? 'analise';
        const ultimo = pipeline.porCruzamento[cruzamento];
        await io.moverSemaforo('processando', 'bloqueado');
        // Grava a fase: a retoma recomeça AQUI, não na Análise.
        await io.marcarRetoma?.(cruzamento);
        await io.comentar(
            `🔴 Bloqueado no cruzamento "${cruzamento}" (não convergiu em ${ultimo?.rondas ?? '?'} ronda(s)).\n\n` +
                `Última objeção:\n${ultimo?.historico.at(-1)?.veredito?.feedback ?? '—'}\n\n` +
                'Comenta a correção e re-arrasta para o relay retomar (recomeça nesta fase).',
        );
        return { estado: 'bloqueado', cruzamento };
    }

    // Convergiu: limpa a marca de retoma (a próxima corre do início).
    await io.marcarRetoma?.(null);

    // Verde. Há código para PR? (análise/auditoria-só não mexem em ficheiros.)
    const mudou = (await io.diff()).trim() !== '';
    if (mudou) {
        await io.commitPush(branch, `feat: resolve #${issue} (relay)`);
        const prUrl = await io.criarPR({
            head: branch,
            title: `Relay: #${issue}`,
            body:
                `Pipeline do relay (${pipeline.ordem.join(' → ')}). ` +
                `O trace por substep está nos comentários da issue.\n\nCloses #${issue}`,
        });
        await io.moverSemaforo('processando', 'pronto');
        await io.comentar(
            `🟢 Pronto para smoke — PR: ${prUrl}\n\n` +
                'v1 sem auto-merge: revê, faz o smoke e fazes tu o merge.',
        );
        return { estado: 'pr-aberto', prUrl };
    }

    await io.moverSemaforo('processando', 'pronto');
    await io.comentar('🟢 Pipeline concluído sem alterações de código (nada para PR).');
    return { estado: 'pronto' };
}

// Constrói a IO real ligada a GitHub/git/CLIs para um (repo, issue). Separada do
// fluxo para o entrypoint e os jobs reusarem.
export function construirIo(opts: {
    token: string;
    repo: string;
    issue: number;
    cwd: string;
    base: string;
    defs: DefinicoesServidor;
    db?: SupabaseClient; // p/ a vista kanban seguir o semáforo (best-effort)
}): IoOrquestrador {
    const { token, repo, issue, cwd, base, defs, db } = opts;
    return {
        comentar: (body) => comentarIssue(token, { repo, number: issue, body }).then(() => {}),
        moverSemaforo: async (_de, para) => {
            await editarLabels(token, {
                repo,
                number: issue,
                add: [SEMAFORO_LABEL[para]],
                remove: Object.values(SEMAFORO_LABEL).filter(
                    (label) => label !== SEMAFORO_LABEL[para],
                ),
            });
            // A vista kanban segue as labels: espelha o semáforo no cartão ligado.
            if (db) await atualizarRelayEstadoPorIssueCom(db, repo, issue, para);
        },
        abrirBranch: (branch, retoma) => abrirBranch(cwd, branch, base, token, retoma),
        diff: () => diffDoRepo(cwd),
        testar: () => correrTestes(cwd),
        marcarRetoma: async (cruzamento) => {
            const manter = cruzamento ? faseLabel(cruzamento) : null;
            try {
                await editarLabels(token, {
                    repo,
                    number: issue,
                    add: manter ? [manter] : [],
                    remove: CRUZAMENTOS.map(faseLabel).filter((l) => l !== manter),
                });
            } catch (e) {
                console.error('marcar fase de retoma falhou (segue):', e);
            }
        },
        commitPush: (branch, mensagem) => commitPush(cwd, branch, mensagem, token),
        criarPR: (p) => criarPR(token, { repo, base, head: p.head, title: p.title, body: p.body }),
        correr: async (provider, prompt, escrever) => {
            const c = defs.agentes[provider];
            if (!c) throw new Error(`provider "${provider}" sem config (Definições > Agentes).`);
            if (escrever) return correrNoRepo(provider, c, prompt, cwd, { escrever });
            try {
                return await correrNoRepo(provider, c, prompt, cwd, { escrever });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (!/modo cli|ainda não escreve/.test(msg)) throw e;
                const r = await criarProvider(provider, c).gerar(prompt);
                return {
                    text: r.text,
                    costUsd: r.costUsd ?? 0,
                    costIsEstimate: r.costUsd === null,
                    model: r.model,
                };
            }
        },
    };
}

// Entrypoint real (server): lê as definições, resolve o repo+path preparado, lê a
// issue (com comentários, para a retoma pós-🔴 reler a correção humana) e corre o
// pipeline. É o que torna o orchestrator usável (consome a escrita-agêntica + as
// ops GitHub — não fica solto).
export async function orquestrar(opts: {
    db: SupabaseClient;
    defs: DefinicoesServidor;
    repo: string;
    issue: number;
    maxRondas?: number;
}): Promise<ResultadoOrquestracao> {
    const { db, defs, repo, issue } = opts;
    const token = defs.githubToken;
    if (!token) throw new Error('Sem token GitHub (Definições > módulo GitHub).');

    const ligado = defs.githubRepos.find((r) => r.repo === repo);
    if (!ligado?.path) {
        throw new Error(
            `Repo "${repo}" sem path local — define-o e corre o Testar nas Definições.`,
        );
    }
    const cwd = expandirHome(ligado.path);

    // O ramo default REAL (não assumir "main": o próprio mem-vector está em "master").
    const base = await ramoPrincipal(token, repo);

    const issueDados = await verIssue(token, { repo, number: issue });
    const spec = montarSpec(issueDados);
    // A Análise entra com a memória do SaaS (Kernel do utilizador); não-fatal.
    const memoria = await blocoKernelCom(db);

    // Repos recém-ligados podem não ter as labels do relay; garantir antes do 1.º semáforo.
    await garantirLabels(token, repo, RELAY_LABELS);

    // Retoma cirúrgica: se a issue tem uma fase gravada (parou aí antes), recomeça
    // nela com o goal da Análise já produzido — desde que esse goal exista nos
    // comentários; senão recomeça do início (fallback seguro).
    const fase = faseDeRetoma(issueDados.labels);
    const goal = fase && fase !== 'analise' ? goalDaAnalise(issueDados.comentarios) : null;
    const desde = fase && (fase === 'analise' || goal) ? fase : undefined;

    // Normaliza (preenche as fases canónicas que faltam) para o pipeline as correr.
    const defsRelay = normalizarDefsRelay(defs);
    const io = construirIo({ token, repo, issue, cwd, base, defs: defsRelay, db });
    const resultado = await orquestrarCom({
        issue,
        defs: defsRelay,
        spec,
        io,
        // O máximo de rondas vem das Definições (configurável); fallback 3.
        maxRondas: opts.maxRondas ?? defs.maxRondas,
        memoria,
        desde,
        analiseInicial: goal ?? undefined,
    });

    // Fecha o loop de volta no SaaS (passo 5): regista o que o relay produziu no
    // projeto (nota vectorizada), não só nos docs/ do repo. Best-effort.
    if (resultado.estado === 'pr-aberto') {
        await registarNoSaasCom(db, repo, issue, issueDados.title, resultado.prUrl);
    }
    return resultado;
}

// Docs de volta no SaaS: uma nota no projeto (pasta real) com o que o relay
// entregou — entra no RAG e nos wikilinks como as outras. Não-fatal.
async function registarNoSaasCom(
    db: SupabaseClient,
    repo: string,
    issue: number,
    titulo: string,
    prUrl: string,
): Promise<void> {
    try {
        // Só escreve no projeto JÁ existente (criado no import); um relay em
        // background não deve criar projetos às escondidas (achado do Audit).
        const projeto = await encontrarPorNomeCom(db, nomeCurtoDoRepo(repo));
        if (!projeto?.folderId) return;
        const title = `Relay #${issue} — ${titulo}`.slice(0, 200);
        const content_md = [
            `# ${title}`,
            '',
            `- **Issue:** \`${repo}\` #${issue}`,
            `- **PR:** ${prUrl}`,
            '',
            'Entregue pelo relay (pipeline Análise→Dev→Testes→Docs). O trace por substep está ' +
                'nos comentários da issue; o PR aguarda smoke e merge.',
        ].join('\n');
        await escreverNotaEmPastaCom(
            db,
            {
                title,
                content_md,
                summary: `Relay entregou ${repo} #${issue} (PR aberto).`,
                links: [],
                reason: 'docs de volta do relay',
            },
            projeto.folderId,
            'agent',
        );
    } catch (e) {
        console.error('registar relay no SaaS falhou (segue):', e);
    }
}

// O goal = título + corpo + as correções HUMANAS (comentários que não são
// handoffs do relay). É a retoma: depois de um 🔴, o humano comenta e re-arrasta;
// o pipeline relê e integra a correção (v1 retoma na Análise — o miolo é a estrela).
export function montarSpec(issue: {
    title: string;
    body: string;
    comentarios?: { autor: string; corpo: string }[];
}): string {
    const base = `${issue.title}\n\n${issue.body}`.trim();
    const humanos = (issue.comentarios ?? [])
        .map((c) => c.corpo.trim())
        .filter((c) => c && !c.startsWith('—') && !/^[🔴🟠🟢]/.test(c));
    if (humanos.length === 0) return base;
    return `${base}\n\n--- Correções / contexto (comentários humanos) ---\n${humanos.join('\n\n')}`;
}
