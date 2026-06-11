import type { SupabaseClient } from '@supabase/supabase-js';

// Resolve author_id → nome humano para o histórico de versões (#23): com
// partilhas de grupo "user" é ambíguo — mostra-se QUEM escreveu. Fonte:
// profiles.display_name; para o próprio utilizador cai para o email da sessão.
// (Perfis de outros membros do grupo dependem da RLS de profiles — slice de
// grupos; até lá resolve o que for visível.)
export async function nomesDosAutoresCom(
    db: SupabaseClient,
    autorIds: Array<string | null>,
): Promise<Map<string, string>> {
    const ids = [...new Set(autorIds.filter((id): id is string => Boolean(id)))];
    if (!ids.length) return new Map();

    const nomes = new Map<string, string>();
    const { data } = await db.from('profiles').select('id, display_name').in('id', ids);
    for (const p of data ?? []) {
        if (p.display_name) nomes.set(String(p.id), String(p.display_name));
    }

    const {
        data: { user },
    } = await db.auth.getUser();
    if (user && ids.includes(user.id) && !nomes.has(user.id) && user.email) {
        nomes.set(user.id, user.email);
    }
    return nomes;
}
