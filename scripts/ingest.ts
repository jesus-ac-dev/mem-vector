import { embedPassage } from '../src/lib/embeddings';
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

// Seed mínimo: 6 factos distintos sobre o mem-vector (degrau 4).
const docs: { content: string; source: string }[] = [
  {
    content:
      'No MythosEngine, os agentes são os autores do conhecimento: o humano fala e o agente escreve as tarefas, decisões e notas.',
    source: 'seed',
  },
  {
    content:
      'Os embeddings do mem-vector usam o modelo multilingual-e5-small a correr localmente em CPU, com 384 dimensões.',
    source: 'seed',
  },
  {
    content:
      'A geração de texto no mem-vector usa o claude CLI na subscrição Max, não a API, para não pagar mais.',
    source: 'seed',
  },
  {
    content:
      'O Supabase local do mem-vector corre em Docker no bloco de portas 560xx, para não colidir com o crmcredito.',
    source: 'seed',
  },
  {
    content:
      'O produto-base do MythosEngine é chat, mais agentes-autores, mais RAG, mais tarefas, mais daily notes.',
    source: 'seed',
  },
  {
    content:
      'A arquitetura do mem-vector é por feature: cada feature numa pasta src/modules com schema, service e actions.',
    source: 'seed',
  },
];

async function main(): Promise<void> {
  const db = getSupabaseAdmin();

  // Idempotente: limpa o seed anterior antes de reindexar.
  await db.from('chunks').delete().eq('source', 'seed');

  for (const doc of docs) {
    const embedding = await embedPassage(doc.content);
    const { error } = await db.from('chunks').insert({
      content: doc.content,
      embedding: JSON.stringify(embedding),
      source: doc.source,
    });
    if (error) throw new Error(`insert falhou: ${error.message}`);
    console.log('indexado:', doc.content.slice(0, 50), '...');
  }

  const { count } = await db.from('chunks').select('*', { count: 'exact', head: true });
  console.log(`\n✅ ${count} chunks na base de dados.`);
}

main().catch((e: unknown) => {
  console.error('❌', e);
  process.exit(1);
});
