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

describe('runClientAction + app stale (#49)', () => {
    it('dispara o evento STALE_APP_EVENT quando a action morre com resposta inesperada', async () => {
        const { runClientAction, STALE_APP_EVENT } = await import('./client-error-log');
        const ouvinte = vi.fn();
        window.addEventListener(STALE_APP_EVENT, ouvinte);

        const r = await runClientAction({ area: 'teste', action: 'x' }, async () => {
            throw new Error('An unexpected response was received from the server.');
        });

        expect(r).toBeUndefined();
        expect(ouvinte).toHaveBeenCalledOnce();
        window.removeEventListener(STALE_APP_EVENT, ouvinte);
    });

    it('NÃO dispara o evento para erros normais', async () => {
        const { runClientAction, STALE_APP_EVENT } = await import('./client-error-log');
        const ouvinte = vi.fn();
        window.addEventListener(STALE_APP_EVENT, ouvinte);

        await runClientAction({ area: 'teste', action: 'x' }, async () => {
            throw new Error('erro qualquer de negócio');
        });

        expect(ouvinte).not.toHaveBeenCalled();
        window.removeEventListener(STALE_APP_EVENT, ouvinte);
    });

    it('control-flow do Next (NEXT_REDIRECT) é engolido — não loga nem re-lança', async () => {
        const { runClientAction, isErroDeNavegacaoNext } = await import('./client-error-log');
        const redirectErr = Object.assign(new Error('NEXT_REDIRECT'), {
            digest: 'NEXT_REDIRECT;push;/login;307;',
        });
        expect(isErroDeNavegacaoNext(redirectErr)).toBe(true);

        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        // Engole (return undefined): não re-lança (evita unhandledrejection no void)
        // nem loga (não é erro). Quem navega fá-lo no cliente.
        const r = await runClientAction({ area: 'profile-menu', action: 'signOut' }, async () => {
            throw redirectErr;
        });
        expect(r).toBeUndefined();
        expect(erro).not.toHaveBeenCalled();
        erro.mockRestore();
    });
});
