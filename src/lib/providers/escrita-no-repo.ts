import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

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
const GUARDED_BINS = [
    'supabase',
    'git',
    'rm',
    'npx',
    'npm',
    'pnpm',
    'yarn',
    // #relay-guard: auto-proteção do runtime — matar processos / desligar a máquina.
    'kill',
    'pkill',
    'killall',
    'reboot',
    'shutdown',
    'poweroff',
    'halt',
    'systemctl',
    'sudo',
] as const;
type GuardedBin = (typeof GUARDED_BINS)[number];

function flagChars(args: string[]): string {
    return args
        .filter((arg) => /^-[A-Za-z]+$/.test(arg))
        .join('')
        .replace(/[^A-Za-z]/g, '');
}

export function comandoRelayBloqueado(bin: string, args: string[]): string | null {
    // #relay-guard: o agente escreve+testa código; o ciclo de vida de processos é da
    // infra (timeouts do runner), não dele — sem uso legítimo de matar/desligar. Lista
    // INLINE: esta função é serializada via .toString() para o wrapper, logo não pode
    // referenciar constantes externas.
    if (['kill', 'pkill', 'killall', 'reboot', 'shutdown', 'poweroff', 'halt'].includes(bin)) {
        return `${bin} pode derrubar o runtime ou a máquina — proibido dentro do relay`;
    }
    if (bin === 'systemctl') {
        const subcomando = args.find((arg) => !arg.startsWith('-')) ?? '';
        if (['poweroff', 'reboot', 'halt', 'shutdown', 'kill'].includes(subcomando)) {
            return `systemctl ${subcomando} pode derrubar o runtime ou a máquina — proibido dentro do relay`;
        }
    }
    if (bin === 'sudo') {
        return 'sudo eleva operações fora do contrato do relay — proibido dentro do relay';
    }
    if (bin === 'supabase' && args[0] === 'db' && args[1] === 'reset') {
        return 'reset da base Supabase é proibido dentro do relay';
    }
    if (['npx', 'npm', 'pnpm', 'yarn'].includes(bin)) {
        const normalizado = args.filter((arg) => arg !== '--').join(' ');
        if (/(^|\s)supabase\s+db\s+reset(\s|$)/.test(normalizado)) {
            return 'reset da base Supabase é proibido dentro do relay';
        }
    }
    if (bin === 'git' && args[0] === 'reset' && args.includes('--hard')) {
        return 'git reset --hard apaga trabalho local do relay';
    }
    if (bin === 'git' && args[0] === 'clean') {
        const flags = flagChars(args);
        if (flags.includes('f') && flags.includes('d')) {
            return 'git clean -fd remove ficheiros não versionados do working copy';
        }
    }
    if (bin === 'git' && args[0] === 'checkout' && args.includes('--')) {
        return 'git checkout -- pode descartar alterações locais';
    }
    if (bin === 'rm') {
        const flags = flagChars(args);
        const recursive = flags.includes('r') || flags.includes('R');
        const force = flags.includes('f');
        const alvos = args.filter((arg) => !arg.startsWith('-'));
        if (
            recursive &&
            force &&
            alvos.some((arg) => arg === '.' || arg === '..' || arg === '/' || arg === '~')
        ) {
            return 'rm -rf contra diretório crítico é proibido dentro do relay';
        }
    }
    return null;
}

function wrapperRelayCommandGuard(bin: GuardedBin, realEnv: string): string {
    const flagBody = flagChars.toString();
    const body = comandoRelayBloqueado.toString();
    return `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
${flagBody}
${body}
const bin = ${JSON.stringify(bin)};
const real = process.env[${JSON.stringify(realEnv)}];
const args = process.argv.slice(2);
const motivo = comandoRelayBloqueado(bin, args);
if (motivo) {
  console.error('[relay command guard] bloqueado: ' + bin + ' ' + args.join(' '));
  console.error('[relay command guard] ' + motivo);
  process.exit(126);
}
if (!real) {
  console.error('[relay command guard] binário real não encontrado: ' + bin);
  process.exit(127);
}
const r = spawnSync(real, args, { stdio: 'inherit', env: process.env });
if (r.error) {
  console.error('[relay command guard] falha ao executar ' + real + ': ' + r.error.message);
  process.exit(127);
}
process.exit(r.status ?? 1);
`;
}

async function resolveBin(bin: string, pathValue = process.env.PATH ?? ''): Promise<string | null> {
    for (const dir of pathValue.split(delimiter)) {
        if (!dir) continue;
        const candidate = join(dir, bin);
        try {
            await access(candidate, constants.X_OK);
            return candidate;
        } catch {
            // tenta o próximo diretório do PATH
        }
    }
    return null;
}

async function prepararRelayCommandGuard(
    env: NodeJS.ProcessEnv,
): Promise<{ env: NodeJS.ProcessEnv; cleanup: () => Promise<void> }> {
    const guardDir = await mkdtemp(join(tmpdir(), 'memvector-relay-guard-'));
    const guardedEnv: NodeJS.ProcessEnv = { ...env };
    for (const bin of GUARDED_BINS) {
        const real = await resolveBin(bin, env.PATH);
        if (!real) continue;
        const envName = `MEMVECTOR_RELAY_REAL_${bin.toUpperCase()}`;
        guardedEnv[envName] = real;
        const wrapperPath = join(guardDir, bin);
        await writeFile(wrapperPath, wrapperRelayCommandGuard(bin, envName), 'utf8');
        await chmod(wrapperPath, 0o755);
    }
    guardedEnv.PATH = `${guardDir}${delimiter}${env.PATH ?? ''}`;
    return {
        env: guardedEnv,
        cleanup: () => rm(guardDir, { recursive: true, force: true }),
    };
}

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

async function spawnNoRepo(
    bin: string,
    args: string[],
    cwd: string,
    prompt: string,
    timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    const guard = await prepararRelayCommandGuard({ ...process.env });
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { cwd, env: guard.env });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            void guard.cleanup();
            reject(new Error(`${bin} excedeu ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
        child.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
        child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
        child.on('error', (e: NodeJS.ErrnoException) => {
            clearTimeout(timer);
            void guard.cleanup();
            reject(new Error(e.code === 'ENOENT' ? `\`${bin}\` não está no PATH` : e.message));
        });
        child.on('exit', (code) => {
            clearTimeout(timer);
            void guard.cleanup();
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
