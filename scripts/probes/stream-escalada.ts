// Probe #100: prova que generateAgenticStream emite text_deltas À MEDIDA (não
// num bloco no fim). Sem DB — config MCP vazia + um prompt multi-token.
// Critério: > 1 delta E a 1ª delta chega bem antes do fim.
import { generateAgenticStream } from '../../src/lib/claude';

process.loadEnvFile('.env.local');

async function main(): Promise<void> {
    let deltas = 0;
    let primeiraMs: number | null = null;
    const t0 = Date.now();

    const g = await generateAgenticStream(
        'Conta de 1 a 25, um número por linha, sem mais texto.',
        {
            mcpConfig: '{"mcpServers":{}}',
            allowedTools: ['mcp__memvector__noop'],
            systemPrompt: 'Responde em português, apenas o pedido.',
        },
        (d) => {
            deltas += 1;
            if (primeiraMs === null) primeiraMs = Date.now() - t0;
            process.stdout.write(d);
        },
    );

    const totalMs = Date.now() - t0;
    const span = primeiraMs !== null ? totalMs - primeiraMs : 0;
    console.log(
        `\n\n--- deltas=${deltas} · 1ª=${primeiraMs}ms · total=${totalMs}ms · texto=${g.text.length} chars ---`,
    );
    // Streama se houve vários deltas E a geração durou bem depois da 1ª delta.
    const ok = deltas > 1 && span > 200;
    console.log(ok ? '✅ STREAMA (deltas múltiplos ao longo da geração)' : '❌ bloco único');
    if (!ok) process.exit(1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
