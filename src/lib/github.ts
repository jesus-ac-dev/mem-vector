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
    | { op: 'comentar'; repo: string; number: number; body: string };

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
