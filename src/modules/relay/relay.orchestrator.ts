import type { DefinicoesServidor, Provider } from '@/modules/definicoes/definicoes.schema';
import { correrNoRepo, type RespostaRepo } from '@/lib/providers/escrita-no-repo';
import { comentarIssue, criarPR, editarLabels, ramoPrincipal, verIssue } from '@/lib/github';

import { construirHandoff } from './relay.handoff';
import { abrirBranch, commitPush, diffDoRepo, nomeBranch } from './relay.git';
import { resolverCruzamento } from './relay.resolver';
import { correrCruzamento, parseVeredito, type ResultadoCruzamento } from './relay.runner';

// O orchestrator: faz o GitHub ser trigger + estado de UM cruzamento de código
// (Development na v1). Espelha o processIssue do POC, mas config-driven e contra
// o path JÁ PREPARADO (não clona por-issue). A lógica do circuito (rondas,
// any-rejeita) é o miolo (#127); aqui ligam-se os FACTOS ao GitHub: semáforo por
// label, handoff assinado POR SUBSTEP (não no fim), e — no verde — commit/push/PR.
// v1 SEM auto-merge: pára em 🟢 pronto para o smoke do humano.

export type Semaforo = 'processando' | 'bloqueado' | 'pronto';

export const SEMAFORO_LABEL: Record<Semaforo, string> = {
    processando: 'relay:🟠',
    bloqueado: 'relay:🔴',
    pronto: 'relay:🟢',
};

// Prompts do cruzamento de código (PT-PT). Principal segue TDD à risca; validador
// tenta DERRUBAR o diff vs spec (adversarial — parseVeredito só passa em APROVADO).
export function promptDevPrincipal(spec: string, feedback: string | null): string {
    const base =
        'És o PROGRAMADOR deste cruzamento. Trabalhas em português de Portugal e segues TDD à ' +
        'risca: primeiro escreves os testes que falham, depois o código até TODOS passarem. ' +
        'Mexes só no âmbito da spec. NÃO corras git (o orchestrator trata do commit).\n\n' +
        `Spec da tarefa:\n${spec}`;
    if (!feedback) return base;
    return `${base}\n\nA ronda anterior foi reprovada. Corrige isto:\n${feedback}`;
}

export function promptDevValidador(spec: string, diff: string): string {
    return (
        'És o VALIDADOR (linhagem diferente do programador). NÃO escreves código, só avalias. ' +
        'Compara o diff com a spec. Se encontrares um problema REAL (falta, bug, foge ao âmbito), ' +
        'responde "REJEITADO: <a objeção>". Só se não conseguires derrubar, responde "APROVADO".\n\n' +
        `Spec:\n${spec}\n\nDiff:\n${diff}`
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
}

export interface ConfigDev {
    principal: Provider;
    validadores: Provider[];
    maxRondas: number;
}

export type ResultadoOrquestracao =
    | { estado: 'pr-aberto'; prUrl: string; rondas: number }
    | { estado: 'bloqueado'; rondas: number };

export async function orquestrarDevCom(opts: {
    issue: number;
    spec: string;
    cfg: ConfigDev;
    io: IoOrquestrador;
}): Promise<ResultadoOrquestracao> {
    const { issue, spec, cfg, io } = opts;
    const branch = nomeBranch(issue);

    await io.moverSemaforo(null, 'processando');
    await io.abrirBranch(branch);

    // A ronda corre no fecho: produzir (1×/ronda) incrementa-a; validar (logo a
    // seguir, mesma ronda) lê o mesmo número para a assinatura do handoff.
    let ronda = 0;

    const r: ResultadoCruzamento = await correrCruzamento({
        maxRondas: cfg.maxRondas,
        produzir: async (feedback) => {
            ronda += 1;
            const resp = await io.correr(cfg.principal, promptDevPrincipal(spec, feedback), true);
            await io.comentar(
                construirHandoff({
                    fase: 'dev',
                    papel: 'principal',
                    provider: cfg.principal,
                    ronda,
                    veredito: null,
                    porque: resp.text || '(o programador não devolveu texto; ver o diff)',
                }),
            );
            return resp.text;
        },
        validar:
            cfg.validadores.length === 0
                ? null
                : async () => {
                      const diff = await io.diff();
                      const vereditos = [];
                      for (const v of cfg.validadores) {
                          const resp = await io.correr(v, promptDevValidador(spec, diff), false);
                          const veredito = parseVeredito(resp.text);
                          await io.comentar(
                              construirHandoff({
                                  fase: 'dev',
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

    if (r.validado) {
        await io.commitPush(branch, `feat: resolve #${issue} (relay — cruzamento Development)`);
        const prUrl = await io.criarPR({
            head: branch,
            title: `Relay: #${issue}`,
            body:
                `Cruzamento Development pelo relay (${r.rondas} ronda(s)). ` +
                `O trace por substep está nos comentários da issue.\n\nCloses #${issue}`,
        });
        await io.moverSemaforo('processando', 'pronto');
        await io.comentar(
            `🟢 Pronto para smoke — PR: ${prUrl}\n\n` +
                'v1 sem auto-merge: revê, faz o smoke e fazes tu o merge.',
        );
        return { estado: 'pr-aberto', prUrl, rondas: r.rondas };
    }

    // Kill-switch: não convergiu em N rondas. Mesma porta das outras paragens —
    // pára 🔴, devolve a issue; o humano comenta e re-arrasta para retomar.
    await io.moverSemaforo('processando', 'bloqueado');
    await io.comentar(
        `🔴 Bloqueado: o cruzamento Development não convergiu em ${r.rondas} ronda(s).\n\n` +
            `Última objeção:\n${r.historico.at(-1)?.veredito?.feedback ?? '—'}\n\n` +
            'Comenta a correção e re-arrasta para o relay retomar.',
    );
    return { estado: 'bloqueado', rondas: r.rondas };
}

// Entrypoint real (server): lê as definições, resolve o repo+path preparado e os
// providers do cruzamento Dev, e liga a IO a GitHub/git/CLIs. É o que torna o
// orchestrator usável (consome a escrita-agêntica + as ops GitHub — não fica solto).
export async function orquestrarDev(opts: {
    defs: DefinicoesServidor;
    repo: string;
    issue: number;
    maxRondas?: number;
}): Promise<ResultadoOrquestracao> {
    const { defs, repo, issue } = opts;
    const token = defs.githubToken;
    if (!token) throw new Error('Sem token GitHub (Definições > módulo GitHub).');

    const ligado = defs.githubRepos.find((r) => r.repo === repo);
    if (!ligado?.path) {
        throw new Error(
            `Repo "${repo}" sem path local — define-o e corre o Testar nas Definições.`,
        );
    }
    const cwd = ligado.path;

    // Providers do cruzamento Dev (config-driven; resolverCruzamento exige ativos).
    const resolvido = resolverCruzamento(defs, 'dev');
    const cfg: ConfigDev = {
        principal: resolvido.principal.provider,
        validadores: resolvido.validadores.map((v) => v.provider),
        maxRondas: opts.maxRondas ?? 3,
    };

    // O ramo default REAL (não assumir "main": o próprio mem-vector está em "master").
    const base = await ramoPrincipal(token, repo);

    const issueDados = await verIssue(token, { repo, number: issue });
    const spec = `${issueDados.title}\n\n${issueDados.body}`.trim();

    const io: IoOrquestrador = {
        comentar: (body) => comentarIssue(token, { repo, number: issue, body }).then(() => {}),
        moverSemaforo: (de, para) =>
            editarLabels(token, {
                repo,
                number: issue,
                add: [SEMAFORO_LABEL[para]],
                remove: de ? [SEMAFORO_LABEL[de]] : [],
            }),
        abrirBranch: (branch) => abrirBranch(cwd, branch, base, token),
        diff: () => diffDoRepo(cwd),
        commitPush: (branch, mensagem) => commitPush(cwd, branch, mensagem, token),
        criarPR: (p) => criarPR(token, { repo, base, head: p.head, title: p.title, body: p.body }),
        correr: (provider, prompt, escrever) => {
            const c = defs.agentes[provider];
            if (!c) throw new Error(`provider "${provider}" sem config (Definições > Agentes).`);
            return correrNoRepo(provider, c, prompt, cwd, { escrever });
        },
    };

    return orquestrarDevCom({ issue, spec, cfg, io });
}
