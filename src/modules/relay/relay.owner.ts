import type { SupabaseClient } from '@supabase/supabase-js';

// owner_id EXPLÍCITO para as escritas do relay (padrão do agent_jobs): se a
// sessão não estiver no contexto, o chamador salta com aviso em vez de falhar
// mudo. Um sítio só — runs, eventos e steering partilham a mesma regra.
export async function ownerIdCom(db: SupabaseClient): Promise<string | null> {
    const {
        data: { session },
    } = await db.auth.getSession();
    return session?.user?.id ?? null;
}
