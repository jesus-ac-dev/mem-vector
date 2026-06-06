import { destilarResumirTurno } from '../src/modules/chat/chat.turno';

process.loadEnvFile('.env.local');

// Prova headless da fusão das 2 chamadas CLI de pós-turno numa só:
//   - troca trivial → resumo presente, sem nota durável;
//   - pedido explícito de registar uma decisão → resumo + nota.
// Confirma que o CLI real devolve o JSON combinado {daily, nota} parseável.

async function main(): Promise<void> {
    const trivial = await destilarResumirTurno(
        'olá, tudo bem?',
        'Tudo ótimo, em que posso ajudar hoje?',
    );
    console.log('trivial → resumo:', JSON.stringify(trivial.resumoMd), 'nota:', trivial.nota?.title ?? null);
    const eixo1 = trivial.resumoMd.startsWith('- ');
    console.log(`${eixo1 ? '✅' : '❌'} eixo 1 — resumo do daily gerado`);

    const q = 'Regista isto: decidimos usar busca híbrida pgvector+FTS por RRF no RAG do mem-vector.';
    const a = 'Registado. A busca híbrida funde a componente densa (pgvector) com FTS por Reciprocal Rank Fusion.';
    const duravel = await destilarResumirTurno(q, a);
    console.log('durável → resumo:', JSON.stringify(duravel.resumoMd));
    console.log('durável → nota:', duravel.nota);
    const eixo2 = !!duravel.nota && duravel.nota.title.length > 0 && duravel.resumoMd.startsWith('- ');
    console.log(`${eixo2 ? '✅' : '❌'} eixo 2 — uma só chamada devolve resumo + nota durável`);

    const ok = eixo1 && eixo2;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
