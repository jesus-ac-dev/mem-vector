import { describe, expect, it } from 'vitest';
import {
    buildClaudeAgenticArgs,
    buildClaudeArgs,
    claudeAgenticTimeoutMs,
    claudeConcurrency,
    claudeTimeoutMs,
    createAsyncSemaphore,
} from './claude';

describe('claudeTimeoutMs', () => {
    it('usa valor positivo vindo do ambiente', () => {
        expect(claudeTimeoutMs('3000')).toBe(3000);
    });

    it('cai no default para valores inválidos', () => {
        expect(claudeTimeoutMs('0')).toBe(120_000);
        expect(claudeTimeoutMs('-1')).toBe(120_000);
        expect(claudeTimeoutMs('nope')).toBe(120_000);
    });
});

describe('claudeConcurrency', () => {
    it('usa inteiro positivo vindo do ambiente', () => {
        expect(claudeConcurrency('2')).toBe(2);
    });

    it('cai no default para valores inválidos', () => {
        expect(claudeConcurrency('0')).toBe(1);
        expect(claudeConcurrency('-1')).toBe(1);
        expect(claudeConcurrency('1.5')).toBe(1);
        expect(claudeConcurrency('nope')).toBe(1);
    });
});

describe('buildClaudeArgs', () => {
    it('nao coloca o prompt na argv para permitir stdin', () => {
        const args = buildClaudeArgs();

        expect(args).toContain('-p');
        expect(args).toContain('--input-format');
        expect(args).toContain('text');
        expect(args).not.toContain('prompt enorme');
    });
});

describe('buildClaudeAgenticArgs', () => {
    const cfg = {
        mcpConfig: '{"mcpServers":{}}',
        allowedTools: ['mcp__memvector__criar_nota', 'mcp__memvector__ler_nota'],
        systemPrompt: 'contrato',
    };

    it('liga as tools MCP em vez de proibir tudo, mantendo built-ins proibidas', () => {
        const args = buildClaudeAgenticArgs(cfg);

        expect(args).toContain('--mcp-config');
        expect(args).toContain('--strict-mcp-config');
        expect(args).toContain('mcp__memvector__criar_nota');
        expect(args).toContain('mcp__memvector__ler_nota');
        // Built-ins continuam fora: o "filesystem" do produto é a BD.
        expect(args).toContain('--disallowedTools');
        expect(args).toContain('Bash');
        expect(args).toContain('Write');
    });

    it('limita o loop com --max-turns e mantém o prompt fora da argv', () => {
        const args = buildClaudeAgenticArgs(cfg);
        expect(args[args.indexOf('--max-turns') + 1]).toBe('15');
        expect(buildClaudeAgenticArgs({ ...cfg, maxTurns: 7 })).toContain('7');
        expect(args).not.toContain('prompt enorme');
    });
});

describe('claudeAgenticTimeoutMs', () => {
    it('usa valor do ambiente e cai no default agentic (5 min)', () => {
        expect(claudeAgenticTimeoutMs('60000')).toBe(60_000);
        expect(claudeAgenticTimeoutMs('nope')).toBe(300_000);
    });
});

describe('createAsyncSemaphore', () => {
    it('serializa tarefas quando a concorrencia e 1', async () => {
        const semaphore = createAsyncSemaphore(1);
        const events: string[] = [];
        let releaseFirst!: () => void;

        const first = semaphore.run(async () => {
            events.push('start:first');
            await new Promise<void>((resolve) => {
                releaseFirst = resolve;
            });
            events.push('end:first');
            return 'first';
        });
        const second = semaphore.run(async () => {
            events.push('start:second');
            return 'second';
        });

        await Promise.resolve();
        expect(events).toEqual(['start:first']);

        releaseFirst();
        await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
        expect(events).toEqual(['start:first', 'end:first', 'start:second']);
    });
});
