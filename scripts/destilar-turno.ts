import { destilarResumirTurno } from '../src/modules/chat/chat.turno';

process.loadEnvFile('.env.local');

// Prova headless do pós-turno (1 chamada CLI) + proatividade do agente-autor:
//   eixo 1 — saudação trivial: daily vazio (#19, "o daily não regista o nada") e SEM nota;
//   eixo 2 — pedido explícito de registar: escreve nota;
//   eixo 3 — facto durável SEM pedido explícito: escreve à mesma (proativo);
//   eixo 4 — a nota traz summary da nota inteira (#22, sem chamada extra).
// Confirma também que o CLI real devolve o JSON combinado {daily, nota} parseável.

async function main(): Promise<void> {
    const trivial = await destilarResumirTurno(
        'olá, tudo bem?',
        'Tudo ótimo, em que posso ajudar hoje?',
    );
    console.log(
        'trivial → resumo:',
        JSON.stringify(trivial.resumoMd),
        'notas:',
        trivial.notas.map((n) => n.title),
    );
    const eixo1 = trivial.resumoMd === '' && trivial.notas.length === 0;
    console.log(`${eixo1 ? '✅' : '❌'} eixo 1 — saudação: daily vazio, nota não`);

    const q2 =
        'Regista isto: decidimos usar busca híbrida pgvector+FTS por RRF no RAG do mem-vector.';
    const a2 =
        'Registado. A busca híbrida funde a densa (pgvector) com FTS por Reciprocal Rank Fusion.';
    const explicito = await destilarResumirTurno(q2, a2);
    console.log(
        'explícito → notas:',
        explicito.notas.map((n) => n.title),
    );
    const eixo2 = explicito.notas.length > 0 && explicito.resumoMd.startsWith('- ');
    console.log(`${eixo2 ? '✅' : '❌'} eixo 2 — pedido explícito → escreve nota`);

    // Facto durável (data de aniversário de um animal), SEM pedir para registar.
    const q3 = 'o meu cão Rex faz anos a 3 de março';
    const a3 = 'Boa, o Rex faz anos no início da primavera então.';
    const proativo = await destilarResumirTurno(q3, a3);
    console.log(
        'proativo → notas:',
        proativo.notas.map((n) => n.title),
    );
    const eixo3 = proativo.notas.length > 0 && proativo.notas.every((n) => n.title.length > 0);
    console.log(
        `${eixo3 ? '✅' : '❌'} eixo 3 — facto durável SEM pedido explícito → escreve (proativo)`,
    );

    const summary = proativo.notas[0]?.summary?.trim() ?? '';
    console.log('summary →', JSON.stringify(summary));
    const eixo4 = summary.length > 0 && summary.length <= 500;
    console.log(`${eixo4 ? '✅' : '❌'} eixo 4 — nota traz summary (#22)`);

    const ok = eixo1 && eixo2 && eixo3 && eixo4;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
