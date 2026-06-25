import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// #159: o cliente Supabase do agente autentica SÓ com o access token (header
// Authorization), SEM refresh token. O setSession antigo refrescava um access
// token expirado e, com enable_refresh_token_rotation=true, ROTAVA o refresh token
// partilhado com a sessão do browser do utilizador → invalidava-a e ele levava
// kick. Sem refresh token o agente não pode rotar; opera dentro da validade do AT
// (corridas curtas) e o getUser/RLS funcionam à mesma via header.
//
// Vive fora de mcp-tools.ts (que é o entrypoint do servidor MCP, com main()
// auto-executado) para ser importável/testável sem efeitos colaterais.
export async function criarDb(): Promise<SupabaseClient> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const accessToken = process.env.MEMVECTOR_AGENT_ACCESS_TOKEN;
    if (!url || !anon) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY no ambiente.');
    if (!accessToken) throw new Error('Falta MEMVECTOR_AGENT_ACCESS_TOKEN no ambiente.');
    return createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
