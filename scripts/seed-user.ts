import { createClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '../src/lib/supabase-admin';
import { garantirKernelCom } from '../src/agent/kernel';

process.loadEnvFile('.env.local');

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

async function main(): Promise<void> {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
    });
    if (error && !error.message.includes('already been registered')) {
        throw new Error(`createUser falhou: ${error.message}`);
    }

    // Atalho do dono (#40): semeia o Kernel com Mythos Base + os ficheiros
    // pessoais, para o dev user nascer já pessoalizado e saltar o onboarding.
    // Um user novo, sem este seed, nasce só com Mythos Base → cai no onboarding.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const userDb = createClient(url, anon, { auth: { persistSession: false } });
    const { error: e2 } = await userDb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (e2) throw new Error(`signIn falhou: ${e2.message}`);
    await garantirKernelCom(userDb, undefined, true);

    console.log(`✅ utilizador de dev: ${EMAIL} (Kernel pessoal semeado)`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
