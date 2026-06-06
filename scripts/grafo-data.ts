import { createClient } from '@supabase/supabase-js';

import { escreverNotaCom, getNotaCom, grafoDadosCom } from '../src/modules/knowledge/knowledge.service';
import { slugify } from '../src/modules/knowledge/knowledge.links';
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

// Prova headless dos dados do grafo: nós = notas, arestas = wikilinks (edges
// resolvidos). Gama→[[delta]] dá um link com source/target certos.

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';
const SLUG_GAMA = slugify('Gama GrafoProva');
const SLUG_DELTA = slugify('Delta GrafoProva');

async function main(): Promise<void> {
    const admin = getSupabaseAdmin();
    const created = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
    if (created.error && !created.error.message.includes('already been registered')) {
        throw new Error(`createUser: ${created.error.message}`);
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.');
    const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const signIn = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signIn.error) throw new Error(`signIn: ${signIn.error.message}`);

    await escreverNotaCom(db, { title: 'Delta GrafoProva', content_md: '# Delta', links: [], reason: 'p' });
    await escreverNotaCom(db, {
        title: 'Gama GrafoProva',
        content_md: `# Gama\n\nLiga a [[${SLUG_DELTA}]].`,
        links: [],
        reason: 'p',
    });

    const gama = await getNotaCom(db, SLUG_GAMA);
    const delta = await getNotaCom(db, SLUG_DELTA);
    const grafo = await grafoDadosCom(db);

    const temNos =
        grafo.nodes.some((n) => n.slug === SLUG_GAMA) && grafo.nodes.some((n) => n.slug === SLUG_DELTA);
    console.log(`${temNos ? '✅' : '❌'} eixo 1 — nós das duas notas presentes (${grafo.nodes.length} nós)`);

    const temLink = grafo.links.some((l) => l.source === gama?.id && l.target === delta?.id);
    console.log(`${temLink ? '✅' : '❌'} eixo 2 — aresta Gama→Delta com source/target certos`);

    const semPendentes = grafo.links.every(
        (l) => grafo.nodes.some((n) => n.id === l.source) && grafo.nodes.some((n) => n.id === l.target),
    );
    console.log(`${semPendentes ? '✅' : '❌'} eixo 3 — nenhuma aresta pendente (extremos são nós)`);

    const ok = temNos && temLink && semPendentes;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
