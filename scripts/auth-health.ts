// Espera o GoTrue (auth) ficar pronto antes de criar utilizadores (#71).
// Após `supabase db reset` há uma janela em que o GoTrue reconecta à BD e o
// `createUser` falha com erro vazio (`{}`). Faz polling ao /auth/v1/health
// (endpoint público) até 200, ou estoura com um erro claro.
export async function esperarAuthHealth(url: string, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let ultimoErro = 'sem resposta';
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${url}/auth/v1/health`);
            if (res.ok) return;
            ultimoErro = `HTTP ${res.status}`;
        } catch (e) {
            ultimoErro = e instanceof Error ? e.message : String(e);
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`auth (GoTrue) não ficou pronto em ${timeoutMs / 1000}s: ${ultimoErro}`);
}
