import { spawn } from 'node:child_process';

import type { AgenteServidor, Provider } from '@/modules/definicoes/definicoes.schema';

// Escrita agêntica NO REPO: ao contrário do `gerar` (texto, sandbox em tmpdir),
// aqui o provider corre o seu CLI agêntico DENTRO do working copy preparado
// (cwd = path local do repo ligado) e EDITA ficheiros — é o que faz um ciclo
// kanban escrever código de verdade. Portado do POC agentic-kanban (providers
// codex/claude `run({cwd, write})`); os arg-builders são puros (testáveis), o
// spawn é fino por cima.
//
// Só o modo `cli` escreve: o modo `api` é geração de texto, não tem loop de
// tools/ficheiros. Pedir escrita a um provider api é estado conhecido → erro
// claro, não um silêncio que "corre e não muda nada".

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? `${process.env.HOME}/.local/bin/claude`;
const CODEX_BIN = process.env.CODEX_BIN ?? `${process.env.HOME}/.local/bin/codex`;

// O sandbox bubblewrap do codex falha em alguns kernels (loopback RTM_NEWADDR).
// Igual ao POC: bypass SÓ quando o ambiente já está isolado (o path do projeto).
const CODEX_BYPASS = process.env.RELAY_CODEX_BYPASS_SANDBOX === '1';

export interface OpcoesRepo {
    /** true = pode editar ficheiros (principal); false = read-only (validador). */
    escrever: boolean;
    modelo?: string;
    esforco?: string;
}

export interface RespostaRepo {
    text: string;
    costUsd: number;
    costIsEstimate: boolean;
    model?: string;
}

// Política de permissões do relay (Carlos 2026-06-22): cada agente faz TUDO
// dentro do projeto EXCETO reset ao Supabase. Sem isto, o claude bloqueia
// `npm`/`tsc`/`vitest`/`build` à espera de aprovação que no background não há
// (o #150 mostrou-o: o claude ficou preso, o codex correu tudo).
const RELAY_SEM_RESET_SUPABASE = 'Bash(supabase db reset:*)';

/** Args do `claude -p` agêntico no repo. `bypassPermissions` = executa tudo
 *  (edita + corre testes/build) sem parar para aprovar; `--disallowedTools` mantém
 *  a única red-line (reset Supabase). Validador e principal partilham a mesma
 *  política (mesmo trabalho, rotação dos N). `--setting-sources ''` isola o host. */
export function buildClaudeRepoArgs(opts: OpcoesRepo): string[] {
    return [
        '-p',
        '--output-format',
        'json',
        '--setting-sources',
        '',
        '--permission-mode',
        'bypassPermissions',
        '--disallowedTools',
        RELAY_SEM_RESET_SUPABASE,
        ...(opts.modelo ? ['--model', opts.modelo] : []),
    ];
}

/** Args do `codex exec` no repo. workspace-write edita o cwd; read-only valida.
 *  bypass cobre aprovações E sandbox de uma vez (kernels onde o bwrap rebenta). */
export function buildCodexRepoArgs(opts: OpcoesRepo, cwd: string): string[] {
    const args = CODEX_BYPASS
        ? ['exec', '--dangerously-bypass-approvals-and-sandbox', '--color', 'never', '-C', cwd]
        : [
              '--ask-for-approval',
              'never',
              'exec',
              '--sandbox',
              opts.escrever ? 'workspace-write' : 'read-only',
              '--color',
              'never',
              '-C',
              cwd,
          ];
    if (opts.esforco) args.push('--config', `model_reasoning_effort="${opts.esforco}"`);
    if (opts.modelo) args.push('--model', opts.modelo);
    args.push('-'); // prompt por stdin
    return args;
}

const QUOTA_RE =
    /429|rate.?limit|usage.?limit|weekly.?limit|too many|hit your limit|limit reached|quota|out of credits/i;

function spawnNoRepo(
    bin: string,
    args: string[],
    cwd: string,
    prompt: string,
    timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { cwd, env: { ...process.env } });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`${bin} excedeu ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
        child.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
        child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
        child.on('error', (e: NodeJS.ErrnoException) => {
            clearTimeout(timer);
            reject(new Error(e.code === 'ENOENT' ? `\`${bin}\` não está no PATH` : e.message));
        });
        child.on('exit', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
        });
        child.stdin.write(prompt);
        child.stdin.end();
    });
}

const DEFAULT_TIMEOUT_MS = 600_000; // 10 min: agentes a escrever código são lentos.

function timeoutRepoMs(envValue = process.env.RELAY_REPO_TIMEOUT_MS): number {
    const parsed = Number(envValue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

async function correrClaudeNoRepo(
    prompt: string,
    cwd: string,
    opts: OpcoesRepo,
): Promise<RespostaRepo> {
    const { code, stdout, stderr } = await spawnNoRepo(
        CLAUDE_BIN,
        buildClaudeRepoArgs(opts),
        cwd,
        prompt,
        timeoutRepoMs(),
    );
    if (code !== 0) {
        const msg = `${stdout}\n${stderr}`.trim();
        if (QUOTA_RE.test(msg)) throw new Error(`claude: quota/limite — ${msg.slice(0, 200)}`);
        throw new Error(`claude saiu ${code}: ${msg.slice(-300)}`);
    }
    let env: { result?: string; total_cost_usd?: number; subtype?: string };
    try {
        env = JSON.parse(stdout);
    } catch {
        return { text: stdout.trim(), costUsd: 0, costIsEstimate: true };
    }
    return {
        text: env.result ?? '',
        costUsd: Number(env.total_cost_usd ?? 0),
        costIsEstimate: false,
    };
}

async function correrCodexNoRepo(
    prompt: string,
    cwd: string,
    opts: OpcoesRepo,
): Promise<RespostaRepo> {
    const { code, stdout, stderr } = await spawnNoRepo(
        CODEX_BIN,
        buildCodexRepoArgs(opts, cwd),
        cwd,
        prompt,
        timeoutRepoMs(),
    );
    if (code !== 0) {
        const msg = `${stdout}\n${stderr}`.trim();
        if (QUOTA_RE.test(msg)) throw new Error(`codex: quota/limite — ${msg.slice(-200)}`);
        throw new Error(`codex saiu ${code}: ${msg.slice(-300)}`);
    }
    // O modelo real vem do cabeçalho do exec ("model: gpt-5.5"); custo não é fiável.
    const model = stdout.match(/^model:\s*(.+)$/m)?.[1]?.trim();
    return { text: stdout.trim(), costUsd: 0, costIsEstimate: true, model };
}

/** Corre o provider (cli) DENTRO do repo. api → erro (não escreve ficheiros). */
export async function correrNoRepo(
    provider: Provider,
    cfg: AgenteServidor,
    prompt: string,
    cwd: string,
    opts: OpcoesRepo,
): Promise<RespostaRepo> {
    if (cfg.modo === 'api') {
        throw new Error(
            `provider "${provider}" está em modo api — o cruzamento de código exige modo cli (escreve ficheiros).`,
        );
    }
    const efetivas: OpcoesRepo = {
        ...opts,
        modelo: opts.modelo ?? cfg.modelo,
        esforco: cfg.esforco,
    };
    if (provider === 'codex') return correrCodexNoRepo(prompt, cwd, efetivas);
    if (provider === 'claude') return correrClaudeNoRepo(prompt, cwd, efetivas);
    throw new Error(`provider "${provider}" ainda não escreve no repo (só claude/codex na v1).`);
}
