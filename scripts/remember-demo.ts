import { embedPassage, embedQuery } from '../src/lib/embeddings';
import { generate } from '../src/lib/claude';
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

// Prova do loop "guardado → volto a buscar" com conteúdo NOVO (não-seed).
async function main(): Promise<void> {
  const db = getSupabaseAdmin();
  const facto = 'O Carlos vive em Faro e a empresa dele chama-se Além do Código.';

  // 1) GUARDAR: indexa o que foi dito como um chunk pesquisável (fonte 'demo').
  const emb = await embedPassage(facto);
  await db.from('chunks').delete().eq('source', 'demo');
  const { error } = await db
    .from('chunks')
    .insert({ content: facto, embedding: JSON.stringify(emb), source: 'demo' });
  if (error) throw new Error(`insert: ${error.message}`);
  console.log('GUARDADO (novo facto, não estava nos seeds):\n  "' + facto + '"\n');

  // 2) VOLTAR A BUSCAR: uma pergunta nova recupera-o e o claude responde.
  const pergunta = 'Onde vive o Carlos e como se chama a empresa dele?';
  const qemb = await embedQuery(pergunta);
  const { data, error: rpcErr } = await db.rpc('match_chunks', {
    query_embedding: JSON.stringify(qemb),
    match_count: 3,
  });
  if (rpcErr) throw new Error(`match_chunks: ${rpcErr.message}`);

  const sources = (data ?? []) as { content: string; similarity: number }[];
  console.log('PERGUNTA (mais tarde):', pergunta);
  console.log('RECUPERADO:');
  for (const s of sources) console.log(`  ${s.similarity.toFixed(3)}  ${s.content.slice(0, 64)}`);

  const ctx = sources.map((s, i) => `[${i + 1}] ${s.content}`).join('\n\n');
  const { text } = await generate(
    `Contexto:\n\n${ctx}\n\nPergunta: ${pergunta}\n\nResponde só com o contexto.`,
  );
  console.log('\nRESPOSTA do claude:\n ', text);
}

main().catch((e: unknown) => {
  console.error('❌', e);
  process.exit(1);
});
