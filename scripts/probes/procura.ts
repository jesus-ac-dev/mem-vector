import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

import { escreverNotaCom } from '../../src/modules/knowledge/knowledge.service';
import { procurarTextoCom } from '../../src/modules/procura/procura.service';
import { indexarMensagensChatCom } from '../../src/modules/chat/chat.indexing';
import { getSupabaseAdmin } from '../../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

// Prova headless da procura full-text (#91, modo Texto): cobre os DOIS ramos —
// knowledge (nota) e chat (conversa). O ramo chat resolve o título via
// conversations.title (o bug que o Audit apanhou: era `titulo`).

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';
const TERMO = 'zirconioattestation9z';
const TERMO_CHAT = 'kriptonitaconversa7x';

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
    if (signIn.error || !signIn.data.user) throw new Error(`signIn: ${signIn.error?.message}`);
    const ownerId = signIn.data.user.id;

    // Ramo knowledge.
    await escreverNotaCom(db, {
        title: 'Procura Teste Backend',
        content_md: `# Procura Teste Backend\n\nNota com o termo raro ${TERMO} para a procura encontrar.`,
        links: [],
        reason: 'prova procura',
    });
    const resK = await procurarTextoCom(db, TERMO);
    const achouK = resK.some((r) => r.tipo === 'knowledge' && r.titulo === 'Procura Teste Backend');
    console.log(`${achouK ? '✅' : '❌'} knowledge — encontra a nota pelo termo`);

    // Ramo chat — resolve o título via conversations.title (o bug do Audit).
    const conv = await db
        .from('conversations')
        .insert({ owner_id: ownerId, title: 'Conversa Teste Procura' })
        .select('id')
        .single();
    if (conv.error || !conv.data) throw new Error(`criar conversa: ${conv.error?.message}`);
    await indexarMensagensChatCom(db, {
        ownerId,
        conversationId: conv.data.id,
        messages: [
            {
                conversationId: conv.data.id,
                messageId: randomUUID(),
                role: 'user',
                content: `mensagem com o termo ${TERMO_CHAT} para a procura encontrar`,
                createdAt: new Date().toISOString(),
            },
        ],
    });
    const resC = await procurarTextoCom(db, TERMO_CHAT);
    const achouC = resC.some((r) => r.tipo === 'chat' && r.titulo === 'Conversa Teste Procura');
    console.log(
        `${achouC ? '✅' : '❌'} chat — encontra a conversa e resolve o título (${resC.map((r) => `${r.tipo}:${r.titulo}`).join(', ') || 'vazio'})`,
    );

    // Sanidade: termo inexistente → sem resultados.
    const vazio = (await procurarTextoCom(db, 'xptoinexistente0000')).length === 0;
    console.log(`${vazio ? '✅' : '❌'} termo inexistente → sem resultados`);

    const ok = achouK && achouC && vazio;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
