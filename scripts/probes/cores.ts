import { createClient } from '@supabase/supabase-js';

import {
    escreverNotaCom,
    moverNotaCom,
    grafoDadosCom,
} from '../../src/modules/knowledge/knowledge.service';
import { criarPastaCom, definirCorPastaCom } from '../../src/modules/folders/folders.service';
import { substituirDailyCom, definirCorDailyCom } from '../../src/modules/daily/daily.service';
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

    const COR = '#3b82f6';
    const COR_D = '#ef4444';

    // Pasta com cor + nota nessa pasta.
    const pasta = await criarPastaCom(db, `Cores FP ${Date.now() % 100000}`);
    await definirCorPastaCom(db, pasta.id, COR);
    const titulo = `Nota Cores FP ${Date.now() % 100000}`;
    const slug = slugify(titulo);
    const nota = await escreverNotaCom(db, {
        title: titulo,
        content_md: `# ${titulo}`,
        links: [],
        reason: 'p',
    });
    await moverNotaCom(db, slug, pasta.id);

    // Daily com [[link]] para a nota + cor de daily.
    await definirCorDailyCom(db, COR_D);
    const dia = '2099-01-01';
    await substituirDailyCom(db, dia, `# ${dia}\n\nver [[${titulo}]]`, 'user');

    const grafo = await grafoDadosCom(db);
    const noNota = grafo.nodes.find((n) => n.id === nota.id);
    const noDaily = grafo.nodes.find((n) => n.group === 'daily' && n.slug === dia);

    const eixo1 = noNota?.color === COR;
    console.log(
        `${eixo1 ? '✅' : '❌'} eixo 1 — nó knowledge tem a cor da pasta (${noNota?.color})`,
    );

    const eixo2 = !!noDaily && noDaily.color === COR_D;
    console.log(
        `${eixo2 ? '✅' : '❌'} eixo 2 — nó daily presente com a cor daily (${noDaily?.color})`,
    );

    const eixo3 =
        !!noNota &&
        !!noDaily &&
        grafo.links.some((l) => l.source === noDaily.id && l.target === noNota.id);
    console.log(`${eixo3 ? '✅' : '❌'} eixo 3 — aresta daily → nota (edge de daily criada)`);

    const ok = eixo1 && eixo2 && eixo3;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
