import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

// Cliente server-side para scripts/testes com service role; bypassa RLS.
export function getSupabaseAdmin(): SupabaseClient {
    if (client) return client;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no ambiente.');
    }
    client = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return client;
}
