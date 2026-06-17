// Helper de leitura via rota GET (#73). Loads automáticos (useEffect) que antes
// chamavam server actions partiam com "unexpected response" quando o HMR roda os
// action IDs. Uma rota GET tem URL estável — imune ao stale. Mantém-se dentro do
// runClientAction (logging/banner) só trocando o thunk action→fetch.
export async function getJson<T>(path: string): Promise<T> {
    const res = await fetch(path, { method: 'GET', headers: { accept: 'application/json' } });
    if (res.status === 404) return null as T;
    if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
}
