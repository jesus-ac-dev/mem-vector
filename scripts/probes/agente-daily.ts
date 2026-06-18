import { createClient } from '@supabase/supabase-js';

import { responderComToolsCom } from '../../src/agent/responder-tools';

process.loadEnvFile('.env.local');

// Prova e2e do #85 fatia 2 (bug #87): o agente escalado, perante "o que fiz
// ontem?", chama ler_daily("ontem") e traz a daily — em vez de dizer "não há"
// (o RAG por semelhança falhava em datas). Dev user tem a daily de ontem.
const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

async function main(): Promise<void> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.');

    const db = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signIn.error) throw new Error(`signIn falhou: ${signIn.error.message}`);

    const r = await responderComToolsCom(
        db,
        'PERGUNTA DO UTILIZADOR: O que fiz ontem? Usa as tools para ir buscar a daily de ontem.',
    );
    console.log('\n--- resposta ---\n' + r.text + '\n----------------');
    const negou = /não\s+(há|tenho|existe)|sem\s+registo/i.test(r.text);
    const ok = !negou && r.text.length > 40;
    console.log(`\n${ok ? '✅ OK' : '❌ FALHOU'} — o agente ${negou ? 'NEGOU (bug)' : 'trouxe conteúdo'} (custo $${r.costUsd.toFixed(3)})`);
    process.exit(ok ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
