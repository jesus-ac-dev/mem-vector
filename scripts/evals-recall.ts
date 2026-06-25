import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '../src/lib/supabase-admin';
import { escreverNotaCom } from '../src/modules/knowledge/knowledge.service';
import { embedQuery } from '../src/lib/embeddings';
import { relevantSources, type Source } from '../src/modules/chat/chat.prompt';
import { recallAtK, janelaSeparacao, type ResultadoQuery } from '../src/lib/evals-recall';

// Mede o recall do chat RAG (match_chunks_hybrid + relevantSources) contra um KB
// fixo e queries rotuladas à mão. Medição-primeiro: imprime, não faz falhar.
// Sem `generate` → $0 (só embeddings locais). Spec: docs/superpowers/specs/2026-06-25.

process.loadEnvFile('.env.local');
const K = 5;

// KB fixo: 10 notas de tópicos distintos e inequívocos (1 parágrafo cada).
const NOTAS: { titulo: string; conteudo: string }[] = [
    {
        titulo: 'Fotossíntese',
        conteudo:
            'A fotossíntese é o processo pelo qual as plantas convertem luz solar, água e dióxido de carbono em glicose e oxigénio. Ocorre nos cloroplastos, onde a clorofila capta a energia da luz.',
    },
    {
        titulo: 'Café',
        conteudo:
            'O café é uma bebida preparada a partir de grãos torrados e moídos. Contém cafeína, um estimulante que reduz a sensação de cansaço. Um expresso faz-se passando água quente sob pressão pelo café moído.',
    },
    {
        titulo: 'Lisboa',
        conteudo:
            'Lisboa é a capital de Portugal, situada na foz do rio Tejo. É conhecida pelas suas sete colinas, os elétricos amarelos e o bairro de Alfama.',
    },
    {
        titulo: 'Closures em JavaScript',
        conteudo:
            'Uma closure em JavaScript é uma função que guarda acesso às variáveis do scope onde foi criada, mesmo depois de esse scope ter terminado. É a base de padrões como módulos privados e fábricas de funções.',
    },
    {
        titulo: 'Marés',
        conteudo:
            'As marés são a subida e descida periódica do nível do mar, causadas sobretudo pela atração gravitacional da Lua e, em menor grau, do Sol. Há duas marés altas e duas baixas por dia.',
    },
    {
        titulo: 'Vulcões',
        conteudo:
            'Um vulcão é uma abertura na crosta terrestre por onde sobe magma. Quando entra em erupção, expele lava, gases e cinzas. O magma forma-se pela fusão de rocha no manto sob alta temperatura e pressão.',
    },
    {
        titulo: 'Abelhas',
        conteudo:
            'As abelhas recolhem néctar das flores e transformam-no em mel dentro da colmeia. Ao visitarem as flores, transportam pólen e fazem a polinização, essencial para muitas culturas agrícolas.',
    },
    {
        titulo: 'Xadrez',
        conteudo:
            'O xadrez é um jogo de tabuleiro para dois jogadores, com 64 casas e seis tipos de peças. Ganha-se dando xeque-mate: atacar o rei adversário sem que ele tenha como escapar.',
    },
    {
        titulo: 'ADN',
        conteudo:
            'O ADN é a molécula que guarda a informação genética dos seres vivos, organizada em genes. Tem a forma de uma dupla hélice, com duas cadeias enroladas ligadas por pares de bases.',
    },
    {
        titulo: 'Bússola',
        conteudo:
            'A bússola é um instrumento de navegação com uma agulha magnetizada que aponta para o norte magnético da Terra. Foi essencial para a navegação marítima antes do GPS.',
    },
];

// Queries rotuladas: cada relevante aponta o TÍTULO da nota esperada.
const RELEVANTES: { query: string; notaEsperada: string }[] = [
    { query: 'Como é que as plantas produzem oxigénio?', notaEsperada: 'Fotossíntese' },
    { query: 'O que transforma a luz solar em energia nas plantas?', notaEsperada: 'Fotossíntese' },
    { query: 'Que substância no café nos mantém acordados?', notaEsperada: 'Café' },
    { query: 'Como se prepara um expresso?', notaEsperada: 'Café' },
    { query: 'Qual é a capital de Portugal?', notaEsperada: 'Lisboa' },
    { query: 'Que rio passa pela capital portuguesa?', notaEsperada: 'Lisboa' },
    { query: 'O que é uma closure em programação?', notaEsperada: 'Closures em JavaScript' },
    {
        query: 'Porque é que uma função guarda as variáveis do scope onde nasceu?',
        notaEsperada: 'Closures em JavaScript',
    },
    { query: 'Porque é que o mar sobe e desce ao longo do dia?', notaEsperada: 'Marés' },
    { query: 'Qual é a relação entre a Lua e o nível do mar?', notaEsperada: 'Marés' },
    { query: 'De onde vem a lava de uma erupção?', notaEsperada: 'Vulcões' },
    { query: 'Como é que se produz mel?', notaEsperada: 'Abelhas' },
    { query: 'Como se ganha uma partida ao adversário no tabuleiro de 64 casas?', notaEsperada: 'Xadrez' },
    { query: 'Que molécula em dupla hélice guarda os genes?', notaEsperada: 'ADN' },
    { query: 'Que instrumento aponta para o norte magnético?', notaEsperada: 'Bússola' },
];

const IRRELEVANTES: string[] = [
    'Qual é a taxa de juro do banco central europeu?',
    'Como se preenche uma declaração de IRS?',
    'Quem ganhou o campeonato do mundo de futebol de 2022?',
    'Qual é a cotação do bitcoin hoje?',
    'Como se muda o óleo do motor de um carro?',
];

async function novoUtilizador(): Promise<SupabaseClient> {
    const email = `eval-recall-${randomUUID().slice(0, 8)}@mem-vector.local`;
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.createUser({
        email,
        password: 'pw-eval-123',
        email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error: e2 } = await db.auth.signInWithPassword({ email, password: 'pw-eval-123' });
    if (e2) throw new Error(`signIn: ${e2.message}`);
    return db;
}

async function correrQuery(
    db: SupabaseClient,
    query: string,
    notaEsperadaId: string | null,
    notaEsperadaTitulo: string | null,
): Promise<ResultadoQuery> {
    const emb = await embedQuery(query);
    const { data, error } = await db.rpc('match_chunks_hybrid', {
        query_embedding: JSON.stringify(emb),
        query_text: query,
        match_count: K,
    });
    if (error) throw new Error(`match_chunks_hybrid: ${error.message}`);
    const sources = (data ?? []) as Source[];

    // chunk id → entity_id (a nota dona do chunk), como o enriquecerSourcesComMetadata.
    const ids = sources.map((s) => s.id).filter((x): x is string => Boolean(x));
    const entidadePorChunk = new Map<string, string>();
    if (ids.length) {
        const { data: rows } = await db.from('chunks').select('id, metadata').in('id', ids);
        for (const row of rows ?? []) {
            const eid = (row.metadata as { entity_id?: string } | null)?.entity_id;
            if (eid) entidadePorChunk.set(String(row.id), eid);
        }
    }

    const idx = notaEsperadaId
        ? sources.findIndex((s) => s.id && entidadePorChunk.get(s.id) === notaEsperadaId)
        : -1;
    const mantidas = relevantSources(sources);
    const mantida = notaEsperadaId
        ? mantidas.some((s) => s.id && entidadePorChunk.get(s.id) === notaEsperadaId)
        : mantidas.length === 0; // irrelevante bem tratada = nada sobrevive ao corte

    return {
        query,
        notaEsperada: notaEsperadaTitulo,
        rank: idx >= 0 ? idx + 1 : null,
        simEsperada: idx >= 0 ? sources[idx].similarity : (sources[0]?.similarity ?? null),
        topSim: sources[0]?.similarity ?? null,
        mantida,
    };
}

async function main(): Promise<void> {
    const db = await novoUtilizador();

    const idPorTitulo = new Map<string, string>();
    for (const n of NOTAS) {
        const r = await escreverNotaCom(
            db,
            {
                title: n.titulo,
                content_md: `# ${n.titulo}\n\n${n.conteudo}`,
                links: [],
                reason: 'seed eval recall',
            },
            'user',
        );
        idPorTitulo.set(n.titulo, r.id);
    }

    const resultados: ResultadoQuery[] = [];
    for (const rel of RELEVANTES) {
        const id = idPorTitulo.get(rel.notaEsperada);
        if (!id) throw new Error(`nota esperada não semeada: ${rel.notaEsperada}`);
        resultados.push(await correrQuery(db, rel.query, id, rel.notaEsperada));
    }
    for (const q of IRRELEVANTES) resultados.push(await correrQuery(db, q, null, null));

    console.log('\n═══════════ EVALS DE RECALL ═══════════');
    console.log('rank | sim   | @0.78 | query → nota esperada');
    for (const r of resultados) {
        const sim = r.simEsperada !== null ? r.simEsperada.toFixed(3) : '  -  ';
        const rk = r.rank !== null ? String(r.rank) : r.notaEsperada ? '✗' : '·';
        const keep = r.notaEsperada ? (r.mantida ? '✓' : '✗') : r.mantida ? 'dropd' : 'KEPT';
        console.log(
            `${rk.padStart(4)} | ${sim} | ${keep.padStart(5)} | ${r.query}${r.notaEsperada ? ` → ${r.notaEsperada}` : ' (irrelevante)'}`,
        );
    }

    const relev = resultados.filter((r) => r.notaEsperada !== null);
    const irrel = resultados.filter((r) => r.notaEsperada === null);
    const simsRel = relev.map((r) => r.simEsperada).filter((s): s is number => s !== null);
    const simsIrr = irrel.map((r) => r.topSim).filter((s): s is number => s !== null);
    const mantidasRel = relev.filter((r) => r.mantida).length;
    const irrelOk = irrel.filter((r) => r.mantida).length;
    const js = janelaSeparacao(simsRel, simsIrr);

    console.log('\n─────────── RESUMO ───────────');
    console.log(
        `recall@${K}         = ${(recallAtK(resultados, K) * 100).toFixed(0)}%  (${relev.filter((r) => r.rank !== null && r.rank <= K).length}/${relev.length})`,
    );
    console.log(
        `relevantes mantidas = ${((mantidasRel / relev.length) * 100).toFixed(0)}%  (${mantidasRel}/${relev.length})`,
    );
    console.log(
        `irrelevantes OK     = ${((irrelOk / irrel.length) * 100).toFixed(0)}%  (${irrelOk}/${irrel.length})`,
    );
    console.log(
        `janela separação    = ${js.janela.toFixed(3)}  (minRel ${js.minRel.toFixed(3)} vs maxIrr ${js.maxIrr.toFixed(3)})`,
    );
    console.log(`corte sugerido      ≈ ${js.corteSugerido.toFixed(3)}  (atual: 0.780)`);
}

main().catch((e: unknown) => {
    console.error('❌', e);
    process.exit(1);
});
