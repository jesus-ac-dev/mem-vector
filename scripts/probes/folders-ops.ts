import { createClient } from '@supabase/supabase-js';

import {
    criarPastaCom,
    listarPastasCom,
    renomearPastaCom,
} from '../../src/modules/folders/folders.service';
import {
    escreverNotaCom,
    listarKnowledgeCom,
    moverNotaCom,
} from '../../src/modules/knowledge/knowledge.service';
import { slugify } from '../../src/modules/knowledge/knowledge.links';
import { getSupabaseAdmin } from '../../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

async function main(): Promise<void> {
    const admin = getSupabaseAdmin();
    const c = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
    });
    if (c.error && !c.error.message.includes('already been registered'))
        throw new Error(c.error.message);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const db = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const si = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (si.error) throw new Error(si.error.message);

    const pasta = await criarPastaCom(db, `Ops FP ${Date.now() % 100000}`);
    const slug = slugify('Nota Ops FP');
    await escreverNotaCom(db, { title: 'Nota Ops FP', content_md: '# x', links: [], reason: 'p' });

    // Mover para a pasta.
    await moverNotaCom(db, slug, pasta.id);
    let notas = await listarKnowledgeCom(db);
    const eixo1 = notas.find((n) => n.slug === slug)?.folderId === pasta.id;
    console.log(`${eixo1 ? '✅' : '❌'} eixo 1 — mover: a nota ficou na pasta`);

    // Mover de volta à raiz.
    await moverNotaCom(db, slug, null);
    notas = await listarKnowledgeCom(db);
    const eixo2 = (notas.find((n) => n.slug === slug)?.folderId ?? null) === null;
    console.log(`${eixo2 ? '✅' : '❌'} eixo 2 — mover: a nota voltou à raiz`);

    // Renomear a pasta.
    await renomearPastaCom(db, pasta.id, 'Ops FP Renomeada');
    const pastas = await listarPastasCom(db);
    const eixo3 = pastas.find((p) => p.id === pasta.id)?.name === 'Ops FP Renomeada';
    console.log(`${eixo3 ? '✅' : '❌'} eixo 3 — renomear pasta: nome atualizado`);

    const ok = eixo1 && eixo2 && eixo3;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
