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
import { blocoKernelRelayCom } from '@/agent/kernel';
import { expandirHome } from '@/lib/paths';
import { atualizarRelayPorIssueCom } from '@/modules/tarefas/tarefas.service';
import type { EstadoTarefa } from '@/modules/tarefas/tarefas.schema';
import { encontrarPorNomeCom } from '@/modules/projetos/projetos.service';
import { escreverNotaEmPastaCom } from '@/modules/knowledge/knowledge.service';
import { nomeCurtoDoRepo } from '@/modules/projeto-importado/projeto-importado.service';

import { construirHandoff, construirSteeringHandoff } from './relay.handoff';
import { registarEventoRelayCom, resumoEvento, type EventoRelayBase } from './relay.eventos';
import { ownerIdCom } from './relay.owner';
import { lerSteeringParaConsumoCom, marcarSteeringConsumidoCom } from './relay.steering';
import {
    arquivosAlterados,
    commitPush,
    correrTestes,
    diffDoRepo,
    nomeBranch,
    prepararWorktree,
    removerWorktree,
    worktreeDir,
} from './relay.git';
import { correrPipeline, type ResultadoPipeline } from './relay.pipeline';
import { providersAtivos, resolverCruzamento } from './relay.resolver';
import { correrCruzamento, parseVeredito, type ResultadoCruzamento } from './relay.runner';
import { registarRunRelayCom } from './relay.runs';

// O orchestrator: faz o GitHub ser trigger + estado do PIPELINE de cruzamentos
// (Análise→Dev→Testes→Docs) contra o working copy preparado (path das
// Definições, sem clonar por-issue). A lógica do circuito (estrela, rondas,
// kill-switch) é o miolo (#127, correrPipeline/correrCruzamento); aqui ligam-se
// os FACTOS ao GitHub: semáforo por label, handoff assinado POR SUBSTEP (não no
// fim), e — no verde — commit/push/PR. v1 SEM auto-merge: pára em 🟢 para o smoke.

export type Semaforo = 'processando' | 'bloqueado' | 'pronto';
export type RelayFase = Cruzamento | 'pr' | 'erro';

const SEMAFORO_COR: Record<Semaforo, { nome: string; hex: string }> = {
    processando: { nome: 'laranja', hex: 'f59e0b' },
    bloqueado: { nome: 'vermelho', hex: 'ef4444' },
    pronto: { nome: 'verde', hex: '22c55e' },
};

const TODAS_FASES_LABEL: RelayFase[] = [...CRUZAMENTOS, 'pr', 'erro'];
const LABELS_RELAY_ATIVAS = TODAS_FASES_LABEL.flatMap((fase) =>
    (Object.keys(SEMAFORO_COR) as Semaforo[]).map((semaforo) => relayFaseLabel(fase, semaforo)),
);

const RELAY_LABELS = [
    ...TODAS_FASES_LABEL.flatMap((fase) =>
        (Object.keys(SEMAFORO_COR) as Semaforo[]).map((semaforo) => ({
            name: relayFaseLabel(fase, semaforo),
            color: SEMAFORO_COR[semaforo].hex,
            description: `Relay ${fase}: ${SEMAFORO_COR[semaforo].nome}`,
        })),
    ),
];

export const LABELS_RELAY_REMOVER = [...LABELS_RELAY_ATIVAS];

const FASES_RELAY: Cruzamento[] = ['analise', 'dev', 'testes', 'docs'];

export function relayFaseLabel(fase: RelayFase, semaforo: Semaforo): string {
    return `${fase}:${SEMAFORO_COR[semaforo].nome}`;
}

/** A fase de retoma gravada nas labels da issue, ou null (recomeça do início). */
export function faseDeRetoma(labels: string[]): Cruzamento | null {
    for (const label of labels) {
        const m = /^([^:]+):(laranja|vermelho|verde)$/.exec(label);
        if (m && (CRUZAMENTOS as readonly string[]).includes(m[1])) return m[1] as Cruzamento;
    }
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
    steering: string[] = [],
): string {
    // O Kernel do workspace (identidade, prioridades e REGRAS/método da casa) entra
    // em TODAS as fases — não só a Análise destila com contexto. O programador, o de
    // testes, o de docs e o auditor herdam o MÉTODO (cirúrgico, sem fachadas, docs
    // antes de código, verificar). É o que faz o relay trabalhar "como nós", não
    // coders genéricos — o vault é o protótipo, o relay produtiza-o (recursive-construction).
    const mem = memoria.trim() ? `${memoria.trim()}\n\n` : '';
    let base = `${mem}${INTRO[cruzamento]}\nTrabalhas em português de Portugal.\n\nSpec/goal:\n${spec}`;
    // Steering a quente (#129): o humano guiou a corrida A MEIO — a orientação dele
    // manda (é a adjudicação humana sem esperar pelo kill-switch).
    if (steering.length > 0) {
        base +=
            `\n\nORIENTAÇÃO HUMANA recebida a meio da corrida — segue-a com prioridade sobre o resto:\n` +
            steering.map((s) => `- ${s}`).join('\n');
    }
    if (!feedback) return base;
    return `${base}\n\nA ronda anterior recebeu esta objeção/sugestão — integra-a:\n${feedback}`;
}

export function promptValidador(
    cruzamento: Cruzamento,
    spec: string,
    referencia: string,
    memoria = '',
): string {
    const escreve = ESCREVE[cruzamento];
    const rotulo = escreve ? 'Diff' : 'Output';
    // O validador também herda o Kernel: julga contra as REGRAS da casa (é cirúrgico?
    // respeita a spec? sem fachadas write-only?), não só contra a spec nua.
    const mem = memoria.trim() ? `${memoria.trim()}\n\n` : '';
    const cabeca =
        `${mem}És o VALIDADOR (linhagem diferente do principal). Trabalhas em português de Portugal.\n\n` +
        `Spec:\n${spec}\n\n${rotulo}:\n${referencia}\n\n`;
    // Análise é GERATIVA (sugere a próxima melhoria até estabilizar); parseVeredito
    // só passa em APROVADO.
    if (cruzamento === 'analise') {
        return (
            cabeca +
            'Sugere a PRÓXIMA melhoria concreta do plano. Se ainda há algo a afinar, responde ' +
            '"REJEITADO: <a melhoria>". Quando estiver estável (nada a acrescentar), "APROVADO".'
        );
    }
    // Fases que ESCREVEM (Dev/Testes/Docs): o validador não é leitor — faz o SEU
    // melhor e escreve POR CIMA (o relay a sério: cada corredor melhora a perna do
    // anterior, como um review que também corrige), depois dá o veredito.
    if (escreve) {
        return (
            cabeca +
            'Faz o teu MELHOR: melhora o que já está no diff POR CIMA (não recomeces do zero) — ' +
            'corrige o que está mal, reforça o que falta, mantém-te cirúrgico e no âmbito da spec. ' +
            'Depois dá o veredito: "APROVADO" se concordas que está pronto (nada a mudar), ou ' +
            '"REJEITADO: <o que ainda falta>".'
        );
    }
    // Auditoria (read-only): adversarial — tenta DERRUBAR, não escreve.
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
    // Sub-passo LIVE (ronda/provider/ação) para a vista do kanban não ficar no
    // escuro entre transições de fase. Best-effort, efémero. Opcional (testes).
    progresso?(texto: string): Promise<void>;
    moverSemaforo(de: Semaforo | null, para: Semaforo): Promise<void>;
    atualizarProgresso?(
        fase: RelayFase,
        semaforo: Semaforo,
        campos?: { prUrl?: string | null; relayProgresso?: string | null },
    ): Promise<void>;
    // retoma=true continua o branch existente (não reseta — preserva o trabalho).
    abrirBranch(branch: string, retoma: boolean): Promise<void>;
    diff(): Promise<string>;
    commitPush(branch: string, mensagem: string): Promise<void>;
    criarPR(p: { head: string; title: string; body: string }): Promise<string>;
    // Corre o provider DENTRO do repo; escrever=true permite editar, false revê
    // read-only. onPasso narra o que o CLI faz DENTRO do spawn ("a ler o código",
    // "a escrever código"…) — mata o blackout de minutos por passo (#129 ronda 2).
    correr(
        provider: Provider,
        prompt: string,
        escrever: boolean,
        onPasso?: (acao: string) => void,
    ): Promise<RespostaRepo>;
    // Event-stream da corrida (#129): cada passo gravado no momento. Best-effort,
    // opcional (testes) — a corrida nunca cai por causa da observabilidade.
    evento?(e: EventoRelayBase): Promise<void>;
    // Steering a quente (#129) em DOIS tempos: lê as orientações pendentes antes
    // de produzir; marca-as consumidas só DEPOIS do provider correr com elas
    // (marcar à cabeça perdia a orientação se o passo falhasse a seguir).
    lerSteering?(): Promise<{ id: string; texto: string }[]>;
    marcarSteering?(ids: string[], fase: Cruzamento, ronda: number): Promise<void>;
    // Test-gate opcional: corre a suite do repo depois dos substeps de escrita.
    // Vermelho devolve o output ao principal na ronda seguinte.
    testar?(): Promise<{ ok: boolean; output: string }>;
    // Grava/limpa a fase de retoma no SaaS; a label ativa já transporta a fase.
    marcarRetoma?(cruzamento: Cruzamento | null): Promise<void>;
}

export type ResultadoOrquestracao =
    | { estado: 'pr-aberto'; prUrl: string }
    | { estado: 'pronto' } // verde mas sem alterações de código (sem PR)
    | { estado: 'bloqueado'; cruzamento: Cruzamento };

function estadoKanbanDaFase(fase: RelayFase): Exclude<EstadoTarefa, 'terminado'> | null {
    if (fase === 'analise') return 'analise';
    if (fase === 'dev') return 'desenvolvimento';
    if (fase === 'testes') return 'testes';
    if (fase === 'docs' || fase === 'auditoria' || fase === 'pr') return 'documentacao';
    return null;
}

async function atualizarProgressoRelay(
    io: IoOrquestrador,
    fase: RelayFase,
    semaforo: Semaforo,
    campos: { prUrl?: string | null } = {},
): Promise<void> {
    if (io.atualizarProgresso) {
        await io.atualizarProgresso(fase, semaforo, { ...campos, relayProgresso: null });
        return;
    }
    await io.moverSemaforo(null, semaforo);
}

// O texto do sub-passo live (kanban): fase · ronda · quem · ação. Curto, para o
// cartão; o trace completo continua nos comentários da issue.
export function textoProgresso(
    cruzamento: Cruzamento,
    ronda: number,
    provider: Provider | null,
    acao: string,
): string {
    const quem = provider ? `${provider} ` : '';
    return `${cruzamento} · ronda ${ronda} · ${quem}${acao}`;
}

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
    // Quem PODE escrever no repo (repo-writers). O validador só escreve a sua
    // melhoria se estiver aqui; os restantes (ex.: api) revêem read-only. undefined
    // = sem restrição (todos os validadores escrevem nas fases de escrita).
    escritores?: Provider[];
}): Promise<ResultadoCruzamento> {
    const { cruzamento, spec, principal, validadores, maxRondas, io, memoria, escritores } = opts;
    const escreve = ESCREVE[cruzamento];
    let ronda = 0;

    return correrCruzamento({
        maxRondas,
        produzir: async (feedback) => {
            ronda += 1;
            // Steering a quente (#129): lê as orientações humanas pendentes e
            // injeta-as no prompt — o principal integra-as com prioridade. Só se
            // MARCAM consumidas depois do provider correr (se o passo falhar, a
            // orientação fica pendente e o retry volta a aplicá-la — nunca se perde).
            const pendentes = (await io.lerSteering?.()) ?? [];
            const steering = pendentes.map((p) => p.texto);
            await io.progresso?.(textoProgresso(cruzamento, ronda, principal, 'a trabalhar'));
            const t0 = Date.now();
            const resp = await io.correr(
                principal,
                promptPrincipal(cruzamento, spec, feedback, memoria, steering),
                escreve,
                // fire-and-forget COM catch: um soluço do Supabase a meio do spawn
                // não pode virar unhandled rejection (achado do Audit da ronda 2).
                (acao) => {
                    void io
                        .progresso?.(textoProgresso(cruzamento, ronda, principal, acao))
                        .catch(() => {});
                },
            );
            if (pendentes.length > 0) {
                await io.marcarSteering?.(
                    pendentes.map((p) => p.id),
                    cruzamento,
                    ronda,
                );
                // Aplicada → fica assinada na issue (auditável) e na timeline.
                for (const s of steering) {
                    await io.evento?.({
                        tipo: 'steering',
                        fase: cruzamento,
                        ronda,
                        detalhe: resumoEvento(s),
                    });
                    await io.comentar(construirSteeringHandoff(cruzamento, ronda, s));
                }
            }
            await io.evento?.({
                tipo: 'passo',
                fase: cruzamento,
                ronda,
                provider: principal,
                papel: 'principal',
                detalhe: resumoEvento(resp.text || '(sem texto; ver o diff)'),
                modelo: resp.model ?? null,
                custoUsd: resp.costUsd,
                custoEstimado: resp.costIsEstimate,
                duracaoMs: Date.now() - t0,
            });
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
            validadores.length === 0 && !(escreve && io.testar)
                ? null
                : async (output) => {
                      // RELAY a sério: cada validador NÃO é leitor — faz o seu melhor e
                      // ESCREVE por cima (nas fases de escrita; em Auditoria fica read-only),
                      // lendo o diff já COM as melhorias do anterior. Como o Codex que não
                      // diz só "está bom" — melhora o código por cima. Depois dá o veredito.
                      const vereditos = [];
                      for (const v of validadores) {
                          // Execução valida o DIFF acumulado (fresco por validador, para
                          // cada um construir sobre o anterior); auditoria valida o OUTPUT.
                          const referencia = escreve ? await io.diff() : output;
                          // Escreve a melhoria SE for repo-writer; senão revê read-only.
                          const escreverV = escreve && (escritores ? escritores.includes(v) : true);
                          await io.progresso?.(textoProgresso(cruzamento, ronda, v, 'a validar'));
                          const t0 = Date.now();
                          const resp = await io.correr(
                              v,
                              promptValidador(cruzamento, spec, referencia, memoria),
                              escreverV,
                              (acao) => {
                                  void io
                                      .progresso?.(textoProgresso(cruzamento, ronda, v, acao))
                                      .catch(() => {});
                              },
                          );
                          const veredito = parseVeredito(resp.text);
                          await io.evento?.({
                              tipo: 'passo',
                              fase: cruzamento,
                              ronda,
                              provider: v,
                              papel: 'validador',
                              veredito: veredito.ok ? 'ok' : 'rejeitado',
                              detalhe: resumoEvento(resp.text),
                              modelo: resp.model ?? null,
                              custoUsd: resp.costUsd,
                              custoEstimado: resp.costIsEstimate,
                              duracaoMs: Date.now() - t0,
                          });
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
                      // Test-gate DEPOIS de todos escreverem: a suite é o juiz objetivo do
                      // trabalho ACUMULADO (principal + melhorias dos validadores). Vermelho
                      // = mais uma ronda com o output dos testes, não se finge verde.
                      if (escreve && io.testar) {
                          await io.progresso?.(
                              textoProgresso(cruzamento, ronda, null, 'a correr testes'),
                          );
                          const t0 = Date.now();
                          const t = await io.testar();
                          await io.evento?.({
                              tipo: 'testes',
                              fase: cruzamento,
                              ronda,
                              veredito: t.ok ? 'ok' : 'rejeitado',
                              detalhe: t.ok
                                  ? 'suite verde'
                                  : resumoEvento(`suite vermelha: ${t.output}`),
                              duracaoMs: Date.now() - t0,
                          });
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
                      // Convergência = CONCORDAREM (todos aprovam, zero objeções).
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
    escritores?: Provider[]; // repo-writers: validador só escreve se estiver aqui
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
            escritores: opts.escritores ?? opts.providers,
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
                stall: r.stall,
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

function providersEscritoresDaFase(defs: DefinicoesServidor, cruzamento: Cruzamento): Provider[] {
    const ativos = providersAtivos(defs).map((p) => p.provider);
    if (!ESCREVE[cruzamento]) return ativos;
    return ativos.filter((p) => podeEscreverNoRepo(p, defs));
}

function unicosProviders(providers: Provider[]): Provider[] {
    return providers.filter((p, i) => providers.indexOf(p) === i);
}

function resolverCruzamentoParaExecucao(
    defs: DefinicoesServidor,
    cruzamento: Cruzamento,
): { principal: Provider; validadores: Provider[]; escritores: Provider[] } {
    const r = resolverCruzamento(defs, cruzamento);
    const principal = r.principal.provider;
    const validadores = r.validadores.map((v) => v.provider);
    const escritores = providersEscritoresDaFase(defs, cruzamento);

    if (!ESCREVE[cruzamento] || escritores.includes(principal)) {
        return { principal, validadores, escritores };
    }

    // Override defensivo: um principal api não consegue escrever uma fase de código.
    // Promove-se o primeiro validador repo-writer declarado; o principal original
    // continua no painel read-only.
    const fallback = validadores.find((p) => escritores.includes(p));
    if (!fallback) {
        throw new Error(
            `A fase "${cruzamento}" escreve no repo, mas a configuração declarada não inclui ` +
                'nenhum repo-writer (Claude/Codex em modo CLI).',
        );
    }
    return {
        principal: fallback,
        validadores: unicosProviders([principal, ...validadores]).filter((p) => p !== fallback),
        escritores,
    };
}

// Garante que as fases canónicas CORREM mesmo sem o user as configurar: preenche
// SÓ as que faltam com um placeholder (todos os ativos). A config que o user
// definiu fica INTACTA — é o override real, honrado pelo executor.
export function normalizarDefsRelay(defs: DefinicoesServidor): DefinicoesServidor {
    const ativos = providersAtivos(defs).map((p) => p.provider);
    if (ativos.length === 0) return defs;
    const [principal, ...resto] = ativos;
    const cruzamentos = { ...defs.cruzamentos };
    for (const fase of FASES_RELAY) {
        if (!cruzamentos[fase]) cruzamentos[fase] = { principal, validadores: resto };
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
    // Fases que o USER configurou nas Definições (override real). Numa dessas, usa-se
    // a config (1 principal); nas restantes fases canónicas, rodam todos os ativos.
    fasesConfiguradas?: Cruzamento[];
    // Injetável p/ teste: corre 1 cruzamento (default = o real, com handoffs).
    executarCruzamento?: (cruzamento: Cruzamento, spec: string) => Promise<ResultadoCruzamento>;
}): Promise<ResultadoOrquestracao> {
    const { issue, defs, spec, io, memoria, desde, analiseInicial } = opts;
    const fasesConfiguradas = opts.fasesConfiguradas ?? [];
    const maxRondas = opts.maxRondas ?? 3;
    const branch = nomeBranch(issue);

    const executarBase =
        opts.executarCruzamento ??
        ((cruzamento: Cruzamento, specCruzamento: string) => {
            // Override REAL do user: se configurou esta fase nas Definições
            // (principal + validadores), honra-a — 1 principal escolhido, não a
            // rotação. Sem config, rodam TODOS os ativos como principal (o debate).
            const override = fasesConfiguradas.includes(cruzamento);
            const ativos = providersAtivos(defs).map((p) => p.provider);
            if (!override && ativos.length > 0 && FASES_RELAY.includes(cruzamento)) {
                return orquestrarFaseSequencialCom({
                    cruzamento,
                    spec: specCruzamento,
                    providers: providersEscritoresDaFase(defs, cruzamento),
                    validadores: ativos,
                    maxRondas,
                    io,
                    memoria,
                });
            }
            const r = resolverCruzamentoParaExecucao(defs, cruzamento);
            return orquestrarCruzamentoCom({
                cruzamento,
                spec: specCruzamento,
                principal: r.principal,
                validadores: r.validadores,
                maxRondas,
                io,
                memoria,
                escritores: r.escritores,
            });
        });
    let ultimoProgresso: string | null = null;
    const marcarProgresso = async (
        fase: RelayFase,
        semaforo: Semaforo,
        campos: { prUrl?: string | null; relayProgresso?: string | null } = {},
    ) => {
        const chave = `${fase}:${semaforo}:${campos.prUrl ?? ''}`;
        if (chave === ultimoProgresso) return;
        ultimoProgresso = chave;
        await atualizarProgressoRelay(io, fase, semaforo, campos);
        await io.evento?.({ tipo: 'transicao', fase, detalhe: `${fase} · ${semaforo}` });
    };
    const executar = async (cruzamento: Cruzamento, specCruzamento: string) => {
        await marcarProgresso(cruzamento, 'processando');
        return executarBase(cruzamento, specCruzamento);
    };

    await marcarProgresso(desde ?? 'analise', 'processando');
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
        await marcarProgresso(cruzamento, 'bloqueado');
        // Grava a fase: a retoma recomeça AQUI, não na Análise.
        await io.marcarRetoma?.(cruzamento);
        const motivoParagem = ultimo?.stall
            ? `parou por repetição (stall) à ${ultimo.rondas}ª ronda — o agente repetia o output sem convergir`
            : `não convergiu em ${ultimo?.rondas ?? '?'} ronda(s)`;
        await io.comentar(
            `🔴 Bloqueado no cruzamento "${cruzamento}" (${motivoParagem}).\n\n` +
                `Última objeção:\n${ultimo?.historico.at(-1)?.veredito?.feedback ?? '—'}\n\n` +
                'Comenta a correção na issue e re-arrasta para o relay retomar nesta fase.',
        );
        await io.evento?.({
            tipo: 'fim',
            fase: cruzamento,
            detalhe: `bloqueado em ${cruzamento} — ${motivoParagem}`,
        });
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
        await marcarProgresso('pr', 'pronto', { prUrl });
        await io.comentar(
            `🟢 Pronto para smoke — PR: ${prUrl}\n\n` +
                'v1 sem auto-merge: revê, faz o smoke e fazes tu o merge.',
        );
        await io.evento?.({ tipo: 'fim', fase: 'pr', detalhe: `PR aberto: ${prUrl}` });
        return { estado: 'pr-aberto', prUrl };
    }

    await marcarProgresso((pipeline.ordem.at(-1) ?? 'analise') as RelayFase, 'pronto');
    await io.comentar('🟢 Pipeline concluído sem alterações de código (nada para PR).');
    await io.evento?.({
        tipo: 'fim',
        fase: pipeline.ordem.at(-1) ?? 'analise',
        detalhe: 'pipeline concluído sem alterações de código',
    });
    return { estado: 'pronto' };
}

// Constrói a IO real ligada a GitHub/git/CLIs para um (repo, issue). Separada do
// fluxo para o entrypoint e os jobs reusarem.
export function construirIo(opts: {
    token: string;
    repo: string;
    issue: number;
    repoPath: string; // a working-copy real do user (partilha o .git com o worktree)
    cwd: string; // o worktree isolado deste run (onde os agentes/git/testes correm)
    base: string;
    defs: DefinicoesServidor;
    db?: SupabaseClient; // p/ a vista kanban seguir o semáforo (best-effort)
    runId?: string; // correlaciona os eventos desta corrida com o run-ledger (#129)
    // Custo na FONTE (#129): chamado com cada resposta de provider — o billing
    // não depende do canal de observabilidade (eventos) para se somar.
    aoCusto?(resp: RespostaRepo): void;
}): IoOrquestrador {
    const { token, repo, issue, repoPath, cwd, base, defs, db, runId, aoCusto } = opts;
    // O owner resolve-se UMA vez por corrida (dezenas de eventos por run — não se
    // paga um getSession por cada; achado do Audit).
    let ownerPromise: Promise<string | null> | null = null;
    const owner = () => {
        if (!db) return Promise.resolve(null);
        ownerPromise ??= ownerIdCom(db);
        return ownerPromise;
    };
    const atualizarProgressoReal = async (
        fase: RelayFase,
        semaforo: Semaforo,
        campos: { prUrl?: string | null; relayProgresso?: string | null } = {},
    ) => {
        const ativa = relayFaseLabel(fase, semaforo);
        await editarLabels(token, {
            repo,
            number: issue,
            add: [ativa],
            remove: LABELS_RELAY_REMOVER.filter((label) => label !== ativa),
        });
        if (db) {
            await atualizarRelayPorIssueCom(db, repo, issue, {
                relayEstado: semaforo,
                relayFase: fase,
                relayPrUrl: campos.prUrl,
                relayProgresso: campos.relayProgresso ?? null,
                estado: estadoKanbanDaFase(fase) ?? undefined,
            });
        }
    };
    return {
        comentar: (body) => comentarIssue(token, { repo, number: issue, body }).then(() => {}),
        // Sub-passo live → só o cartão (DB), sem tocar GitHub. Bate o heartbeat
        // (atualizarRelayPorIssueCom) → o sweeper de órfãos não dá a fase longa
        // como congelada. Efémero: a vista só o mostra enquanto processa.
        progresso: async (texto) => {
            if (db) await atualizarRelayPorIssueCom(db, repo, issue, { relayProgresso: texto });
        },
        moverSemaforo: async (_de, para) => atualizarProgressoReal('erro', para),
        atualizarProgresso: atualizarProgressoReal,
        // Event-stream (#129): best-effort para a BD; a verdade auditável continua
        // nos comentários da issue. Sem db/runId (testes/headless) não grava.
        evento: async (e) => {
            if (!db || !runId) return;
            const ownerId = await owner();
            if (!ownerId) return;
            await registarEventoRelayCom(db, { ...e, runId, repo, issue }, ownerId);
        },
        lerSteering: async () => (db ? lerSteeringParaConsumoCom(db, { repo, issue }) : []),
        marcarSteering: async (ids, fase, ronda) => {
            if (db) await marcarSteeringConsumidoCom(db, { ids, fase, ronda });
        },
        abrirBranch: (branch, retoma) =>
            prepararWorktree({ repoPath, dir: cwd, branch, base, token, retoma }).then(() => {}),
        diff: () => diffDoRepo(cwd),
        testar: async () => correrTestes(cwd, await arquivosAlterados(cwd)),
        marcarRetoma: async (cruzamento) => {
            try {
                if (db) await atualizarRelayPorIssueCom(db, repo, issue, { relayFase: cruzamento });
            } catch (e) {
                console.error('marcar fase de retoma falhou (segue):', e);
            }
        },
        commitPush: (branch, mensagem) => commitPush(cwd, branch, mensagem, token),
        criarPR: (p) => criarPR(token, { repo, base, head: p.head, title: p.title, body: p.body }),
        correr: async (provider, prompt, escrever, onPasso) => {
            const resp = await correrProviderNoRepo(defs, provider, prompt, cwd, escrever, onPasso);
            aoCusto?.(resp);
            return resp;
        },
    };
}

// Corre um provider dentro do repo, com fallback read-only via factory quando o
// modo não escreve (era o inline do construirIo.correr; separado para o custo se
// medir num ponto único).
async function correrProviderNoRepo(
    defs: DefinicoesServidor,
    provider: Provider,
    prompt: string,
    cwd: string,
    escrever: boolean,
    onPasso?: (acao: string) => void,
): Promise<RespostaRepo> {
    const c = defs.agentes[provider];
    if (!c) throw new Error(`provider "${provider}" sem config (Definições > Agentes).`);
    if (escrever) return correrNoRepo(provider, c, prompt, cwd, { escrever, onPasso });
    try {
        return await correrNoRepo(provider, c, prompt, cwd, { escrever, onPasso });
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
    const inicio = new Date();
    // #129: o run_id nasce AQUI (não no fim) — os eventos da corrida penduram-se
    // nele; se o processo morrer, os eventos sobrevivem e contam a história.
    const runId = crypto.randomUUID();
    const token = defs.githubToken;
    if (!token) throw new Error('Sem token GitHub (Definições > módulo GitHub).');

    const ligado = defs.githubRepos.find((r) => r.repo === repo);
    if (!ligado?.path) {
        throw new Error(
            `Repo "${repo}" sem path local — define-o e corre o Testar nas Definições.`,
        );
    }
    const repoPath = expandirHome(ligado.path);
    // Cada run vive no SEU worktree (isolado da working-copy partilhada); o cwd de
    // tudo (agentes, git, testes) é esse dir, não o repo do user.
    const cwd = worktreeDir(repoPath, issue);

    // O ramo default REAL (não assumir "main": o próprio mem-vector está em "master").
    const base = await ramoPrincipal(token, repo);

    const issueDados = await verIssue(token, { repo, number: issue });
    const spec = montarSpec(issueDados);
    // O relay inteiro recebe o Kernel focado em método/regras; não o Kernel completo.
    const memoria = await blocoKernelRelayCom(db);

    // Repos recém-ligados podem não ter as labels do relay; garantir antes do 1.º semáforo.
    await garantirLabels(token, repo, RELAY_LABELS);

    // Retoma cirúrgica: se a issue tem uma fase gravada (parou aí antes), recomeça
    // nela com o goal da Análise já produzido — desde que esse goal exista nos
    // comentários; senão recomeça do início (fallback seguro).
    const fase = faseDeRetoma(issueDados.labels);
    const goal = fase && fase !== 'analise' ? goalDaAnalise(issueDados.comentarios) : null;
    const desde = fase && (fase === 'analise' || goal) ? fase : undefined;

    // Normaliza (preenche as fases canónicas que faltam) para o pipeline as correr;
    // as fases que o user JÁ configurou viajam como override real (fasesConfiguradas).
    const fasesConfiguradas = Object.keys(defs.cruzamentos) as Cruzamento[];
    const defsRelay = normalizarDefsRelay(defs);
    // Custo agregado da corrida (#129): somado na FONTE (cada resposta de provider,
    // via aoCusto), não reconstruído do event-stream — billing e observabilidade
    // não se acoplam (achado do Audit). `mediu` distingue "custou $0" de "não houve
    // passo nenhum" (o ledger guarda null nesse caso, não um falso $0.00).
    const custo = { total: 0, estimado: false, mediu: false };
    const io = construirIo({
        token,
        repo,
        issue,
        repoPath,
        cwd,
        base,
        defs: defsRelay,
        db,
        runId,
        aoCusto: (resp) => {
            custo.mediu = true;
            custo.total += resp.costUsd;
            if (resp.costIsEstimate) custo.estimado = true;
        },
    });
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
        fasesConfiguradas,
    });

    // Verde (PR ou nada-a-mudar): o trabalho já foi commitado+pushed → remove o
    // worktree. Bloqueado: MANTÉM-SE (a retoma reusa o dir e o trabalho não-commitado).
    if (resultado.estado !== 'bloqueado') await removerWorktree(repoPath, cwd);

    // #observability: regista o run no ledger (histórico consultável na app) — best-effort.
    // O id é o runId dos eventos (correlação) e leva o custo agregado da corrida.
    await registarRunRelayCom(db, {
        repo,
        issue,
        resultado,
        inicio,
        id: runId,
        custoUsd: custo.mediu ? custo.total : undefined,
        custoEstimado: custo.mediu ? custo.estimado : undefined,
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
