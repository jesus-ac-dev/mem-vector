import { getSupabaseAdmin } from '../src/lib/supabase-admin';
import { esperarAuthHealth } from './auth-health';

process.loadEnvFile('.env.local');

const EMAIL = 'fresh@mem-vector.local';
const PASSWORD = 'fresh-password-123';

// Contraparte do seed:user (#40/#71): cria um user SEM o pessoal. O 1.º login
// semeia só o Mythos Base e dispara o onboarding — é como smokar a experiência
// de um utilizador novo.
async function main(): Promise<void> {
    // Robustez pós-reset (#71): esperar o GoTrue antes de criar o utilizador.
    await esperarAuthHealth(process.env.NEXT_PUBLIC_SUPABASE_URL!);

    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
    });
    if (error && !error.message.includes('already been registered')) {
        throw new Error(`createUser falhou: ${error.message}`);
    }
    console.log(`✅ utilizador fresh (cai no onboarding): ${EMAIL} / ${PASSWORD}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
