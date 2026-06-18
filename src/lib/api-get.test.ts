// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { getJson } from './api-get';
import { STALE_APP_EVENT } from './client-error-log';

afterEach(() => vi.restoreAllMocks());

describe('getJson', () => {
    it('200 devolve o json', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ a: 1 }) }),
        );
        expect(await getJson('/x')).toEqual({ a: 1 });
    });

    it('404 devolve null (vazio, não é erro)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
        expect(await getJson('/x')).toBeNull();
    });

    it('401 (sessão expirada) dispara o banner stale e lança', async () => {
        // O smoke (2026-06-18) mostrou o kick silencioso: a rota devolvia 404 por
        // RLS sem sessão, o cliente tratava como vazio e o utilizador caía no login
        // sem aviso. Agora 401 → banner "recarrega/sessão expirada".
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
        const handler = vi.fn();
        window.addEventListener(STALE_APP_EVENT, handler);
        await expect(getJson('/x')).rejects.toThrow(/sess/i);
        expect(handler).toHaveBeenCalled();
        window.removeEventListener(STALE_APP_EVENT, handler);
    });
});
