import { spawn } from 'node:child_process';

// M7: transporte GitHub do agente via gh CLI (requisito declarado no README). O
// token do user vai por GH_TOKEN no env do subprocesso — sobrepõe-se ao gh auth
// do host, por isso age como a conta do user do SaaS (passa o fresh-pc-test). O
// arg-builder é puro (núcleo testável); o spawn é fino por cima.

const REPO_RE = /^[^/\s]+\/[^/\s]+$/;

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
        const ps = spawn('gh', args, {
            env: { ...process.env, GH_TOKEN: token, GH_PROMPT_DISABLED: '1' },
        });
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

export async function criarIssue(
    token: string,
    p: { repo: string; title: string; body: string },
): Promise<string> {
    // gh imprime o URL da issue criada no stdout.
    return corrGh(buildIssueArgs({ op: 'criar', ...p }), token);
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
    return corrGh(buildIssueArgs({ op: 'comentar', ...p }), token);
}
