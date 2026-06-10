import { describe, expect, it, vi } from 'vitest';
import {
    isUnexpectedServerActionResponse,
    retryTransientClientAction,
} from '@/lib/client-error-log';

describe('client-error-log', () => {
    it('identifica o erro transiente de Server Action inesperada', () => {
        expect(
            isUnexpectedServerActionResponse(
                new Error('An unexpected response was received from the server.'),
            ),
        ).toBe(true);
        expect(isUnexpectedServerActionResponse(new Error('falha real'))).toBe(false);
    });

    it('repete uma action quando a primeira tentativa falha com resposta inesperada', async () => {
        const action = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(
                new Error('An unexpected response was received from the server.'),
            )
            .mockResolvedValueOnce('ok');

        await expect(retryTransientClientAction(action, { retries: 1, delayMs: 0 })).resolves.toBe(
            'ok',
        );
        expect(action).toHaveBeenCalledTimes(2);
    });

    it('nao repete erros nao-transientes', async () => {
        const error = new Error('nota nao encontrada');
        const action = vi.fn<() => Promise<string>>().mockRejectedValue(error);

        await expect(retryTransientClientAction(action, { retries: 1, delayMs: 0 })).rejects.toBe(
            error,
        );
        expect(action).toHaveBeenCalledTimes(1);
    });

    it('devolve o erro transiente depois de esgotar retries', async () => {
        const error = new Error('An unexpected response was received from the server.');
        const action = vi.fn<() => Promise<string>>().mockRejectedValue(error);

        await expect(retryTransientClientAction(action, { retries: 1, delayMs: 0 })).rejects.toBe(
            error,
        );
        expect(action).toHaveBeenCalledTimes(2);
    });
});
