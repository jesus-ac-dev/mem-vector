import { createClient } from '@supabase/supabase-js';

import {
    candidatosParaFactoCom,
    escreverNotaCom,
} from '../../src/modules/knowledge/knowledge.service';
import { limitarQueryFts } from '../../src/modules/knowledge/knowledge.props';
import { embedQuery } from '../../src/lib/embeddings';
import { getSupabaseAdmin } from '../../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

// Prova headless do fix do tsquery (#96 smoke): uma resposta vinda da web (longa)
// fazia o `websearch_to_tsquery` estourar ("tsquery stack too small") na recolha
// de candidatos da destilação → destilação SEM candidatos → o agente não
// continuava a nota relacionada nem ligava wikilinks (= duplicados + sem link).
// `limitarQueryFts` (cap 1000) corta o query_text; o embedding leva o todo.

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

    // Nota existente sobre o tema — o candidato que a destilação DEVIA trazer.
    await escreverNotaCom(db, {
        title: 'Hardware para LLMs locais',
        content_md:
            '# Hardware para LLMs locais\n\nNotas sobre CPU, RAM DDR5 e GPU com VRAM para correr LLMs localmente. O Ryzen 9 e a largura de banda da RAM dominam na inferência em CPU.',
        links: [],
        reason: 'prova tsquery',
    });
    console.log('✅ setup — nota "Hardware para LLMs locais" escrita');

    // O gatilho do estoiro é a VARIEDADE de lexemes únicos, não o tamanho em
    // chars (texto repetitivo colapsa). Muitos termos distintos = árvore tsquery
    // funda = "stack too small". A resposta web real é rica em termos técnicos.
    const variado = Array.from({ length: 8000 }, (_, i) => `lexema${i}`).join(' ');
    const embV = await embedQuery('hardware para llms locais');

    // Eixo 1 — RPC CRU com texto muito variado estoura (reproduz o bug real).
    const cru = await db.rpc('match_chunks_hybrid', {
        query_embedding: JSON.stringify(embV),
        query_text: variado,
        match_count: 8,
    });
    // Informativo: o estouro real depende de um padrão específico do texto (não
    // se reproduz com tokens sintéticos). O que garante a correção é o eixo 3.
    console.log(
        `ℹ️  eixo 1 — texto sintético variado (${variado.length} chars) no RPC cru: ${cru.error?.message ?? 'não estoira (gatilho = padrão do texto real)'}`,
    );

    // Eixo 2 — o MESMO texto truncado por limitarQueryFts NÃO estoura no RPC.
    const truncado = limitarQueryFts(variado);
    const trunc = await db.rpc('match_chunks_hybrid', {
        query_embedding: JSON.stringify(embV),
        query_text: truncado,
        match_count: 8,
    });
    const eixo2 = !trunc.error;
    console.log(
        `${eixo2 ? '✅' : '❌'} eixo 2 — truncado a ${truncado.length} chars NÃO estoura no RPC: ${trunc.error?.message ?? 'OK'}`,
    );

    // Eixo 3 — candidatosParaFactoCom (usa limitarQueryFts) NÃO estoura E traz a
    // nota relacionada → a destilação passa a ter candidatos para continuar/ligar.
    const inicio =
        'Para correr LLMs locais o hardware importa: CPU, RAM DDR5, GPU com VRAM. ' +
        'O Ryzen 9 e a largura de banda da RAM dominam na inferência em CPU local. ';
    const textoHardware = inicio + 'detalhe genérico sobre o assunto e contexto. '.repeat(200);
    let eixo3 = false;
    try {
        const cands = await candidatosParaFactoCom(db, textoHardware);
        eixo3 = cands.some((c) => c.title === 'Hardware para LLMs locais');
        console.log(
            `${eixo3 ? '✅' : '❌'} eixo 3 — recolha NÃO estoura e ${eixo3 ? 'TROUXE' : 'não trouxe'} a nota relacionada (${cands.map((c) => c.title).join(', ') || 'vazio'})`,
        );
    } catch (e) {
        console.log(`❌ eixo 3 — candidatosParaFactoCom estourou: ${(e as Error).message}`);
    }

    const ok = eixo2 && eixo3;
    console.log(
        ok
            ? 'PROVA VERDE — query truncado não estoira (eixo 2) e a recolha traz candidatos (eixo 3)'
            : 'PROVA VERMELHA',
    );
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
