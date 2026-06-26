import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

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

/** Retoma: CONTINUA o branch existente sem resetar de base — o working tree no
 *  disco guarda o trabalho não-commitado da fase anterior (commit só no verde), e
 *  o lock impede outro relay no mesmo path. Resetar (-B de base) apagava-o. */
export function buildRetomaArgs(branch: string): string[][] {
    return [
        ['checkout', branch],
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

/** Preflight de fresh run: não misturar trabalho humano/lixo local no PR do relay. */
export function buildStatusArgs(): string[] {
    return ['status', '--porcelain'];
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

export async function garantirWorkingTreeLimpa(cwd: string): Promise<void> {
    const r = await correrGit(cwd, buildStatusArgs());
    if (r.code !== 0) {
        throw new Error(`git status falhou: ${r.stderr.trim() || r.stdout.trim()}`);
    }
    const sujo = r.stdout.trim();
    if (sujo) {
        throw new Error(
            `working tree suja; aborta para não misturar alterações no PR do relay:\n${sujo}`,
        );
    }
}

export async function abrirBranch(
    cwd: string,
    branch: string,
    base: string,
    token?: string,
    retoma = false,
): Promise<void> {
    // Retoma continua o branch (preserva o trabalho); fresh parte do ramo default.
    if (!retoma) await garantirWorkingTreeLimpa(cwd);
    const seq = retoma ? buildRetomaArgs(branch) : buildBranchArgs(branch, base);
    await correrSequencia(cwd, seq, token);
}

// ── Worktree isolado por run ─────────────────────────────────────────────────
// O relay deixou de operar na working-copy PARTILHADA (a mesma que o dev server
// serve e o humano edita): aí roubava o branch e colidia com o trabalho local.
// Agora cada run vive no SEU `git worktree` — isolado em ficheiros, a partilhar só
// o .git. Também abre correr issues diferentes em paralelo (worktrees distintos).
// Nota: a DB de testes continua PARTILHADA (o gate corre contra o mesmo Supabase).

/** Raiz dos worktrees do relay (RELAY_WORKTREE_ROOT; default: irmã do repo, para
 *  não sujar a working-copy nem precisar de entrada no .gitignore). */
export function worktreeRoot(repoPath: string, envValue = process.env.RELAY_WORKTREE_ROOT): string {
    return envValue?.trim() || join(repoPath, '..', '.relay-worktrees');
}

/** O dir isolado (determinístico) do worktree desta issue — a retoma reusa-o. */
export function worktreeDir(repoPath: string, issue: number, envRoot?: string): string {
    return join(worktreeRoot(repoPath, envRoot), `${basename(repoPath)}-issue-${issue}`);
}

/** Cria o worktree no branch da issue a partir do base remoto FRESCO — substitui o
 *  `checkout base; pull; checkout -B` que o tree único fazia (e que roubava o ramo). */
export function buildWorktreeAddArgs(dir: string, branch: string, base: string): string[] {
    return ['worktree', 'add', '-B', branch, dir, `origin/${base}`];
}

/** Identidade do bot DENTRO do worktree (o relay nunca commita como o humano). */
export function buildIdentidadeArgs(): string[][] {
    return [
        ['config', 'user.name', INTERN_NOME],
        ['config', 'user.email', INTERN_EMAIL],
    ];
}

export function buildWorktreeRemoveArgs(dir: string): string[] {
    return ['worktree', 'remove', '--force', dir];
}

/** Liga os artefactos NÃO-versionados que os testes/Next precisam (node_modules,
 *  .env*) ao worktree por symlink — partilham os do repo principal. Idempotente. */
function ligarArtefactos(repoPath: string, dir: string): void {
    for (const nome of ['node_modules', '.env', '.env.local']) {
        const alvo = join(repoPath, nome);
        const ligacao = join(dir, nome);
        if (existsSync(alvo) && !existsSync(ligacao)) symlinkSync(alvo, ligacao);
    }
}

async function worktreeRegistado(repoPath: string, dir: string): Promise<boolean> {
    const r = await correrGit(repoPath, ['worktree', 'list', '--porcelain']);
    return r.stdout.split('\n').some((l) => l === `worktree ${dir}`);
}

/** Garante que o caminho do worktree está livre antes de o (re)criar (best-effort). */
async function limparWorktree(repoPath: string, dir: string): Promise<void> {
    if (await worktreeRegistado(repoPath, dir)) {
        await correrGit(repoPath, buildWorktreeRemoveArgs(dir));
    }
    rmSync(dir, { recursive: true, force: true });
    await correrGit(repoPath, ['worktree', 'prune']);
}

/** Prepara o worktree isolado da issue e devolve o seu dir (o cwd do run). Fresh =
 *  branch do base remoto fresco; retoma = reusa o dir no disco (preserva o trabalho
 *  não-commitado da fase anterior). Sempre: identidade do bot + symlinks. */
export async function prepararWorktree(opts: {
    repoPath: string;
    dir: string;
    branch: string;
    base: string;
    token: string;
    retoma: boolean;
}): Promise<string> {
    const { repoPath, dir, branch, base, token, retoma } = opts;
    if (!(retoma && (await worktreeRegistado(repoPath, dir)))) {
        await limparWorktree(repoPath, dir);
        mkdirSync(dirname(dir), { recursive: true });
        await correrSequencia(
            repoPath,
            [
                ['fetch', 'origin', base],
                buildWorktreeAddArgs(dir, branch, base),
            ],
            token,
        );
    }
    await correrSequencia(dir, buildIdentidadeArgs(), token);
    ligarArtefactos(repoPath, dir);
    return dir;
}

/** Remove o worktree da issue (no verde: o trabalho já foi commitado+pushed). */
export async function removerWorktree(repoPath: string, dir: string): Promise<void> {
    try {
        await correrGit(repoPath, buildWorktreeRemoveArgs(dir));
        rmSync(dir, { recursive: true, force: true });
        await correrGit(repoPath, ['worktree', 'prune']);
    } catch (e) {
        console.error('remover worktree falhou (segue):', e);
    }
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

/** O comando de testes do repo (RELAY_TEST_CMD; default `npm test`). */
export function comandoTestes(envValue = process.env.RELAY_TEST_CMD): string {
    return envValue?.trim() || 'npm test';
}

/** Test-gate: corre a suite do repo no cwd. Vermelho aqui = devolver ao principal
 *  ANTES de gastar o validador (espelha o pytest-gate do POC). Via shell para
 *  aceitar comandos compostos (`npm test`, `pnpm -s test`, ...). */
export function correrTestes(cwd: string): Promise<{ ok: boolean; output: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(comandoTestes(), { cwd, env: process.env, shell: true });
        let out = '';
        child.stdout.on('data', (c: Buffer) => (out += c.toString()));
        child.stderr.on('data', (c: Buffer) => (out += c.toString()));
        child.on('error', (e: NodeJS.ErrnoException) =>
            reject(new Error(`testes não arrancaram: ${e.message}`)),
        );
        // Cauda do output: o que interessa do fim (falhas) sem encher o comentário.
        child.on('exit', (code) => resolve({ ok: code === 0, output: out.trim().slice(-2000) }));
    });
}
