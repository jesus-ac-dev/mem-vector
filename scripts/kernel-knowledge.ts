import { createClient } from '@supabase/supabase-js';

import { escreverNotaCom, getNotaCom } from '../src/modules/knowledge/knowledge.service';
import { embedQuery } from '../src/lib/embeddings';
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

// Prova headless ponta-a-ponta do kernel de conhecimento (fatia 1):
//   1) escrita de uma nota tipada (escreverNotaCom);
//   2) recuperação via match_chunks (RAG) sob sessão autenticada;
//   3) segunda escrita produz diff não-vazio;
//   4) getNotaCom devolve o conteúdo atualizado.
// Corre sob RLS real (cliente anon autenticado), o mesmo caminho do agente-autor.

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

async function main(): Promise<void> {
    // Garante o utilizador de dev (idempotente).
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
    if (!url || !anon) {
        throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY no ambiente.');
    }

    const db = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const signIn = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signIn.error || !signIn.data.user) {
        throw new Error(`signIn falhou: ${signIn.error?.message ?? 'sem user'}`);
    }

    // Eixo 1 — Escrita inicial.
    const r1 = await escreverNotaCom(db, {
        title: 'Prova Kernel',
        content_md: 'O kernel guarda notas tipadas ligadas por [[tdd]].',
        links: ['tdd'],
        reason: 'prova',
    });
    console.log('escrita 1:', r1.slug, 'diff:', r1.diff);
    const escrita1Ok = r1.slug === 'prova-kernel';
    console.log(`${escrita1Ok ? '✅' : '❌'} eixo 1 — escrita inicial`);

    // Eixo 2 — Retrieval via match_chunks.
    const q = await embedQuery('o que guarda o kernel?');
    const match = await db.rpc('match_chunks', {
        query_embedding: JSON.stringify(q),
        match_count: 5,
    });
    if (match.error) throw new Error(`match_chunks: ${match.error.message}`);
    const achou = (match.data ?? []).some((m: { content: string }) => m.content.includes('kernel guarda'));
    console.log('retrieval achou a nota?', achou);
    console.log(`${achou ? '✅' : '❌'} eixo 2 — RAG retrieval`);

    // Eixo 3 — Segunda escrita produz diff não-vazio.
    const r2 = await escreverNotaCom(db, {
        title: 'Prova Kernel',
        content_md: 'O kernel guarda notas tipadas, versionadas, ligadas por [[tdd]].',
        links: ['tdd'],
        reason: 'prova v2',
    });
    console.log('escrita 2:', r2.slug, 'diff:', JSON.stringify(r2.diff));
    const temDiff = !!r2.diff?.some((d) => d.op === 'add');
    console.log(`${temDiff ? '✅' : '❌'} eixo 3 — diff não-vazio na segunda escrita`);

    // Eixo 4 — getNotaCom devolve conteúdo atualizado.
    const nota = await getNotaCom(db, 'prova-kernel');
    const conteudoAtualizado = !!nota?.contentMd.includes('versionadas');
    console.log(`${conteudoAtualizado ? '✅' : '❌'} eixo 4 — getNotaCom conteúdo atualizado`);

    const ok = escrita1Ok && achou && temDiff && conteudoAtualizado;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
