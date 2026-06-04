import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { embedQuery } from '../src/lib/embeddings';

process.loadEnvFile('.env.local');

// Exploração (não é prova): mede as similaridades reais do e5-small para calibrar o
// corte do threshold com dados, não com um número mágico. Sem `generate` → $0.
// Corre sob a sessão RLS do utilizador dev (o contexto real do produto).

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

const RELEVANTES = [
  'Quem escreve o conhecimento no produto?',
  'Que modelo de embeddings usa o mem-vector?',
  'Em que portas corre o Supabase local?',
];
const IRRELEVANTES = [
  'Qual é a capital de Portugal?',
  'Como se faz massa de pizza?',
  'Quem pintou a Mona Lisa?',
];

async function devClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (signIn.error) throw new Error(`signIn falhou: ${signIn.error.message}`);
  return db;
}

async function sims(db: SupabaseClient, pergunta: string): Promise<number[]> {
  const q = await embedQuery(pergunta);
  const { data, error } = await db.rpc('match_chunks', {
    query_embedding: JSON.stringify(q),
    match_count: 5,
  });
  if (error) throw new Error(`match_chunks: ${error.message}`);
  return ((data ?? []) as { similarity: number }[]).map((s) => s.similarity);
}

async function bloco(db: SupabaseClient, titulo: string, perguntas: string[]): Promise<number[]> {
  console.log(`\n── ${titulo} ──`);
  const tops: number[] = [];
  for (const p of perguntas) {
    const s = await sims(db, p);
    tops.push(s[0] ?? NaN);
    console.log(`  top=${(s[0] ?? NaN).toFixed(3)}  [${s.map((x) => x.toFixed(3)).join(', ')}]  ${p}`);
  }
  return tops;
}

async function main(): Promise<void> {
  const db = await devClient();
  const rel = await bloco(db, 'RELEVANTES (do seed)', RELEVANTES);
  const irr = await bloco(db, 'IRRELEVANTES (fora do vault)', IRRELEVANTES);

  const minRel = Math.min(...rel);
  const maxIrr = Math.max(...irr);
  console.log(`\nmenor top relevante   = ${minRel.toFixed(3)}`);
  console.log(`maior top irrelevante = ${maxIrr.toFixed(3)}`);
  console.log(`janela de separação   = ${(minRel - maxIrr).toFixed(3)} (corte sugerido ≈ ${((minRel + maxIrr) / 2).toFixed(3)})`);
}

main().catch((e: unknown) => {
  console.error('❌', e);
  process.exit(1);
});
