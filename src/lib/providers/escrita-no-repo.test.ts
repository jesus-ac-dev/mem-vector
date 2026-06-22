import { describe, expect, it } from 'vitest';

import { buildClaudeRepoArgs, buildCodexRepoArgs, correrNoRepo } from './escrita-no-repo';

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
