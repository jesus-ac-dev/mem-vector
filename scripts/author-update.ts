import { createClient } from '@supabase/supabase-js';

import {
    escreverNotaCom,
    candidatosParaFactoCom,
    getNotaCom,
} from '../src/modules/knowledge/knowledge.service';
import { destilarResumirTurno } from '../src/modules/chat/chat.turno';
import { slugify } from '../src/modules/knowledge/knowledge.links';
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

// Prova headless do UPDATE-bias do agente-autor (o gap que o Carlos viu ao vivo):
//   1) escreve uma nota dona de um assunto;
//   2) um facto NOVO relacionado recupera essa nota como candidata;
//   3) a destilação CONTINUA a nota (mesmo slug) em vez de criar outra;
//   4) a escrita resultante é um UPDATE e não perde o conteúdo anterior.
// Assunto fresco (cães) para não colidir com os dados do smoke manual.

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';
const TITULO = 'Caes do Carlos';
const SLUG = slugify(TITULO);

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

    const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const signIn = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signIn.error || !signIn.data.user) {
        throw new Error(`signIn falhou: ${signIn.error?.message ?? 'sem user'}`);
    }

    // Passo 1 — a nota dona do assunto (sem idades).
    await escreverNotaCom(db, {
        title: TITULO,
        content_md: 'O Carlos tem dois cães: o Rex e o Bobi.',
        links: [],
        reason: 'prova update-bias',
    });

    // Facto novo relacionado.
    const question = 'o Rex tem 5 anos e o Bobi tem 3 anos';
    const answer = 'Registado: o Rex tem 5 anos e o Bobi tem 3 anos.';

    // Passo 2 — candidatos recuperam a nota dona.
    const candidatos = await candidatosParaFactoCom(db, `${question}\n${answer}`);
    console.log(
        'candidatos:',
        candidatos.map((c) => c.slug),
    );
    const eixo1 = candidatos.some((c) => c.slug === SLUG);
    console.log(`${eixo1 ? '✅' : '❌'} eixo 1 — a nota dona aparece como candidata`);

    // Passo 3 — a destilação CONTINUA a nota (mesmo slug) com os candidatos.
    const turno = await destilarResumirTurno(question, answer, candidatos);
    console.log('nota destilada:', turno.nota ? { title: turno.nota.title } : null);
    const continuou = !!turno.nota && slugify(turno.nota.title) === SLUG;
    console.log(`${continuou ? '✅' : '❌'} eixo 2 — continuou a nota existente (mesmo slug)`);

    const conteudo = turno.nota?.content_md ?? '';
    const integrou =
        /\b5\b/.test(conteudo) && /\b3\b/.test(conteudo) && /Rex/.test(conteudo) && /Bobi/.test(conteudo);
    console.log(`${integrou ? '✅' : '❌'} eixo 3 — integrou as idades sem perder o que já havia`);

    // Passo 4 — a escrita é UPDATE (diff não-nulo) e a nota final tem as idades.
    let eixo4 = false;
    if (turno.nota) {
        const res = await escreverNotaCom(db, { ...turno.nota }, 'agent');
        const nota = await getNotaCom(db, SLUG);
        eixo4 = res.diff !== null && /\b5\b/.test(nota?.contentMd ?? '') && /\b3\b/.test(nota?.contentMd ?? '');
    }
    console.log(`${eixo4 ? '✅' : '❌'} eixo 4 — escrita foi UPDATE e a nota final tem as idades`);

    const ok = eixo1 && continuou && integrou && eixo4;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
