import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

async function main(): Promise<void> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
    });
    if (error && !error.message.includes('already been registered')) {
        throw new Error(`createUser falhou: ${error.message}`);
    }
    const userId = data?.user?.id;
    console.log(`✅ utilizador de dev: ${EMAIL} (${userId ?? 'já existia'})`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
