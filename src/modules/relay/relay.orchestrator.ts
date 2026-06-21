import type { SupabaseClient } from '@supabase/supabase-js';

import type {
    Cruzamento,
    DefinicoesServidor,
    Provider,
} from '@/modules/definicoes/definicoes.schema';
import { correrNoRepo, type RespostaRepo } from '@/lib/providers/escrita-no-repo';
import { comentarIssue, criarPR, editarLabels, ramoPrincipal, verIssue } from '@/lib/github';
import { blocoKernelCom } from '@/agent/kernel';
import { atualizarRelayEstadoPorIssueCom } from '@/modules/tarefas/tarefas.service';
import { encontrarPorNomeCom } from '@/modules/projetos/projetos.service';
import { escreverNotaEmPastaCom } from '@/modules/knowledge/knowledge.service';
import { nomeCurtoDoRepo } from '@/modules/projeto-importado/projeto-importado.service';

import { construirHandoff } from './relay.handoff';
import { abrirBranch, commitPush, correrTestes, diffDoRepo, nomeBranch } from './relay.git';
import { correrPipeline, type ResultadoPipeline } from './relay.pipeline';
import { resolverCruzamento } from './relay.resolver';
import { correrCruzamento, parseVeredito, type ResultadoCruzamento } from './relay.runner';

// O orchestrator: faz o GitHub ser trigger + estado do PIPELINE de cruzamentos
// (Análise→Dev→Docs→Auditoria) contra o working copy preparado (path das
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

// Que cruzamentos ESCREVEM no repo (principal em modo escrita). Análise e
// Auditoria são read-only (produzem texto: o goal e o parecer).
const ESCREVE: Record<Cruzamento, boolean> = {
    analise: false,
    dev: true,
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
    // A Análise entra com a MEMÓRIA do SaaS (Kernel do utilizador: identidade,
    // prioridades, regras) — destila o goal já com o contexto da casa, não só o repo.
    const mem = cruzamento === 'analise' && memoria.trim() ? `${memoria.trim()}\n\n` : '';
    const base = `${mem}${INTRO[cruzamento]}\nTrabalhas em português de Portugal.\n\nSpec/goal:\n${spec}`;
    if (!feedback) return base;
    return `${base}\n\nA ronda anterior recebeu esta objeção/sugestão — integra-a:\n${feedback}`;
}

export function promptValidador(cruzamento: Cruzamento, spec: string, referencia: string): string {
    const rotulo = ESCREVE[cruzamento] ? 'Diff' : 'Output';
    const cabeca =
        `És o VALIDADOR (linhagem diferente do principal). Trabalhas em português de Portugal.\n\n` +
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
    abrirBranch(branch: string): Promise<void>;
    diff(): Promise<string>;
    commitPush(branch: string, mensagem: string): Promise<void>;
    criarPR(p: { head: string; title: string; body: string }): Promise<string>;
    // Corre o provider DENTRO do repo (escrever=true principal, false validador).
    correr(provider: Provider, prompt: string, escrever: boolean): Promise<RespostaRepo>;
    // Test-gate opcional: corre a suite do repo (vermelho = devolve ao principal
    // antes de gastar o validador). Ausente = sem gate (só validação por LLM).
    testar?(): Promise<{ ok: boolean; output: string }>;
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
                              promptValidador(cruzamento, spec, referencia),
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
                      const objecoes = vereditos.filter((x) => !x.ok);
                      if (objecoes.length === 0) return { ok: true };
                      return {
                          ok: false,
                          feedback: objecoes
                              .map((o) => o.feedback)
                              .filter(Boolean)
                              .join('\n'),
                      };
                  },
    });
}

export async function orquestrarCom(opts: {
    issue: number;
    defs: DefinicoesServidor;
    spec: string;
    io: IoOrquestrador;
    maxRondas?: number;
    memoria?: string; // memória do SaaS (Kernel) para a Análise
    // Injetável p/ teste: corre 1 cruzamento (default = o real, com handoffs).
    executarCruzamento?: (cruzamento: Cruzamento, spec: string) => Promise<ResultadoCruzamento>;
}): Promise<ResultadoOrquestracao> {
    const { issue, defs, spec, io, memoria } = opts;
    const maxRondas = opts.maxRondas ?? 3;
    const branch = nomeBranch(issue);

    const executar =
        opts.executarCruzamento ??
        ((cruzamento: Cruzamento, specCruzamento: string) => {
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
    await io.abrirBranch(branch);

    // O miolo trata da estrela (execução lê a Análise) + do kill-switch (pára no
    // primeiro cruzamento que não valida).
    const pipeline: ResultadoPipeline = await correrPipeline({ defs, spec, executar });

    if (!pipeline.completo) {
        const cruzamento = pipeline.ordem.at(-1) ?? 'analise';
        const ultimo = pipeline.porCruzamento[cruzamento];
        await io.moverSemaforo('processando', 'bloqueado');
        await io.comentar(
            `🔴 Bloqueado no cruzamento "${cruzamento}" (não convergiu em ${ultimo?.rondas ?? '?'} ronda(s)).\n\n` +
                `Última objeção:\n${ultimo?.historico.at(-1)?.veredito?.feedback ?? '—'}\n\n` +
                'Comenta a correção e re-arrasta para o relay retomar (relê os comentários).',
        );
        return { estado: 'bloqueado', cruzamento };
    }

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
        moverSemaforo: async (de, para) => {
            await editarLabels(token, {
                repo,
                number: issue,
                add: [SEMAFORO_LABEL[para]],
                remove: de ? [SEMAFORO_LABEL[de]] : [],
            });
            // A vista kanban segue as labels: espelha o semáforo no cartão ligado.
            if (db) await atualizarRelayEstadoPorIssueCom(db, repo, issue, para);
        },
        abrirBranch: (branch) => abrirBranch(cwd, branch, base, token),
        diff: () => diffDoRepo(cwd),
        testar: () => correrTestes(cwd),
        commitPush: (branch, mensagem) => commitPush(cwd, branch, mensagem, token),
        criarPR: (p) => criarPR(token, { repo, base, head: p.head, title: p.title, body: p.body }),
        correr: (provider, prompt, escrever) => {
            const c = defs.agentes[provider];
            if (!c) throw new Error(`provider "${provider}" sem config (Definições > Agentes).`);
            return correrNoRepo(provider, c, prompt, cwd, { escrever });
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
    const cwd = ligado.path;

    // O ramo default REAL (não assumir "main": o próprio mem-vector está em "master").
    const base = await ramoPrincipal(token, repo);

    const issueDados = await verIssue(token, { repo, number: issue });
    const spec = montarSpec(issueDados);
    // A Análise entra com a memória do SaaS (Kernel do utilizador); não-fatal.
    const memoria = await blocoKernelCom(db);

    const io = construirIo({ token, repo, issue, cwd, base, defs, db });
    const resultado = await orquestrarCom({
        issue,
        defs,
        spec,
        io,
        maxRondas: opts.maxRondas,
        memoria,
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
            'Entregue pelo relay (pipeline Análise→Dev→Docs→Auditoria). O trace por substep está ' +
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
