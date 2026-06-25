import { describe, expect, it } from 'vitest';

import {
    buildClaudeRepoArgs,
    buildCodexRepoArgs,
    comandoRelayBloqueado,
    correrNoRepo,
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
