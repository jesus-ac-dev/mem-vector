import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '../src/lib/supabase-admin';
import { executarDestilacaoTurnoCom } from '../src/modules/chat/chat.postturno';
import {
    escreverNotaCom,
    arquivarNotaPorIdCom,
    escreverNotaEmPastaCom,
} from '../src/modules/knowledge/knowledge.service';
import { criarPastaCom } from '../src/modules/folders/folders.service';
import { getDailyCom, hojeLisboa } from '../src/modules/daily/daily.service';
import type { TurnoDestilado } from '../src/modules/chat/chat.service';

process.loadEnvFile('.env.local');

// M2 (#38): suite de placement evals — os cenários que provaram o M0 a correr
// sozinhos, contra os DOIS caminhos da destilação, com utilizador fresco por
// cenário×modo. Mede o comportamento que define o fosso: guardar no sítio
// certo. Uso:
//   npm run evals                        → tudo (lento: o agentic custa ~1-2min/turno)
//   npm run evals -- --modo=oneshot      → só one-shot
//   npm run evals -- --cenario=sofia     → só um cenário
// A tabela final é o material de decisão da flag MEMVECTOR_AGENTIC_DISTILL.

type Modo = 'oneshot' | 'agentic';

interface Turno {
    q: string;
    a: string;
    // expectativa de tarefas (#21): nº de criadas/concluídas esperado ('qualquer' = sem assert)
    tarefasCriadas?: number | 'qualquer';
    tarefasConcluidas?: number | 'qualquer';
    // expectativa de placement deste turno:
    //  'create'        → nasce nota nova
    //  'continuar'     → atualiza a nota do turno anterior (mesmo slug)
    //  null            → sem escrita de nota
    //  'qualquer'      → sem assert (informativo)
    nota: 'create' | 'continuar' | null | 'qualquer';
    daily: boolean | 'qualquer'; // este turno deve registar daily?
}

interface Cenario {
    id: string;
    descricao: string;
    turnos: Turno[];
    // setup opcional antes dos turnos (seeds, arquivar, kernel...)
    setup?: (db: SupabaseClient) => Promise<void>;
    // checks finais sobre a BD (correm depois dos turnos)
    checksFinais?: (db: SupabaseClient, resultados: TurnoDestilado[]) => Promise<string[]>;
}

const REGEX_PROVENIENCIA = /declarado a \d{4}|o utilizador (disse|afirmou)|registado a \d{4}/i;

const CENARIOS: Cenario[] = [
    {
        id: 'sofia',
        descricao: 'create + 2 continuações (anáfora) + pergunta + trivial',
        turnos: [
            {
                q: 'O Carlos gosta da Sofia!',
                a: 'Registado: o Carlos gosta da Sofia.',
                nota: 'create',
                daily: true,
            },
            {
                q: 'Eles têm dois filhos juntos, o Lucas e o Filipe.',
                a: 'Registado: o Carlos e a Sofia têm dois filhos, o Lucas e o Filipe.',
                nota: 'continuar',
                daily: 'qualquer',
            },
            {
                q: 'O Lucas é o mais velho!',
                a: 'Registado: o Lucas é o mais velho.',
                nota: 'continuar',
                daily: 'qualquer',
            },
            {
                q: 'Quais são os filhos da Sofia?',
                a: 'Os filhos da Sofia são o Lucas e o Filipe.',
                nota: null,
                daily: 'qualquer',
            },
            { q: 'Obrigado!', a: 'De nada!', nota: null, daily: false },
        ],
        checksFinais: async (db, resultados) => {
            const problemas: string[] = [];
            const slug = resultados[0].nota?.slug;
            if (slug) {
                const { data } = await db
                    .from('knowledge')
                    .select('content_md')
                    .eq('slug', slug)
                    .single();
                const corpo = data?.content_md ?? '';
                if (REGEX_PROVENIENCIA.test(corpo))
                    problemas.push('estilo: carimbo de proveniência no corpo');
                if (!/lucas/i.test(corpo) || !/filipe/i.test(corpo))
                    problemas.push('conteúdo: filhos em falta na nota final');
            }
            return problemas;
        },
    },
    {
        id: 'mia',
        descricao: 'assunto novo + continuação (não contamina a nota da Sofia)',
        turnos: [
            {
                q: 'A minha gata Mia faz anos a 9 de setembro.',
                a: 'Registado: a Mia faz anos a 9 de setembro.',
                nota: 'create',
                daily: 'qualquer',
            },
            {
                q: 'A Mia tem medo de trovoada.',
                a: 'Registado: a Mia tem medo de trovoada.',
                nota: 'continuar',
                daily: 'qualquer',
            },
        ],
    },
    {
        id: 'hedge',
        descricao: 'declarativa com hedge regista na mesma',
        turnos: [
            {
                q: 'Acho que o João prefere reuniões de manhã.',
                a: 'Registado (assumi que é facto — se era pergunta, diz): o João prefere reuniões de manhã.',
                nota: 'create',
                daily: 'qualquer',
            },
        ],
    },
    {
        id: 'explicito',
        descricao: 'pedido explícito de registo',
        turnos: [
            {
                q: 'Regista isto: a chave do escritório fica na gaveta da entrada.',
                a: 'Registado: a chave do escritório fica na gaveta da entrada.',
                nota: 'create',
                daily: 'qualquer',
            },
        ],
    },
    {
        id: 'arquivada',
        descricao: 'facto sobre assunto arquivado: a arquivada fica intacta (#28)',
        setup: async (db) => {
            const r = await escreverNotaCom(db, {
                title: 'Projeto Zeta',
                content_md: '# Projeto Zeta\n\nO projeto Zeta está na fase 1.',
                links: [],
                reason: 'seed eval arquivada',
            });
            await arquivarNotaPorIdCom(db, r.id);
        },
        turnos: [
            {
                q: 'O projeto Zeta passou para a fase 2!',
                a: 'Registado: o projeto Zeta passou para a fase 2.',
                nota: 'qualquer',
                daily: 'qualquer',
            },
        ],
        checksFinais: async (db) => {
            // Nota: um duplicado não-arquivado com este slug é impossível pós-#30
            // (o upsert recusa alvo arquivado); o caminho bom é nota com OUTRO slug.
            const problemas: string[] = [];
            const { data } = await db
                .from('knowledge')
                .select('id, content_md, archived')
                .eq('slug', 'projeto-zeta');
            const arquivada = (data ?? []).find((n) => n.archived);
            if (!arquivada) problemas.push('arquivada desapareceu');
            else if (!arquivada.content_md.includes('fase 1'))
                problemas.push('arquivada foi reescrita');
            return problemas;
        },
    },
    {
        id: 'tarefas',
        descricao: 'pedido de ação cria tarefa; "já fiz" conclui; trivial não cria (#21)',
        turnos: [
            {
                q: 'Lembra-me de ligar ao contabilista amanhã de manhã.',
                a: 'Fica registado: ligar ao contabilista amanhã de manhã.',
                nota: 'qualquer',
                daily: 'qualquer',
                tarefasCriadas: 1,
                tarefasConcluidas: 0,
            },
            {
                q: 'Obrigado!',
                a: 'De nada!',
                nota: null,
                daily: false,
                tarefasCriadas: 0,
                tarefasConcluidas: 0,
            },
            {
                q: 'Já liguei ao contabilista, está tratado.',
                a: 'Boa — dou a tarefa como concluída.',
                nota: 'qualquer',
                daily: 'qualquer',
                tarefasCriadas: 0,
                tarefasConcluidas: 1,
            },
        ],
    },
    {
        id: 'kernel',
        descricao: 'regra do Kernel muda a escrita (bullets do daily com [K])',
        setup: async (db) => {
            const pasta = await criarPastaCom(db, 'Kernel');
            await escreverNotaEmPastaCom(
                db,
                {
                    title: 'Regras do agente',
                    content_md:
                        '# Regras do agente\n\nNo daily, começa OBRIGATORIAMENTE cada bullet com a tag [K] — ex.: "- [K] facto registado".',
                    links: [],
                    reason: 'seed eval kernel',
                },
                pasta.id,
                'agent',
            );
        },
        turnos: [
            {
                q: 'O fornecedor de café passa a entregar às terças.',
                a: 'Registado: o fornecedor de café entrega às terças.',
                nota: 'qualquer',
                daily: true,
            },
        ],
        checksFinais: async (db) => {
            const daily = await getDailyCom(db, hojeLisboa());
            return daily?.contentMd.includes('[K]') ? [] : ['kernel: marca [K] ausente do daily'];
        },
    },
];

interface ResultadoCenario {
    cenario: string;
    modo: Modo;
    pass: boolean;
    detalhes: string[];
    latenciaMediaS: number;
}

async function novoUtilizador(): Promise<SupabaseClient> {
    const email = `eval-${randomUUID().slice(0, 8)}@mem-vector.local`;
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

// Conversa real na BD: a janela de anáfora da destilação lê daqui, como no chat.
async function prepararConversa(db: SupabaseClient): Promise<string> {
    const {
        data: { user },
    } = await db.auth.getUser();
    const { data, error } = await db
        .from('conversations')
        .insert({ title: 'eval', owner_id: user!.id })
        .select('id')
        .single();
    if (error || !data) throw new Error(`criar conversa: ${error?.message}`);
    return String(data.id);
}

async function gravarTurnoNaConversa(
    db: SupabaseClient,
    conversationId: string,
    q: string,
    a: string,
): Promise<string[]> {
    const ids: string[] = [];
    for (const [role, content] of [
        ['user', q],
        ['assistant', a],
    ] as const) {
        const { data, error } = await db
            .from('messages')
            .insert({ conversation_id: conversationId, role, content })
            .select('id')
            .single();
        if (error || !data) throw new Error(`gravar mensagem: ${error?.message}`);
        ids.push(String(data.id));
    }
    return ids;
}

async function correrCenario(cenario: Cenario, modo: Modo): Promise<ResultadoCenario> {
    const db = await novoUtilizador();
    const detalhes: string[] = [];
    const resultados: TurnoDestilado[] = [];
    let latenciaTotal = 0;

    if (cenario.setup) await cenario.setup(db);
    const conversationId = await prepararConversa(db);

    const flagAntes = process.env.MEMVECTOR_AGENTIC_DISTILL;
    process.env.MEMVECTOR_AGENTIC_DISTILL = modo === 'agentic' ? '1' : '';
    try {
        let slugAnterior: string | null = null;
        for (const [i, turno] of cenario.turnos.entries()) {
            const excluirIds = await gravarTurnoNaConversa(db, conversationId, turno.q, turno.a);
            const t0 = Date.now();
            const r = await executarDestilacaoTurnoCom(db, turno.q, turno.a, {
                conversationId,
                excluirIds,
            });
            latenciaTotal += (Date.now() - t0) / 1000;
            resultados.push(r);

            // asserts de placement do turno
            if (turno.nota === 'create') {
                if (!r.nota) detalhes.push(`t${i + 1}: esperava criar nota, não escreveu`);
                else if (!r.nota.criada)
                    detalhes.push(`t${i + 1}: esperava criar, atualizou ${r.nota.slug}`);
            } else if (turno.nota === 'continuar') {
                if (!slugAnterior)
                    detalhes.push(
                        `t${i + 1}: precondição falhou (turno anterior não escreveu nota)`,
                    );
                else if (!r.nota) detalhes.push(`t${i + 1}: esperava continuar, não escreveu`);
                else if (r.nota.slug !== slugAnterior)
                    detalhes.push(
                        `t${i + 1}: esperava continuar ${slugAnterior}, foi para ${r.nota.slug} (criada=${r.nota.criada})`,
                    );
            } else if (turno.nota === null && r.nota) {
                detalhes.push(`t${i + 1}: não devia escrever nota, escreveu ${r.nota.slug}`);
            }
            if (turno.daily === true && !r.daily)
                detalhes.push(`t${i + 1}: esperava daily, não registou`);
            if (turno.daily === false && r.daily)
                detalhes.push(`t${i + 1}: turno trivial registou daily`);

            // tarefas (#21)
            const criadas = r.tarefas?.criadas.length ?? 0;
            const concluidas = r.tarefas?.concluidas.length ?? 0;
            if (typeof turno.tarefasCriadas === 'number' && criadas !== turno.tarefasCriadas)
                detalhes.push(
                    `t${i + 1}: esperava ${turno.tarefasCriadas} tarefa(s) criada(s), houve ${criadas}`,
                );
            if (
                typeof turno.tarefasConcluidas === 'number' &&
                concluidas !== turno.tarefasConcluidas
            )
                detalhes.push(
                    `t${i + 1}: esperava ${turno.tarefasConcluidas} concluída(s), houve ${concluidas}`,
                );

            if (r.nota) slugAnterior = r.nota.slug;
        }

        if (cenario.checksFinais) detalhes.push(...(await cenario.checksFinais(db, resultados)));
    } finally {
        if (flagAntes === undefined) delete process.env.MEMVECTOR_AGENTIC_DISTILL;
        else process.env.MEMVECTOR_AGENTIC_DISTILL = flagAntes;
    }

    return {
        cenario: cenario.id,
        modo,
        pass: detalhes.length === 0,
        detalhes,
        latenciaMediaS: latenciaTotal / cenario.turnos.length,
    };
}

function lerArg(nome: string): string | null {
    const arg = process.argv.find((a) => a.startsWith(`--${nome}=`));
    return arg ? arg.split('=')[1] : null;
}

async function main(): Promise<void> {
    const filtroCenario = lerArg('cenario');
    const filtroModo = lerArg('modo') as Modo | null;
    const cenarios = CENARIOS.filter((c) => !filtroCenario || c.id === filtroCenario);
    const modos: Modo[] = filtroModo ? [filtroModo] : ['oneshot', 'agentic'];

    const resultados: ResultadoCenario[] = [];
    for (const modo of modos) {
        for (const cenario of cenarios) {
            console.log(`▶ ${cenario.id} [${modo}] — ${cenario.descricao}`);
            try {
                const r = await correrCenario(cenario, modo);
                resultados.push(r);
                console.log(
                    `  ${r.pass ? '✅' : '❌'} ${r.latenciaMediaS.toFixed(1)}s/turno${r.detalhes.length ? ` — ${r.detalhes.join(' · ')}` : ''}`,
                );
            } catch (e) {
                resultados.push({
                    cenario: cenario.id,
                    modo,
                    pass: false,
                    detalhes: [`erro fatal: ${e instanceof Error ? e.message : e}`],
                    latenciaMediaS: 0,
                });
                console.log(`  💥 erro fatal: ${e instanceof Error ? e.message : e}`);
            }
        }
    }

    console.log('\n══════════ TABELA M2 ══════════');
    console.log('cenário      | one-shot | agentic  | notas');
    for (const c of cenarios) {
        const os = resultados.find((r) => r.cenario === c.id && r.modo === 'oneshot');
        const ag = resultados.find((r) => r.cenario === c.id && r.modo === 'agentic');
        const cel = (r?: ResultadoCenario) =>
            r ? `${r.pass ? 'PASS' : 'FAIL'} ${r.latenciaMediaS.toFixed(0)}s` : '   —   ';
        const obs = [...(os?.detalhes ?? []), ...(ag?.detalhes ?? [])].slice(0, 2).join(' · ');
        console.log(`${c.id.padEnd(12)} | ${cel(os).padEnd(8)} | ${cel(ag).padEnd(8)} | ${obs}`);
    }
    const falhas = resultados.filter((r) => !r.pass).length;
    console.log(
        `\n${falhas === 0 ? 'EVALS VERDES' : `${falhas} célula(s) vermelha(s)`} (${resultados.length} corridas)`,
    );
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
