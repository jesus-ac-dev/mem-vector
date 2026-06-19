// Probe #100 fatia 2: prova end-to-end que o stream agentic expõe os eventos
// tool_use → onFerramenta dispara com o nome real da tool (a narração por passo).
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '../../src/lib/supabase-admin';
import { responderComToolsCom } from '../../src/agent/responder-tools';

process.loadEnvFile('.env.local');

async function main(): Promise<void> {
    const email = `probe-tool-${randomUUID().slice(0, 8)}@mem-vector.local`;
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.createUser({
        email,
        password: 'pw-probe-123',
        email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error: e2 } = await db.auth.signInWithPassword({ email, password: 'pw-probe-123' });
    if (e2) throw new Error(`signIn: ${e2.message}`);

    const ferramentas: string[] = [];
    const r = await responderComToolsCom(
        db,
        'Procura nas minhas notas o que houver e diz-me em uma frase curta.',
        undefined, // webKey
        undefined, // model
        () => {}, // onTextDelta (ignora o texto, só nos interessa a narração)
        (nome) => {
            ferramentas.push(nome);
            console.log('🔧', nome);
        },
    );

    console.log(`\n--- ferramentas=${ferramentas.length} | resposta="${r.text.slice(0, 80)}" ---`);
    const ok = ferramentas.length > 0;
    console.log(
        ok ? '✅ onFerramenta DISPAROU (narração por passo viável)' : '❌ nenhuma tool detetada',
    );
    if (!ok) process.exit(1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
