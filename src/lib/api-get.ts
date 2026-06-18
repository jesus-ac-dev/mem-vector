// Helper de leitura via rota GET (#73). Loads automáticos (useEffect) que antes
// chamavam server actions partiam com "unexpected response" quando o HMR roda os
// action IDs. Uma rota GET tem URL estável — imune ao stale. Mantém-se dentro do
// runClientAction (logging/banner) só trocando o thunk action→fetch.
import { STALE_APP_EVENT } from './client-error-log';

export async function getJson<T>(path: string): Promise<T> {
    const res = await fetch(path, { method: 'GET', headers: { accept: 'application/json' } });
    // Sessão expirada (#smoke 2026-06-18): a rota devolve 401 quando a RLS não tem
    // sessão. Antes isto colapsava em 404 → o cliente tratava como vazio e o
    // utilizador caía no login sem aviso. Agora avisa a UI (banner stale, #49).
    if (res.status === 401) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(
                new CustomEvent(STALE_APP_EVENT, { detail: { area: 'api-get', action: path } }),
            );
        }
        throw new Error(`GET ${path}: sessão expirada`);
    }
    if (res.status === 404) return null as T;
    if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
}
