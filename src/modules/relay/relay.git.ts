import { spawn } from 'node:child_process';

import { buildGhEnv } from '@/lib/github';

// Git DENTRO do working copy preparado (cwd = path local do repo). Identidade do
// bot (Intern Rule): o relay NUNCA commita como o Carlos. O push usa o GH_TOKEN
// do user (o clone via gh já configurou o credential helper). Arg-builders puros;
// o spawn é fino por cima.

export const INTERN_NOME = process.env.RELAY_BOT_NAME ?? 'mem-vector-relay';
export const INTERN_EMAIL = process.env.RELAY_BOT_EMAIL ?? 'relay@mem-vector.local';

/** Sequência para abrir o branch da issue com a identidade do bot. Parte do
 *  ramo default REAL do repo (não assume "main" — há repos em "master"). */
export function buildBranchArgs(branch: string, base: string): string[][] {
    return [
        ['checkout', base],
        ['pull', '--ff-only'],
        ['checkout', '-B', branch],
        ['config', 'user.name', INTERN_NOME],
        ['config', 'user.email', INTERN_EMAIL],
    ];
}

/** Sequência para selar a ronda verde: tudo o que o agente mexeu → branch remoto. */
export function buildCommitPushArgs(branch: string, mensagem: string): string[][] {
    return [
        ['add', '-A'],
        ['commit', '-m', mensagem],
        ['push', '-u', 'origin', branch],
    ];
}

/** Nome do branch da issue (Intern Rule: feat/issue-N). */
export function nomeBranch(issue: number): string {
    return `feat/issue-${issue}`;
}

function correrGit(
    cwd: string,
    args: string[],
    token?: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const env = token ? buildGhEnv(token) : process.env;
        const child = spawn('git', args, { cwd, env });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
        child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
        child.on('error', (e: NodeJS.ErrnoException) =>
            reject(new Error(e.code === 'ENOENT' ? 'git não está no PATH' : e.message)),
        );
        child.on('exit', (code) => resolve({ code, stdout, stderr }));
    });
}

/** Corre uma sequência de comandos git; pára e lança no primeiro que falhar. */
async function correrSequencia(cwd: string, seq: string[][], token?: string): Promise<void> {
    for (const args of seq) {
        const r = await correrGit(cwd, args, token);
        if (r.code !== 0) {
            throw new Error(`git ${args.join(' ')} falhou: ${r.stderr.trim() || r.stdout.trim()}`);
        }
    }
}

export async function abrirBranch(
    cwd: string,
    branch: string,
    base: string,
    token?: string,
): Promise<void> {
    await correrSequencia(cwd, buildBranchArgs(branch, base), token);
}

export async function commitPush(
    cwd: string,
    branch: string,
    mensagem: string,
    token: string,
): Promise<void> {
    await correrSequencia(cwd, buildCommitPushArgs(branch, mensagem), token);
}

/** O diff de tudo o que o agente mexeu (inclui untracked via add -N), p/ o validador. */
export async function diffDoRepo(cwd: string): Promise<string> {
    await correrGit(cwd, ['add', '-N', '.']);
    const r = await correrGit(cwd, ['--no-pager', 'diff']);
    return r.stdout;
}
