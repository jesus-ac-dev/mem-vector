import { embedQuery } from '../src/lib/embeddings';
import { generate } from '../src/lib/claude';
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

// Prova headless do degrau 5 (mesma pipeline do chat.service, em relativo para o tsx).
async function main(): Promise<void> {
  const question = process.argv[2] ?? 'Quem escreve o conhecimento no produto?';
  const db = getSupabaseAdmin();

  const queryEmbedding = await embedQuery(question);
  const { data, error } = await db.rpc('match_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: 3,
  });
  if (error) throw new Error(`match_chunks: ${error.message}`);

  const sources = (data ?? []) as { content: string; similarity: number }[];
  console.log('Pergunta:', question, '\n');
  console.log('Recuperado (top-3):');
  for (const s of sources) {
    console.log(`  ${s.similarity.toFixed(3)}  ${s.content.slice(0, 64)}...`);
  }

  const context = sources.map((s, i) => `[${i + 1}] ${s.content}`).join('\n\n');
  const prompt = `Contexto:\n\n${context}\n\nPergunta: ${question}\n\nResponde usando só o contexto.`;

  const { text, costUsd } = await generate(prompt);
  console.log('\nResposta do claude:\n', text);
  console.log(`\nCusto: $${costUsd.toFixed(4)}`);
}

main().catch((e: unknown) => {
  console.error('❌', e);
  process.exit(1);
});
