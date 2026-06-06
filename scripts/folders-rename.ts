import { createClient } from '@supabase/supabase-js';

import {
    escreverNotaCom,
    getNotaCom,
    renomearNotaCom,
} from '../src/modules/knowledge/knowledge.service';
import { slugify } from '../src/modules/knowledge/knowledge.links';
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

async function main(): Promise<void> {
    const admin = getSupabaseAdmin();
    const c = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
    if (c.error && !c.error.message.includes('already been registered')) throw new Error(c.error.message);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const si = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (si.error) throw new Error(si.error.message);

    const oldSlug = slugify('Alvo Rename FP');
    const newSlug = slugify('Alvo Renomeado FP');
    const refSlug = slugify('Referente Rename FP');

    await escreverNotaCom(db, { title: 'Alvo Rename FP', content_md: '# Alvo', links: [], reason: 'p' });
    await escreverNotaCom(db, {
        title: 'Referente Rename FP',
        content_md: `# Ref\n\nLiga a [[${oldSlug}]].`,
        links: [],
        reason: 'p',
    });

    await renomearNotaCom(db, oldSlug, 'Alvo Renomeado FP');

    const novo = await getNotaCom(db, newSlug);
    const velho = await getNotaCom(db, oldSlug);
    const eixo1 = !!novo && velho === null;
    console.log(`${eixo1 ? '✅' : '❌'} eixo 1 — nota renomeada (novo slug existe, antigo desapareceu)`);

    const ref = await getNotaCom(db, refSlug);
    const eixo2 = !!ref && ref.contentMd.includes('Alvo Renomeado FP') && !ref.contentMd.includes(`[[${oldSlug}]]`);
    console.log(`${eixo2 ? '✅' : '❌'} eixo 2 — o [[link]] na nota referente foi reapontado`);

    const ed = await db
        .from('edges')
        .select('to_slug, to_id')
        .eq('from_id', ref?.id ?? '')
        .eq('to_slug', newSlug);
    const eixo3 = (ed.data ?? []).some((e) => e.to_id === novo?.id);
    console.log(`${eixo3 ? '✅' : '❌'} eixo 3 — a aresta da referente resolve para a nota nova`);

    const ok = eixo1 && eixo2 && eixo3;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
