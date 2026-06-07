import { describe, expect, it } from 'vitest';
import {
    buildClaudeArgs,
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
