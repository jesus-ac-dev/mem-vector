import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { embedPassage, embedQuery } from '../src/lib/embeddings';
import { generate } from '../src/lib/claude';
import { buildPrompt, type Source } from '../src/modules/chat/chat.prompt';
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

// Prova do RAG-preferred + LLM-fallback (eixo novo do chat):
//   1) conhecimento geral (fora do workspace) é respondido — a LLM não fica refém do RAG;
//   2) facto do workspace presente é recuperado, e ausente NÃO é inventado.
// Corre sob a sessão de um utilizador AUTENTICADO (RLS ligada), o mesmo caminho do
// chat real (respond() usa o cliente do utilizador) — não a service role, que veria
// chunks de outros utilizadores. Usa o pipeline real (buildPrompt + generate);
// corre à mão, custa ~$0.3 (CLI por subscrição).

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

// Garante o utilizador de dev (idempotente) e devolve um cliente já autenticado.
async function devClient(): Promise<{ db: SupabaseClient; userId: string }> {
  const admin = getSupabaseAdmin();
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error && !created.error.message.includes('already been registered')) {
    throw new Error(`createUser falhou: ${created.error.message}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY no ambiente.');
  }
  const db = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signIn = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (signIn.error || !signIn.data.user) {
    throw new Error(`signIn falhou: ${signIn.error?.message ?? 'sem user'}`);
  }
  return { db, userId: signIn.data.user.id };
}

async function ask(db: SupabaseClient, pergunta: string) {
  const q = await embedQuery(pergunta);
  const { data, error } = await db.rpc('match_chunks', {
    query_embedding: JSON.stringify(q),
    match_count: 5,
  });
  if (error) throw new Error(`match_chunks: ${error.message}`);
  const sources = (data ?? []) as Source[];
  const { text, costUsd } = await generate(buildPrompt(pergunta, sources));
  return { text, costUsd };
}

function check(nome: string, ok: boolean, resposta: string): boolean {
  console.log(`${ok ? '✅' : '❌'} ${nome}`);
  console.log(`   "${resposta.slice(0, 140).replace(/\n/g, ' ')}"\n`);
  return ok;
}

async function main(): Promise<void> {
  const { db, userId } = await devClient();
  let ok = true;
  let custo = 0;

  // Eixo 1 — conhecimento geral: deve responder mesmo sem estar no vetorial.
  const geral = await ask(db, 'Qual é a capital de Portugal?');
  custo += geral.costUsd;
  ok = check('conhecimento geral responde (não fica refém do RAG)', /lisboa/i.test(geral.text), geral.text) && ok;

  // Eixo 2 — facto do workspace (dono = dev): recuperado quando existe, recusado quando não.
  const segredo = 'O código de acesso ao cofre do mem-vector é GIRAFA-4471-LISBOA.';
  const pergunta = 'Qual é o código de acesso ao cofre do mem-vector?';

  await db.from('chunks').delete().eq('source', 'proof');
  const ins = await db.from('chunks').insert({
    content: segredo,
    embedding: JSON.stringify(await embedPassage(segredo)),
    source: 'proof',
    owner_id: userId,
  });
  if (ins.error) throw new Error(`insert proof falhou: ${ins.error.message}`);

  const com = await ask(db, pergunta);
  custo += com.costUsd;
  ok = check('facto do workspace presente é recuperado', /girafa-4471/i.test(com.text), com.text) && ok;

  await db.from('chunks').delete().eq('source', 'proof');
  const sem = await ask(db, pergunta);
  custo += sem.costUsd;
  ok = check('facto do workspace ausente NÃO é inventado', !/girafa-4471/i.test(sem.text), sem.text) && ok;

  console.log(`Custo total ~$${custo.toFixed(4)}`);
  if (!ok) {
    console.error('❌ prova falhou');
    process.exit(1);
  }
  console.log('✅ prova passou');
}

main().catch((e: unknown) => {
  console.error('❌', e);
  process.exit(1);
});
