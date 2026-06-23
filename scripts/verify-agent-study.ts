/** Verifica a importação do estudo de agentes: notas, chunks RAG e edges mortos. Read-only. */
import { createClient } from '@supabase/supabase-js';

import { esperarAuthHealth } from './auth-health';

process.loadEnvFile('.env.local');

const EMAIL = process.env.MEMVECTOR_IMPORT_EMAIL ?? 'dev@mem-vector.local';
const PASSWORD = process.env.MEMVECTOR_IMPORT_PASSWORD ?? 'dev-password-123';

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    await esperarAuthHealth(url);
    const db = createClient(url, anon, { auth: { persistSession: false } });
    const { error: e } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (e) throw new Error(e.message);

    const { data: folders } = await db.from('folders').select('id, name').eq('name', 'agents');
    const folder = (folders ?? [])[0];
    if (!folder) throw new Error('pasta agents não encontrada');

    const { data: notas } = await db
        .from('knowledge')
        .select('id, slug, title')
        .eq('folder_id', folder.id)
        .eq('archived', false);
    const ids = (notas ?? []).map((n) => n.id);
    console.log(`pasta agents: ${folder.id}`);
    console.log(`notas: ${ids.length}`);

    // espera a indexação async (chunks) até ~20s
    let chunks = 0;
    for (let i = 0; i < 10; i++) {
        const { count } = await db
            .from('chunks')
            .select('id', { count: 'exact', head: true })
            .eq('metadata->>entity_type', 'knowledge')
            .in('metadata->>entity_id', ids);
        chunks = count ?? 0;
        if (chunks > 0) break;
        await new Promise((r) => setTimeout(r, 2000));
    }
    console.log(`chunks RAG indexados: ${chunks}`);

    const { data: edges } = await db
        .from('edges')
        .select('from_id, to_slug, to_id, kind')
        .in('from_id', ids);
    const wikis = (edges ?? []).filter((x) => x.kind === 'wikilink');
    const mortos = wikis.filter((x) => !x.to_id);
    console.log(`edges wikilink a partir das notas: ${wikis.length}`);
    console.log(`edges MORTOS (to_id=null): ${mortos.length}`);
    if (mortos.length) {
        for (const m of mortos.slice(0, 20)) console.log(`  ✗ dead → ${m.to_slug}`);
    } else {
        console.log('  ✓ zero dead-links');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
