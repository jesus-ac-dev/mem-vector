import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
    escreverNotaCom,
    listarKnowledgeCom,
    arquivarNotaCom,
    reporNotaCom,
    listarArquivadosCom,
} from '../../src/modules/knowledge/knowledge.service';
import { slugify } from '../../src/modules/knowledge/knowledge.links';
import { getSupabaseAdmin } from '../../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

async function contarChunks(db: SupabaseClient, entityId: string): Promise<number> {
    const { count, error } = await db
        .from('chunks')
        .select('id', { count: 'exact', head: true })
        .eq('metadata->>entity_id', entityId);
    if (error) throw new Error(error.message);
    return count ?? 0;
}

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

    const titulo = `Arquivo FP ${Date.now() % 100000}`;
    const slug = slugify(titulo);
    const nota = await escreverNotaCom(db, {
        title: titulo,
        content_md: `# ${titulo}\n\nlinha de conteúdo para gerar chunks.`,
        links: [],
        reason: 'p',
    });

    const chunksAntes = await contarChunks(db, nota.id);
    const eixo0 = chunksAntes > 0;
    console.log(
        `${eixo0 ? '✅' : '❌'} eixo 0 — a nota tem chunks antes de arquivar (${chunksAntes})`,
    );

    await arquivarNotaCom(db, slug);
    const ativas = await listarKnowledgeCom(db);
    const eixo1 = !ativas.some((n) => n.slug === slug);
    console.log(`${eixo1 ? '✅' : '❌'} eixo 1 — arquivada saiu do explorer (listarKnowledge)`);

    const chunksDepois = await contarChunks(db, nota.id);
    const eixo2 = chunksDepois === 0;
    console.log(
        `${eixo2 ? '✅' : '❌'} eixo 2 — arquivar apagou os chunks (RAG) (${chunksDepois})`,
    );

    const arq = await listarArquivadosCom(db);
    const eixo3 = arq.some((n) => n.slug === slug);
    console.log(`${eixo3 ? '✅' : '❌'} eixo 3 — aparece na lista de arquivados`);

    await reporNotaCom(db, slug);
    const ativas2 = await listarKnowledgeCom(db);
    const eixo4 = ativas2.some((n) => n.slug === slug);
    console.log(`${eixo4 ? '✅' : '❌'} eixo 4 — repor devolveu ao explorer`);

    const chunksRepor = await contarChunks(db, nota.id);
    const eixo5 = chunksRepor > 0;
    console.log(`${eixo5 ? '✅' : '❌'} eixo 5 — repor reindexou os chunks (RAG) (${chunksRepor})`);

    const ok = eixo0 && eixo1 && eixo2 && eixo3 && eixo4 && eixo5;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
