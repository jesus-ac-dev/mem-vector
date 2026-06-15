import { createClient } from '@supabase/supabase-js';

import {
    escreverNotaCom,
    getNotaCom,
    backlinksDeCom,
    forwardLinksDeCom,
} from '../src/modules/knowledge/knowledge.service';
import { extrairOutline } from '../src/lib/outline';
import { slugify } from '../src/modules/knowledge/knowledge.links';
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

// Prova headless dos dados da barra da direita: backlinks, forward links e outline.
// Alfa liga [[beta]] → backlink de Beta = Alfa; forward de Alfa = Beta (existe);
// outline de Alfa = os seus headings.

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';
const SLUG_ALFA = slugify('Alfa SidebarProva');
const SLUG_BETA = slugify('Beta SidebarProva');

async function main(): Promise<void> {
    const admin = getSupabaseAdmin();
    const created = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
    });
    if (created.error && !created.error.message.includes('already been registered')) {
        throw new Error(`createUser falhou: ${created.error.message}`);
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.');
    const db = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signIn.error) throw new Error(`signIn: ${signIn.error.message}`);

    await escreverNotaCom(db, {
        title: 'Beta SidebarProva',
        content_md: '# Beta',
        links: [],
        reason: 'p',
    });
    await escreverNotaCom(db, {
        title: 'Alfa SidebarProva',
        content_md: `# Alfa\n\nLiga a [[${SLUG_BETA}]] e a um [[fantasma-sidebarprova]].\n\n## Secção dois\ncorpo`,
        links: [],
        reason: 'p',
    });

    const backBeta = await backlinksDeCom(db, SLUG_BETA);
    console.log(
        'backlinks de beta:',
        backBeta.map((n) => n.slug),
    );
    const eixo1 = backBeta.some((n) => n.slug === SLUG_ALFA);
    console.log(`${eixo1 ? '✅' : '❌'} eixo 1 — backlink de Beta inclui Alfa`);

    const alfa = await getNotaCom(db, SLUG_ALFA);
    const fwd = alfa ? await forwardLinksDeCom(db, alfa.id) : [];
    console.log('forward de alfa:', fwd);
    const eixo2 =
        fwd.some((l) => l.slug === SLUG_BETA && l.existe) &&
        fwd.some((l) => l.slug === 'fantasma-sidebarprova' && !l.existe);
    console.log(
        `${eixo2 ? '✅' : '❌'} eixo 2 — forward de Alfa: Beta (existe) + fantasma (quebrado)`,
    );

    const outline = extrairOutline(alfa?.contentMd ?? '');
    console.log(
        'outline de alfa:',
        outline.map((h) => `${h.nivel}:${h.texto}`),
    );
    const eixo3 =
        outline.some((h) => h.texto === 'Alfa' && h.nivel === 1) &&
        outline.some((h) => h.texto === 'Secção dois' && h.nivel === 2);
    console.log(`${eixo3 ? '✅' : '❌'} eixo 3 — outline de Alfa tem os headings`);

    const ok = eixo1 && eixo2 && eixo3;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
