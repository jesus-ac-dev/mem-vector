import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Cliente Supabase server-side, autenticado pela sessão nos cookies.
// A RLS aplica-se (ao contrário do getSupabaseAdmin/service-role).
export async function createClient() {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options),
                        );
                    } catch {
                        // Chamado de um Server Component (cookies read-only).
                        // O middleware refresca a sessão, por isso é seguro ignorar.
                    }
                },
            },
        },
    );
}
