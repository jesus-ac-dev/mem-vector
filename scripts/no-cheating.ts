import { embedPassage, embedQuery } from '../src/lib/embeddings';
import { generate } from '../src/lib/claude';
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

// Prova de que a resposta vem da BD (não do Claude nem da sessão):
// guarda um segredo aleatório → recupera → apaga da BD → pergunta outra vez.
// Se a resposta desaparecer ao apagar a linha, a fonte era a BD.

type Db = ReturnType<typeof getSupabaseAdmin>;

async function perguntar(db: Db, pergunta: string) {
  const q = await embedQuery(pergunta);
  const { data } = await db.rpc('match_chunks', {
    query_embedding: JSON.stringify(q),
    match_count: 3,
  });
  const sources = (data ?? []) as { content: string; similarity: number }[];
  const ctx = sources.map((s, i) => `[${i + 1}] ${s.content}`).join('\n\n');
  const { text } = await generate(
    `Contexto:\n\n${ctx}\n\nPergunta: ${pergunta}\n\nResponde só com o contexto.`,
  );
  return { top: sources[0], text };
}

async function main(): Promise<void> {
  const db = getSupabaseAdmin();
  const segredo = 'O código de acesso ao cofre do mem-vector é GIRAFA-4471-LISBOA.';
  const pergunta = 'Qual é o código de acesso ao cofre do mem-vector?';

  // 1) Guardar um segredo que NENHUM Claude pode saber.
  await db.from('chunks').delete().eq('source', 'proof');
  await db
    .from('chunks')
    .insert({ content: segredo, embedding: JSON.stringify(await embedPassage(segredo)), source: 'proof' });

  console.log('═══ COM o segredo na BD ═══');
  const a = await perguntar(db, pergunta);
  console.log('  recuperado top:', a.top?.content);
  console.log('  RESPOSTA:', a.text, '\n');

  // 2) Apagar o segredo. Nada mais muda.
  await db.from('chunks').delete().eq('source', 'proof');

  console.log('═══ SEM o segredo na BD (exatamente a mesma pergunta) ═══');
  const b = await perguntar(db, pergunta);
  console.log('  recuperado top:', b.top?.content);
  console.log('  RESPOSTA:', b.text);
}

main().catch((e: unknown) => {
  console.error('❌', e);
  process.exit(1);
});
