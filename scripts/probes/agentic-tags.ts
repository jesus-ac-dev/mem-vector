// Probe #95: prova que o caminho AGENTIC da destilação emite tags (paridade com
// o one-shot). Força o agentic pela env flag, destila um facto, e confirma que
// a nota escrita ficou com tags no frontmatter.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '../../src/lib/supabase-admin';
import { executarDestilacaoTurnoCom } from '../../src/modules/chat/chat.postturno';

process.loadEnvFile('.env.local');
process.env.MEMVECTOR_AGENTIC_DISTILL = '1'; // força o caminho agentic

async function main(): Promise<void> {
    const email = `probe-agtags-${randomUUID().slice(0, 8)}@mem-vector.local`;
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.createUser({
        email,
        password: 'pw-agtags-123',
        email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error: e2 } = await db.auth.signInWithPassword({ email, password: 'pw-agtags-123' });
    if (e2) throw new Error(`signIn: ${e2.message}`);

    const r = await executarDestilacaoTurnoCom(
        db,
        'O Carlos comprou um carro novo, um Tesla Model 3.',
        'Registado: o Carlos comprou um Tesla Model 3.',
    );
    const slug = r.notas[0]?.slug;
    if (!slug) {
        console.log('❌ o agentic não escreveu nota');
        process.exit(1);
    }
    const { data } = await db.from('knowledge').select('frontmatter').eq('slug', slug).single();
    const tags = ((data?.frontmatter ?? {}) as { tags?: string[] }).tags ?? [];
    console.log(`nota: ${slug} | tags: [${tags.join(', ')}]`);
    console.log(tags.length > 0 ? '✅ o agentic EMITE tags (paridade)' : '❌ sem tags');
    if (tags.length === 0) process.exit(1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
