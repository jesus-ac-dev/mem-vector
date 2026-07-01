import { createClient } from '@supabase/supabase-js';

import { lerEventosRelayCom, registarEventoRelayCom } from '../../src/modules/relay/relay.eventos';
import {
    guardarSteeringCom,
    lerSteeringParaConsumoCom,
    lerSteeringPendenteCom,
    marcarSteeringConsumidoCom,
} from '../../src/modules/relay/relay.steering';

process.loadEnvFile('.env.local');

// Prova e2e do #129 (corrida transparente): sob a sessão RLS real do dev user,
// (1) o steering guarda→pendente→consumido com fase/ronda; (2) os eventos gravam
// e voltam em ordem cronológica com custo/veredito. Usa um repo/issue fictícios
// para não poluir cartões reais; as linhas ficam no workspace dev (sem policy de
// delete — por desenho, o stream é append-only).
const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';
const REPO = 'probe/relay-corrida';
const ISSUE = 999901;

function ok(cond: boolean, eixo: string): boolean {
    console.log(`${cond ? '✅' : '❌'} ${eixo}`);
    return cond;
}

async function main(): Promise<void> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.');

    const db = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signIn.error) throw new Error(`signIn falhou: ${signIn.error.message}`);

    const runId = crypto.randomUUID();
    let tudo = true;

    // Eixo 1: steering guarda → pendente.
    const guardado = await guardarSteeringCom(db, {
        repo: REPO,
        issue: ISSUE,
        texto: `probe ${runId.slice(0, 8)}: usa a tabela nova`,
    });
    tudo = ok(guardado.ok, 'steering guardado') && tudo;
    const pendentes = await lerSteeringPendenteCom(db, { repo: REPO, issue: ISSUE });
    tudo = ok(pendentes.length >= 1, `steering pendente visível (${pendentes.length})`) && tudo;

    // Eixo 2: consumo em 2 tempos — ler devolve id+texto (sem marcar), marcar
    // esvazia as pendentes (fase/ronda gravadas).
    const paraConsumo = await lerSteeringParaConsumoCom(db, { repo: REPO, issue: ISSUE });
    tudo =
        ok(
            paraConsumo.some((p) => p.texto.includes('tabela nova')),
            'steering lido para consumo',
        ) && tudo;
    await marcarSteeringConsumidoCom(db, {
        ids: paraConsumo.map((p) => p.id),
        fase: 'dev',
        ronda: 1,
    });
    const aposConsumo = await lerSteeringPendenteCom(db, { repo: REPO, issue: ISSUE });
    tudo = ok(aposConsumo.length === 0, 'pendentes esvaziadas após consumo') && tudo;

    // Eixo 3: eventos gravam e voltam em ordem cronológica.
    await registarEventoRelayCom(db, {
        runId,
        repo: REPO,
        issue: ISSUE,
        tipo: 'passo',
        fase: 'dev',
        ronda: 1,
        provider: 'claude',
        papel: 'principal',
        detalhe: 'probe: escreveu',
        custoUsd: 0.01,
        custoEstimado: true,
        duracaoMs: 1500,
    });
    await registarEventoRelayCom(db, {
        runId,
        repo: REPO,
        issue: ISSUE,
        tipo: 'fim',
        fase: 'pr',
        detalhe: 'probe: PR aberto',
    });
    const eventos = await lerEventosRelayCom(db, { repo: REPO, issue: ISSUE });
    const doRun = eventos.filter((e) => e.runId === runId);
    tudo = ok(doRun.length === 2, `eventos do run lidos (${doRun.length})`) && tudo;
    tudo = ok(doRun[0]?.tipo === 'passo' && doRun[1]?.tipo === 'fim', 'ordem cronológica') && tudo;
    tudo =
        ok(
            doRun[0]?.custoUsd === 0.01 && doRun[0]?.veredito === null,
            'campos do passo (custo/veredito)',
        ) && tudo;

    console.log(`\n${tudo ? '✅ OK' : '❌ FALHOU'} — corrida transparente sob RLS real.`);
    process.exit(tudo ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
