// Probe do #85 fatia 1: o modelo cumpre o sentinela? Pergunta do workspace →
// responde direto (sem [[ESCALAR]]); pergunta do mundo → emite [[ESCALAR]].
// Corre: npx tsx scripts/probes/two-phase.ts  (precisa do claude CLI logado).
import { generate } from '../../src/lib/claude';
import { construirInstrucaoEscalada, SENTINELA_ESCALAR } from '../../src/modules/chat/escalada';

const CONTEXTO =
    'CONTEXTO DO WORKSPACE:\n' +
    '- Nota "Devs de hoje": o Carlos fechou o #45 (agente consulta a internet) em 3 fatias e ' +
    'arrancou o #85 (two-phase). O mem-vector está a avançar bem.\n' +
    '- Daily 2026-06-17: sessão produtiva no mem-vector.\n';

function prompt(pergunta: string): string {
    const instrucao = construirInstrucaoEscalada({ web: true, github: false });
    return `${CONTEXTO}\nPERGUNTA: ${pergunta}\n\n${instrucao}`;
}

async function caso(rotulo: string, pergunta: string, esperaEscalar: boolean) {
    const g = await generate(prompt(pergunta));
    const escalou = g.text.trimStart().startsWith(SENTINELA_ESCALAR);
    const ok = escalou === esperaEscalar;
    console.log(`\n[${ok ? 'OK' : 'FALHOU'}] ${rotulo}`);
    console.log(`  espera escalar=${esperaEscalar} · escalou=${escalou}`);
    console.log(`  resposta: ${g.text.slice(0, 160).replace(/\n/g, ' ')}`);
    return ok;
}

(async () => {
    const rs = [
        await caso('workspace geral ("como vão os devs?")', 'Como vão os devs hoje?', false),
        await caso('geral ("resume o mem-vector")', 'Resume o que fizemos no mem-vector.', false),
        await caso('mundo ("horas do jogo")', 'A que horas joga Portugal hoje no Mundial?', true),
        await caso('data ("o que fiz ontem?")', 'O que fiz ontem?', true),
        await caso('data ("tarefas de 15/06")', 'Que tarefas concluí em 2026-06-15?', true),
    ];
    const ok = rs.every(Boolean);
    console.log(`\n=== ${ok ? 'TODOS OK' : 'ALGUM FALHOU'} (${rs.filter(Boolean).length}/${rs.length}) ===`);
    process.exit(ok ? 0 : 1);
})();
