import { createClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '../src/lib/supabase-admin';
import { garantirKernelCom, type NotaKernel } from '../src/agent/kernel';
import { esperarAuthHealth } from './auth-health';

process.loadEnvFile('.env.local');

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

// #123: o pessoal do dono vive em `kernel-pessoal.ts` (gitignored, nunca
// replicado). Carrega-o se existir; senão cai no `.example` (template). O produto
// nunca depende disto — o caminho canónico de um user novo é `seed:fresh`.
async function carregarPessoal(): Promise<NotaKernel[]> {
    try {
        return (await import('./seed-data/kernel-pessoal')).KERNEL_PESSOAL;
    } catch {
        console.log('(sem kernel-pessoal.ts local — uso o template .example)');
        return (await import('./seed-data/kernel-pessoal.example')).KERNEL_PESSOAL;
    }
}

async function main(): Promise<void> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    // Robustez pós-reset (#71): esperar o GoTrue antes de criar o utilizador.
    await esperarAuthHealth(url);

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
    const userDb = createClient(url, anon, { auth: { persistSession: false } });
    const { error: e2 } = await userDb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (e2) throw new Error(`signIn falhou: ${e2.message}`);
    await garantirKernelCom(userDb, undefined, await carregarPessoal());

    console.log(`✅ utilizador de dev: ${EMAIL} (Kernel pessoal semeado)`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
