import { destilarResumirTurno } from '../src/modules/chat/chat.turno';

process.loadEnvFile('.env.local');

// Prova headless do pós-turno (1 chamada CLI) + proatividade do agente-autor:
//   eixo 1 — saudação trivial: resumo presente, mas NÃO escreve nota;
//   eixo 2 — pedido explícito de registar: escreve nota;
//   eixo 3 — facto durável SEM pedido explícito: escreve à mesma (proativo).
// Confirma também que o CLI real devolve o JSON combinado {daily, nota} parseável.

async function main(): Promise<void> {
    const trivial = await destilarResumirTurno('olá, tudo bem?', 'Tudo ótimo, em que posso ajudar hoje?');
    console.log('trivial → resumo:', JSON.stringify(trivial.resumoMd), 'nota:', trivial.nota?.title ?? null);
    const eixo1 = trivial.resumoMd.startsWith('- ') && trivial.nota === null;
    console.log(`${eixo1 ? '✅' : '❌'} eixo 1 — saudação: resumo sim, nota não`);

    const q2 = 'Regista isto: decidimos usar busca híbrida pgvector+FTS por RRF no RAG do mem-vector.';
    const a2 = 'Registado. A busca híbrida funde a densa (pgvector) com FTS por Reciprocal Rank Fusion.';
    const explicito = await destilarResumirTurno(q2, a2);
    console.log('explícito → nota:', explicito.nota?.title ?? null);
    const eixo2 = !!explicito.nota && explicito.resumoMd.startsWith('- ');
    console.log(`${eixo2 ? '✅' : '❌'} eixo 2 — pedido explícito → escreve nota`);

    // Facto durável (data de aniversário de um animal), SEM pedir para registar.
    const q3 = 'o meu cão Rex faz anos a 3 de março';
    const a3 = 'Boa, o Rex faz anos no início da primavera então.';
    const proativo = await destilarResumirTurno(q3, a3);
    console.log('proativo → nota:', proativo.nota?.title ?? null);
    const eixo3 = !!proativo.nota && proativo.nota.title.length > 0;
    console.log(`${eixo3 ? '✅' : '❌'} eixo 3 — facto durável SEM pedido explícito → escreve (proativo)`);

    const ok = eixo1 && eixo2 && eixo3;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
