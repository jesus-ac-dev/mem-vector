import { createClient } from '@supabase/supabase-js';

import { escreverNotaCom } from '../../src/modules/knowledge/knowledge.service';
import { relevantSources, type Source } from '../../src/modules/chat/chat.prompt';
import { embedQuery } from '../../src/lib/embeddings';
import { getSupabaseAdmin } from '../../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

// Prova headless da busca híbrida (pgvector + FTS + RRF):
//   1) escreve uma nota com um token raro (zk9-omega-attestation) diluído numa secção;
//   2) o híbrido recupera essa fonte e marca lexical=true;
//   3) o dense sozinho cortá-la-ia (relevantSources sem o flag lexical exclui-a);
//   4) numa query de conhecimento geral o token não contamina o contexto.
// Corre sob RLS real (anon autenticado), o mesmo caminho do chat.

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';
const TOKEN = 'e7c4a91f2b8d30569af1';

const toSources = (rows: unknown): Source[] => (rows ?? []) as Source[];
const temToken = (ss: Source[]): boolean => ss.some((s) => s.content.includes(TOKEN));

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

    // Eixo 1 — Escrita da nota com headings (vários chunks) e o token diluído.
    await escreverNotaCom(db, {
        title: 'Prova Hibrida',
        content_md: [
            '## Reconciliação',
            'Procedimento interno de reconciliação noturna entre extratos e movimentos para fecho contabilístico diário.',
            '',
            '## Runbook operacional',
            // Parágrafo longo: o token raro fica diluído no meio de muito texto
            // genérico, por isso o embedding médio afasta-se da query só-token,
            // mas o FTS continua a bater no lexema exato.
            'Este runbook descreve o fluxo completo de operações da equipa para o ' +
                'fecho mensal, incluindo a preparação dos ambientes, a validação das ' +
                'permissões de acesso, a verificação das filas de processamento, a ' +
                'monitorização dos tempos de resposta e a recolha de métricas de ' +
                'desempenho ao longo do dia. A equipa deve confirmar que todos os ' +
                'serviços auxiliares estão disponíveis, que as cópias de segurança ' +
                'correram sem erros e que os relatórios intermédios foram gerados. ' +
                `O passo de atestação usa o identificador ${TOKEN} para correlacionar ` +
                'os registos entre sistemas distintos. Depois disso, a equipa revê os ' +
                'avisos pendentes, documenta as exceções encontradas, comunica o estado ' +
                'aos responsáveis e arquiva o histórico para auditoria futura conforme ' +
                'as políticas internas de retenção e conformidade aplicáveis.',
            '',
            '## Notas',
            'Sem outras observações relevantes para este fluxo de trabalho.',
        ].join('\n'),
        links: [],
        reason: 'prova híbrida',
    });
    console.log('✅ eixo 1 — nota escrita (chunked por heading)');

    // Query com o termo exato.
    const qEmb = await embedQuery(TOKEN);

    const denseRes = await db.rpc('match_chunks', {
        query_embedding: JSON.stringify(qEmb),
        match_count: 5,
    });
    if (denseRes.error) throw new Error(`match_chunks: ${denseRes.error.message}`);
    const dense = toSources(denseRes.data);

    const hybRes = await db.rpc('match_chunks_hybrid', {
        query_embedding: JSON.stringify(qEmb),
        query_text: TOKEN,
        match_count: 5,
    });
    if (hybRes.error) throw new Error(`match_chunks_hybrid: ${hybRes.error.message}`);
    const hybrid = toSources(hybRes.data);

    const tokenChunk = hybrid.find((s) => s.content.includes(TOKEN));
    console.log(
        'chunk do token no híbrido:',
        tokenChunk
            ? { similarity: Number(tokenChunk.similarity.toFixed(3)), lexical: tokenChunk.lexical }
            : '(ausente)',
    );

    // Eixo 2 — O híbrido recupera o token e marca-o como lexical.
    const eixo2 = !!tokenChunk && tokenChunk.lexical === true && temToken(relevantSources(hybrid));
    console.log(`${eixo2 ? '✅' : '❌'} eixo 2 — híbrido recupera o token via lexical`);

    // Eixo 3 — O dense sozinho não traz o token (na janela comprimida do e5 o
    // ID de alta entropia cai fora do top-k dense); o híbrido recupera-o por FTS+RRF.
    const eixo3 = !temToken(relevantSources(dense)) && temToken(relevantSources(hybrid));
    console.log(
        `${eixo3 ? '✅' : '❌'} eixo 3 — dense@5 não traz o token; o híbrido (FTS+RRF) recupera-o`,
    );

    // Eixo 4 — Query de conhecimento geral não traz o token (sem contaminação).
    const qGeralEmb = await embedQuery('qual é a capital de França?');
    const geralRes = await db.rpc('match_chunks_hybrid', {
        query_embedding: JSON.stringify(qGeralEmb),
        query_text: 'qual é a capital de França?',
        match_count: 5,
    });
    if (geralRes.error) throw new Error(`match_chunks_hybrid geral: ${geralRes.error.message}`);
    const eixo4 = !temToken(relevantSources(toSources(geralRes.data)));
    console.log(`${eixo4 ? '✅' : '❌'} eixo 4 — query geral não contamina com o token`);

    const ok = eixo2 && eixo3 && eixo4;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
