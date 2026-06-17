import { createClient } from '@supabase/supabase-js';

import { criarPastaCom, listarPastasCom } from '../../src/modules/folders/folders.service';
import { construirArvore } from '../../src/modules/folders/folders.tree';
import { escreverNotaCom, listarKnowledgeCom } from '../../src/modules/knowledge/knowledge.service';
import { slugify } from '../../src/modules/knowledge/knowledge.links';
import { getSupabaseAdmin } from '../../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

async function main(): Promise<void> {
    const admin = getSupabaseAdmin();
    const created = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
    });
    if (created.error && !created.error.message.includes('already been registered')) {
        throw new Error(`createUser: ${created.error.message}`);
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.');
    const db = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signIn.error) throw new Error(`signIn: ${signIn.error.message}`);
    const userId = signIn.data.user.id;

    // Cria uma pasta + uma nota, e põe a nota na pasta (update direto do folder_id).
    const nomePasta = `Projetos FP ${Date.now() % 100000}`;
    const pasta = await criarPastaCom(db, nomePasta);
    const slugNota = slugify('Nota Em Pasta FP');
    await escreverNotaCom(db, {
        title: 'Nota Em Pasta FP',
        content_md: '# x',
        links: [],
        reason: 'p',
    });
    const upd = await db
        .from('knowledge')
        .update({ folder_id: pasta.id })
        .eq('owner_id', userId)
        .eq('slug', slugNota);
    if (upd.error) throw new Error(`mover nota: ${upd.error.message}`);

    const pastas = await listarPastasCom(db);
    const notas = await listarKnowledgeCom(db);
    const arvore = construirArvore(
        pastas,
        notas.map((n) => ({
            id: n.id,
            slug: n.slug,
            title: n.title,
            folderId: n.folderId ?? null,
        })),
    );

    const noPasta = arvore.raizPastas.find((p) => p.pasta.id === pasta.id);
    const eixo1 = !!noPasta;
    console.log(`${eixo1 ? '✅' : '❌'} eixo 1 — pasta criada aparece na raiz da árvore`);

    const eixo2 = !!noPasta && noPasta.notas.some((n) => n.slug === slugNota);
    console.log(`${eixo2 ? '✅' : '❌'} eixo 2 — a nota aninha dentro da pasta`);

    const eixo3 = !arvore.raizNotas.some((n) => n.slug === slugNota);
    console.log(`${eixo3 ? '✅' : '❌'} eixo 3 — a nota já não está na raiz`);

    const ok = eixo1 && eixo2 && eixo3;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
