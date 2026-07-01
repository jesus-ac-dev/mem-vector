import { describe, expect, it } from 'vitest';

import {
    buildClaudeRepoArgs,
    buildCodexRepoArgs,
    comandoRelayBloqueado,
    correrNoRepo,
    finalDoStdoutClaude,
    interpretarLinhaRepoClaude,
    interpretarLinhaRepoCodex,
    labelPassoRepo,
} from './escrita-no-repo';

describe('buildClaudeRepoArgs', () => {
    it('bypassPermissions = executa tudo sem parar para aprovar', () => {
        const a = buildClaudeRepoArgs({ escrever: true });
        expect(a).toContain('--permission-mode');
        expect(a[a.indexOf('--permission-mode') + 1]).toBe('bypassPermissions');
        expect(a).toContain('-p');
        expect(a.join(' ')).toContain('--setting-sources');
    });
    it('red-line: nega reset ao Supabase via disallowedTools', () => {
        const a = buildClaudeRepoArgs({ escrever: true });
        expect(a[a.indexOf('--disallowedTools') + 1]).toBe('Bash(supabase db reset:*)');
    });
    it('validador e principal partilham a mesma política (mesmo trabalho)', () => {
        const principal = buildClaudeRepoArgs({ escrever: true });
        const validador = buildClaudeRepoArgs({ escrever: false });
        expect(validador[validador.indexOf('--permission-mode') + 1]).toBe('bypassPermissions');
        expect(validador).toEqual(principal);
    });
    it('passa o modelo quando há', () => {
        const a = buildClaudeRepoArgs({ escrever: true, modelo: 'opus' });
        expect(a[a.indexOf('--model') + 1]).toBe('opus');
    });
});

// #129 ronda 2: o blackout — o passo do CLI passa a narrar-se ao vivo. O claude
// corre em stream-json; cada linha vira uma ação humana ("a ler o código",
// "a escrever código") ou o envelope final.
describe('interpretarLinhaRepoClaude', () => {
    it('init → a ler a issue e o repo', () => {
        const r = interpretarLinhaRepoClaude(JSON.stringify({ type: 'system', subtype: 'init' }));
        expect(r).toEqual({ tipo: 'passo', acao: 'a ler a issue e o repo' });
    });
    it('thinking_tokens → thinking (verificado no stream real)', () => {
        const linha = JSON.stringify({ type: 'system', subtype: 'thinking_tokens' });
        expect(interpretarLinhaRepoClaude(linha)).toEqual({ tipo: 'passo', acao: 'thinking' });
    });
    it('assistant com tool_use → ação humana da ferramenta', () => {
        const linha = JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'tool_use', name: 'Edit' }] },
        });
        expect(interpretarLinhaRepoClaude(linha)).toEqual({
            tipo: 'passo',
            acao: 'a escrever código',
        });
    });
    it('assistant com texto → a escrever o relatório (thinking→texto do turno)', () => {
        const linha = JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'vou fazer X' }] },
        });
        expect(interpretarLinhaRepoClaude(linha)).toEqual({
            tipo: 'passo',
            acao: 'a escrever o relatório',
        });
    });
    it('result → envelope final com texto, custo e modelo principal', () => {
        const linha = JSON.stringify({
            type: 'result',
            result: 'feito',
            total_cost_usd: 0.42,
            modelUsage: { 'claude-x': { costUSD: 0.4 }, 'claude-mini': { costUSD: 0.02 } },
        });
        expect(interpretarLinhaRepoClaude(linha)).toEqual({
            tipo: 'final',
            text: 'feito',
            costUsd: 0.42,
            model: 'claude-x',
        });
    });
    it('linha não-JSON ou irrelevante → ignorar', () => {
        expect(interpretarLinhaRepoClaude('lixo')).toEqual({ tipo: 'ignorar' });
        expect(interpretarLinhaRepoClaude(JSON.stringify({ type: 'user' }))).toEqual({
            tipo: 'ignorar',
        });
    });
});

describe('finalDoStdoutClaude (rede de segurança do fallback)', () => {
    it('encontra o envelope result num stdout NDJSON completo', () => {
        const stdout = [
            JSON.stringify({ type: 'system', subtype: 'init' }),
            JSON.stringify({ type: 'result', result: 'ok', total_cost_usd: 0.1 }),
        ].join('\n');
        expect(finalDoStdoutClaude(stdout)).toMatchObject({ text: 'ok', costUsd: 0.1 });
    });
    it('sem result → null (aí sim, o cru é o honesto)', () => {
        expect(finalDoStdoutClaude('texto solto\nsem json')).toBeNull();
    });
});

describe('interpretarLinhaRepoCodex', () => {
    it('thinking → thinking; exec → a correr comandos', () => {
        expect(interpretarLinhaRepoCodex('thinking')).toEqual({ tipo: 'passo', acao: 'thinking' });
        expect(interpretarLinhaRepoCodex('exec bash -c "npm test"')).toEqual({
            tipo: 'passo',
            acao: 'a correr comandos',
        });
    });
    it('linha comum → ignorar (o texto final vem do stdout inteiro)', () => {
        expect(interpretarLinhaRepoCodex('qualquer output')).toEqual({ tipo: 'ignorar' });
    });
});

describe('labelPassoRepo', () => {
    it('traduz as ferramentas comuns para ações humanas', () => {
        expect(labelPassoRepo('Read')).toBe('a ler o código');
        expect(labelPassoRepo('Grep')).toBe('a ler o código');
        expect(labelPassoRepo('Write')).toBe('a escrever código');
        expect(labelPassoRepo('Bash')).toBe('a correr comandos');
        expect(labelPassoRepo('TodoWrite')).toBe('a planear');
    });
    it('ferramenta desconhecida fica legível na mesma', () => {
        expect(labelPassoRepo('FooTool')).toBe('a usar FooTool');
    });
});

describe('buildClaudeRepoArgs — stream', () => {
    it('corre em stream-json (com --verbose, exigido pelo -p) para narrar o passo ao vivo', () => {
        const a = buildClaudeRepoArgs({ escrever: true });
        expect(a[a.indexOf('--output-format') + 1]).toBe('stream-json');
        expect(a).toContain('--verbose');
    });
});

describe('buildCodexRepoArgs', () => {
    it('escrever = sandbox workspace-write no cwd', () => {
        const a = buildCodexRepoArgs({ escrever: true }, '/repo');
        expect(a).toContain('exec');
        expect(a[a.indexOf('--sandbox') + 1]).toBe('workspace-write');
        expect(a[a.indexOf('-C') + 1]).toBe('/repo');
        expect(a[a.length - 1]).toBe('-'); // prompt por stdin
    });
    it('validar = sandbox read-only', () => {
        const a = buildCodexRepoArgs({ escrever: false }, '/repo');
        expect(a[a.indexOf('--sandbox') + 1]).toBe('read-only');
    });
    it('esforço e modelo entram quando há', () => {
        const a = buildCodexRepoArgs({ escrever: true, modelo: 'gpt-5.5', esforco: 'high' }, '/r');
        expect(a.join(' ')).toContain('model_reasoning_effort="high"');
        expect(a[a.indexOf('--model') + 1]).toBe('gpt-5.5');
    });
});

describe('comandoRelayBloqueado', () => {
    it('bloqueia reset Supabase para qualquer provider que invoque o binário via PATH', () => {
        expect(comandoRelayBloqueado('supabase', ['db', 'reset'])).toMatch(/Supabase/);
        expect(comandoRelayBloqueado('supabase', ['migration', 'up'])).toBeNull();
    });

    it('bloqueia variantes de reset Supabase via package runners', () => {
        expect(comandoRelayBloqueado('npx', ['--yes', 'supabase', 'db', 'reset'])).toMatch(
            /Supabase/,
        );
        expect(comandoRelayBloqueado('npm', ['exec', 'supabase', '--', 'db', 'reset'])).toMatch(
            /Supabase/,
        );
        expect(comandoRelayBloqueado('pnpm', ['dlx', 'supabase', 'db', 'reset'])).toMatch(
            /Supabase/,
        );
        expect(comandoRelayBloqueado('yarn', ['dlx', 'supabase', 'db', 'reset'])).toMatch(
            /Supabase/,
        );
        expect(comandoRelayBloqueado('npm', ['run', 'test'])).toBeNull();
    });

    it('bloqueia comandos git que descartam trabalho local', () => {
        expect(comandoRelayBloqueado('git', ['reset', '--hard'])).toMatch(/reset --hard/);
        expect(comandoRelayBloqueado('git', ['clean', '-fd'])).toMatch(/clean -fd/);
        expect(comandoRelayBloqueado('git', ['checkout', '--', '.'])).toMatch(/checkout --/);
        expect(comandoRelayBloqueado('git', ['reset', '--soft', 'HEAD~1'])).toBeNull();
    });

    it('bloqueia rm -rf contra diretórios críticos sem bloquear limpezas normais', () => {
        expect(comandoRelayBloqueado('rm', ['-rf', '.'])).toMatch(/rm -rf/);
        expect(comandoRelayBloqueado('rm', ['-fr', '/'])).toMatch(/rm -rf/);
        expect(comandoRelayBloqueado('rm', ['-rf', 'dist'])).toBeNull();
    });

    it('bloqueia matar processos e desligar a máquina (auto-proteção do runtime)', () => {
        expect(comandoRelayBloqueado('kill', ['-9', '1234'])).toMatch(/runtime|máquina/);
        expect(comandoRelayBloqueado('pkill', ['-f', 'node'])).toMatch(/runtime|máquina/);
        expect(comandoRelayBloqueado('killall', ['node'])).toMatch(/runtime|máquina/);
        expect(comandoRelayBloqueado('reboot', [])).toMatch(/runtime|máquina/);
        expect(comandoRelayBloqueado('shutdown', ['-h', 'now'])).toMatch(/runtime|máquina/);
        expect(comandoRelayBloqueado('poweroff', [])).toMatch(/runtime|máquina/);
        expect(comandoRelayBloqueado('halt', [])).toMatch(/runtime|máquina/);
        // systemctl: subcomandos que desligam/matam (vetor systemd)
        expect(comandoRelayBloqueado('systemctl', ['poweroff'])).toMatch(/runtime|máquina/);
        expect(comandoRelayBloqueado('systemctl', ['reboot'])).toMatch(/runtime|máquina/);
        expect(comandoRelayBloqueado('systemctl', ['kill', 'nginx'])).toMatch(/runtime|máquina/);
        expect(comandoRelayBloqueado('systemctl', ['--user', 'reboot'])).toMatch(/runtime|máquina/);
        expect(comandoRelayBloqueado('sudo', ['reboot'])).toMatch(/proibido/);
        // systemctl inócuo + não-controlados continuam livres
        expect(comandoRelayBloqueado('systemctl', ['status'])).toBeNull();
        expect(comandoRelayBloqueado('systemctl', ['--user', 'status'])).toBeNull();
        expect(comandoRelayBloqueado('npm', ['run', 'test'])).toBeNull();
        expect(comandoRelayBloqueado('git', ['status'])).toBeNull();
    });
});

describe('correrNoRepo', () => {
    it('recusa o modo api (não escreve ficheiros)', async () => {
        await expect(
            correrNoRepo('claude', { ativo: true, modo: 'api' }, 'x', '/r', { escrever: true }),
        ).rejects.toThrow(/modo cli/);
    });
    it('recusa providers que ainda não escrevem (gemini/ollama na v1)', async () => {
        await expect(
            correrNoRepo('gemini', { ativo: true, modo: 'cli' }, 'x', '/r', { escrever: true }),
        ).rejects.toThrow(/ainda não escreve/);
    });
});
