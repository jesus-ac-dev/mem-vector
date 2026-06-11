import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '../src/lib/supabase-admin';
import { destilarTurnoAgenticCom } from '../src/agent/destilar-agentic';
import { candidatosParaFactoCom } from '../src/modules/knowledge/knowledge.service';
import { classificarIntencao } from '../src/modules/chat/chat.intencao';

process.loadEnvFile('.env.local');

// Prova headless do caminho agentic da destilação (issue #27): a sessão CLI
// lê/escreve via tools MCP sob RLS real — o mesmo fluxo do job com a flag
// MEMVECTOR_AGENTIC_DISTILL=1, sem UI. Três eixos, espelho dos smokes da Sofia:
//   eixo 1 — saudação trivial: ZERO escritas (nem nota, nem daily);
//   eixo 2 — facto durável SEM pedido explícito: escreve nota + daily (proativo);
//   eixo 3 — facto novo sobre o MESMO assunto, com candidatas: CONTINUA a nota
//            do eixo 2 (mesmo slug, criada=false), não cria duplicado.

// Utilizador fresco por corrida: com workspace já povoado, o agente lê a nota
// e conclui (bem) que o facto já está registado — a prova ficava vermelha por
// inteligência, não por bug. Workspace vazio = corridas comparáveis.
const EMAIL = `prova-agentic-${randomUUID().slice(0, 8)}@mem-vector.local`;
const PASSWORD = 'dev-password-123';

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
    if (!url || !anon) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY no ambiente.');

    const db = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signIn.error || !signIn.data.user) {
        throw new Error(`signIn falhou: ${signIn.error?.message ?? 'sem user'}`);
    }

    // Eixo 1 — trivial: o agente não escreve nada.
    const trivial = await destilarTurnoAgenticCom(db, {
        question: 'olá, tudo bem?',
        answer: 'Tudo ótimo, em que posso ajudar hoje?',
    });
    const eixo1 = trivial.nota === null && trivial.daily === null;
    console.log(`${eixo1 ? '✅' : '❌'} eixo 1 — trivial: zero escritas`, JSON.stringify(trivial));

    // Eixo 2 — facto durável sem pedido explícito: escreve proativamente.
    const q2 = 'a minha gata Mia faz anos a 9 de setembro';
    const a2 = 'Boa, a Mia faz anos no fim do verão então.';
    const proativo = await destilarTurnoAgenticCom(db, {
        question: q2,
        answer: a2,
        candidatos: await candidatosParaFactoCom(db, `${q2}\n${a2}`),
        intencao: classificarIntencao(q2),
    });
    const eixo2 = proativo.nota !== null && proativo.daily !== null;
    console.log(
        `${eixo2 ? '✅' : '❌'} eixo 2 — facto durável: nota + daily`,
        JSON.stringify(proativo),
    );

    // Eixo 3 — mesmo assunto, com candidatas: continua a nota, não duplica.
    const q3 = 'a Mia tem medo de trovoada';
    const a3 = 'Registado, faz sentido dar-lhe um sítio para se esconder.';
    const continuar = await destilarTurnoAgenticCom(db, {
        question: q3,
        answer: a3,
        candidatos: await candidatosParaFactoCom(db, `${q3}\n${a3}`),
        intencao: classificarIntencao(q3),
        historico: [
            { role: 'user', content: q2 },
            { role: 'assistant', content: a2 },
        ],
    });
    const eixo3 =
        continuar.nota !== null &&
        continuar.nota.slug === proativo.nota?.slug &&
        !continuar.nota.criada;
    console.log(`${eixo3 ? '✅' : '❌'} eixo 3 — continua a nota dona`, JSON.stringify(continuar));

    const ok = eixo1 && eixo2 && eixo3;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
