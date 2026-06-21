import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// M7: transporte GitHub do agente via gh CLI (requisito declarado no README). O
// token do user vai por GH_TOKEN no env do subprocesso — sobrepõe-se ao gh auth
// do host, por isso age como a conta do user do SaaS (passa o fresh-pc-test). O
// arg-builder é puro (núcleo testável); o spawn é fino por cima.

const REPO_RE = /^[^/\s]+\/[^/\s]+$/;

// Isola o gh do config do host (hosts.yml, aliases) — espelha o CLAUDE_CONFIG_DIR
// do runner do agente (src/lib/claude.ts): a auth vem do GH_TOKEN, não do host.
const GH_CONFIG_DIR_ISOLADO = join(tmpdir(), 'memvector-gh');

/** Env do subprocesso gh: token do user + isolamento do config do host (puro/testável). */
export function buildGhEnv(
    token: string,
    base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
    return {
        ...base,
        GH_TOKEN: token,
        GH_PROMPT_DISABLED: '1',
        GH_CONFIG_DIR: GH_CONFIG_DIR_ISOLADO,
    };
}

export interface IssueRef {
    number: number;
    title: string;
    state: string;
    url: string;
}

export type GhOp =
    | { op: 'criar'; repo: string; title: string; body: string }
    | { op: 'ler'; repo: string; state?: 'open' | 'closed' | 'all'; limit?: number }
    | { op: 'comentar'; repo: string; number: number; body: string }
    | { op: 'ver'; repo: string; number: number }
    | { op: 'labels'; repo: string; number: number; add?: string[]; remove?: string[] }
    | { op: 'pr'; repo: string; base: string; head: string; title: string; body: string };

/** Args do gh para cada operação (puro — o núcleo testável). */
export function buildIssueArgs(o: GhOp): string[] {
    if (!REPO_RE.test(o.repo)) throw new Error(`repo inválido (usa owner/nome): ${o.repo}`);
    switch (o.op) {
        case 'criar':
            return ['issue', 'create', '--repo', o.repo, '--title', o.title, '--body', o.body];
        case 'ler':
            return [
                'issue',
                'list',
                '--repo',
                o.repo,
                '--state',
                o.state ?? 'open',
                '--limit',
                String(o.limit ?? 20),
                '--json',
                'number,title,state,url',
            ];
        case 'comentar':
            return ['issue', 'comment', String(o.number), '--repo', o.repo, '--body', o.body];
        case 'ver':
            return [
                'issue',
                'view',
                String(o.number),
                '--repo',
                o.repo,
                '--json',
                'title,body,comments',
            ];
        case 'labels': {
            const args = ['issue', 'edit', String(o.number), '--repo', o.repo];
            for (const l of o.add ?? []) args.push('--add-label', l);
            for (const l of o.remove ?? []) args.push('--remove-label', l);
            return args;
        }
        case 'pr':
            return [
                'pr',
                'create',
                '--repo',
                o.repo,
                '--base',
                o.base,
                '--head',
                o.head,
                '--title',
                o.title,
                '--body',
                o.body,
            ];
    }
}

/** Corre o gh com o token do user (GH_TOKEN sobrepõe o host). Stdout ou erro. */
function corrGh(args: string[], token: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const ps = spawn('gh', args, { env: buildGhEnv(token) });
        let out = '';
        let err = '';
        ps.stdout.on('data', (d) => (out += String(d)));
        ps.stderr.on('data', (d) => (err += String(d)));
        ps.on('error', (e) =>
            reject(new Error(`gh indisponível ou falhou a arrancar: ${e.message}`)),
        );
        ps.on('close', (code) => {
            if (code === 0) resolve(out.trim());
            else reject(new Error(`gh saiu com ${code}: ${err.trim() || out.trim()}`));
        });
    });
}

/** O URL github do stdout do gh (create/comment imprimem-no; defende de preâmbulos). */
export function extrairUrl(out: string): string {
    const m = out.match(/https:\/\/github\.com\/\S+/);
    return m ? m[0] : out.trim();
}

export async function criarIssue(
    token: string,
    p: { repo: string; title: string; body: string },
): Promise<string> {
    // gh imprime o URL da issue criada no stdout — extrai-o (não o resto).
    return extrairUrl(await corrGh(buildIssueArgs({ op: 'criar', ...p }), token));
}

export async function lerIssues(
    token: string,
    p: { repo: string; state?: 'open' | 'closed' | 'all'; limit?: number },
): Promise<IssueRef[]> {
    const out = await corrGh(buildIssueArgs({ op: 'ler', ...p }), token);
    return out ? (JSON.parse(out) as IssueRef[]) : [];
}

export async function comentarIssue(
    token: string,
    p: { repo: string; number: number; body: string },
): Promise<string> {
    return extrairUrl(await corrGh(buildIssueArgs({ op: 'comentar', ...p }), token));
}

/** Valida o token: devolve o login do utilizador. Lança se o token for inválido. */
export async function validarToken(token: string): Promise<string> {
    return corrGh(['api', 'user', '-q', '.login'], token);
}

/** Lista TODOS os repos "owner/nome" a que o token tem acesso — privados e de
 *  organização incluídos (`/user/repos` traz affiliation owner+collaborator+org_member
 *  e visibility=all por defeito; `gh repo list` só trazia os públicos do próprio). */
export async function listarRepos(token: string): Promise<string[]> {
    const out = await corrGh(
        ['api', '--paginate', 'user/repos?per_page=100&sort=full_name', '-q', '.[].full_name'],
        token,
    );
    return out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
}

// --- Import de projeto: o working copy LOCAL de um repo ligado --------------

/** Args do `gh repo clone` (puro — testável). gh leva o GH_TOKEN no env. */
export function buildCloneArgs(repo: string, path: string): string[] {
    if (!REPO_RE.test(repo)) throw new Error(`repo inválido (usa owner/nome): ${repo}`);
    if (!path.trim()) throw new Error('path local vazio');
    return ['repo', 'clone', repo, path];
}

/** Args do `git -C <path> remote get-url origin` (o "test à dir", puro). */
export function buildRemoteCheckArgs(path: string): string[] {
    return ['-C', path, 'remote', 'get-url', 'origin'];
}

/** O origin do working copy "bate" com o repo ligado? Aceita https e ssh, com
 *  ou sem `.git` (github.com/owner/nome ou git@github.com:owner/nome). */
export function remoteBate(remoteUrl: string, repo: string): boolean {
    const alvo = repo.toLowerCase();
    const norm = remoteUrl
        .trim()
        .toLowerCase()
        .replace(/\.git$/, '');
    return norm.endsWith(`/${alvo}`) || norm.endsWith(`:${alvo}`);
}

/** Corre um binário e devolve código+saída SEM rejeitar em código !=0 (o
 *  caller decide o que é falha — ex.: path sem repo não é exceção, é "testa
 *  falhou"). O `error` (binário em falta) ainda rejeita. */
function corrBin(
    bin: string,
    args: string[],
    env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number; out: string; err: string }> {
    return new Promise((resolve, reject) => {
        const ps = spawn(bin, args, { env });
        let out = '';
        let err = '';
        ps.stdout.on('data', (d) => (out += String(d)));
        ps.stderr.on('data', (d) => (err += String(d)));
        ps.on('error', (e) => reject(new Error(`${bin} indisponível: ${e.message}`)));
        ps.on('close', (code) => resolve({ code: code ?? -1, out: out.trim(), err: err.trim() }));
    });
}

/** O "test à dir": o path local é um repo git com o origin a apontar ao repo? */
export async function testarProjetoLocal(
    path: string,
    repo: string,
): Promise<{ ok: boolean; detalhe: string }> {
    if (!path.trim()) return { ok: false, detalhe: 'sem path local' };
    let r: { code: number; out: string; err: string };
    try {
        r = await corrBin('git', buildRemoteCheckArgs(path));
    } catch (e) {
        return { ok: false, detalhe: e instanceof Error ? e.message : String(e) };
    }
    if (r.code !== 0) return { ok: false, detalhe: 'não há repositório git neste path' };
    if (!remoteBate(r.out, repo)) {
        return { ok: false, detalhe: `origin aqui é ${r.out || '(vazio)'}, não ${repo}` };
    }
    return { ok: true, detalhe: 'projeto presente' };
}

/** Clona o repo para o path local com o token do user (GH_TOKEN). */
export async function clonarProjeto(token: string, repo: string, path: string): Promise<void> {
    const r = await corrBin('gh', buildCloneArgs(repo, path), buildGhEnv(token));
    if (r.code !== 0) throw new Error(`clone falhou: ${r.err || r.out || `gh saiu ${r.code}`}`);
}

// --- Orchestrator do relay: a issue como trigger + estado -------------------

/** Lê a issue (título + corpo + comentários) — o goal do pipeline + a retoma. */
export async function verIssue(
    token: string,
    p: { repo: string; number: number },
): Promise<{ title: string; body: string; comentarios: { autor: string; corpo: string }[] }> {
    const out = await corrGh(buildIssueArgs({ op: 'ver', ...p }), token);
    const j = JSON.parse(out) as {
        title?: string;
        body?: string;
        comments?: { author?: { login?: string }; body?: string }[];
    };
    return {
        title: j.title ?? '',
        body: j.body ?? '',
        comentarios: (j.comments ?? []).map((c) => ({
            autor: c.author?.login ?? '',
            corpo: c.body ?? '',
        })),
    };
}

/** O ramo default REAL do repo (não assumir "main" — há repos em "master"). */
export async function ramoPrincipal(token: string, repo: string): Promise<string> {
    const out = await corrGh(
        ['repo', 'view', repo, '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'],
        token,
    );
    return out.trim() || 'main';
}

/** Move os semáforos/estado da issue por label (a vista kanban segue as labels). */
export async function editarLabels(
    token: string,
    p: { repo: string; number: number; add?: string[]; remove?: string[] },
): Promise<void> {
    await corrGh(buildIssueArgs({ op: 'labels', ...p }), token);
}

/** Abre o PR do branch da issue (v1 sem auto-merge — pára para o smoke humano). */
export async function criarPR(
    token: string,
    p: { repo: string; base: string; head: string; title: string; body: string },
): Promise<string> {
    return extrairUrl(await corrGh(buildIssueArgs({ op: 'pr', ...p }), token));
}
