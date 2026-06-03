# Fundação Auth + DB (Slice 1, Plano A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auth real (Supabase Auth email+password) com RLS por-utilizador (só `privado`), um utilizador no seed, e o chat/tarefas a correr como o user autenticado em vez do service-role.

**Architecture:** `@supabase/ssr` (molde crmcredito) — clientes server/browser com cookies + middleware que refresca a sessão e protege rotas. DB greenfield: migração nova introduz `profiles` (+ trigger), troca o modelo de ownership para `visibility` (`privado`/`protected`/`publico`) + `owner_id`/`group_id`, e RLS de `privado`. `supabase db reset` + seed.

**Tech Stack:** Next 16 (App Router, Server Actions), `@supabase/ssr`, Supabase local (Postgres + Auth, portas 560xx), vitest, TypeScript.

Spec: [`docs/AUTH-E-SHELL.md`](../AUTH-E-SHELL.md). Este é o **Plano A**; o app-shell (headers/rail/route-group/dark-light) é o **Plano B**, à parte.

**Convenções fixadas aqui (usadas em todas as tasks):**
- Enum de visibilidade = valores **ASCII**: `'privado' | 'protected' | 'publico'` (a UI mostra "Público"; evita acentos no enum/SQL/código).
- Clientes Supabase: `createClient()` (server, async) de `@/lib/supabase/server`; `createClient()` (browser) de `@/lib/supabase/client`.
- Env já presentes em `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

### Task 0: Dependências + Supabase a correr

**Files:** `package.json` (modify, via npm)

- [ ] **Step 1: Instalar `@supabase/ssr`**

Run: `npm install @supabase/ssr`
Expected: adiciona `@supabase/ssr` a `dependencies`.

- [ ] **Step 2: Garantir o Supabase local de pé**

Run: `supabase start`
Expected: containers 560xx up; `supabase status` mostra API URL + anon key (já no `.env.local`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(auth): adicionar @supabase/ssr

Audit: n/a (só dependência)
Cycle-skip: docs — só lockfile/dependência, sem comportamento novo"
```

---

### Task 1: Clientes Supabase SSR (server + browser)

**Files:**
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/client.ts`

- [ ] **Step 1: Cliente server (cookies)**

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Cliente Supabase server-side, autenticado pela sessão nos cookies.
// A RLS aplica-se (ao contrário do getSupabaseAdmin/service-role).
export async function createClient() {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options),
                        );
                    } catch {
                        // Chamado de um Server Component (cookies read-only).
                        // O middleware refresca a sessão, por isso é seguro ignorar.
                    }
                },
            },
        },
    );
}
```

- [ ] **Step 2: Cliente browser**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (0 erros).

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/server.ts src/lib/supabase/client.ts
git commit -m "feat(auth): clientes Supabase SSR (server + browser)

Audit: n/a — boilerplate @supabase/ssr (molde crmcredito)
Cycle-skip: docs — padrão documentado em AUTH-E-SHELL.md"
```

---

### Task 2: Migração — profiles + visibilidade + RLS

**Files:**
- Create: `supabase/migrations/<novo_ts>_auth_profiles_visibility.sql`

> Greenfield: corre em DB vazia via `db reset`. Por isso `set not null` em colunas é seguro (sem linhas no momento da migração).

- [ ] **Step 1: Escrever a migração**

Create `supabase/migrations/20260603120000_auth_profiles_visibility.sql` (ajustar o timestamp para ser posterior ao `init`):

```sql
-- ── profiles: 1 linha por utilizador, criada por trigger ──────────
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  theme         text,                 -- gancho de tema (slice futura)
  onboarded_at  timestamptz,          -- null = primeiro login
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles: o proprio"
  on profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- Todo o novo auth.user ganha um profile automático.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── visibilidade: pessoal/comum → privado/protected/publico ───────
create type visibility as enum ('privado', 'protected', 'publico');

-- conversations
drop policy "conversas: dono ou comum" on conversations;
alter table conversations add column visibility visibility not null default 'privado';
alter table conversations add column group_id uuid;          -- dorme até à slice 2
alter table conversations drop column owner_scope;
alter table conversations alter column owner_id set not null;
create policy "conversas: privado do dono"
  on conversations for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- chunks
drop policy "chunks: dono ou comum" on chunks;
alter table chunks add column visibility visibility not null default 'privado';
alter table chunks add column group_id uuid;
alter table chunks drop column owner_scope;
alter table chunks alter column owner_id set not null;
create policy "chunks: privado do dono"
  on chunks for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- messages: acesso via a conversa (owner)
drop policy "mensagens: via a conversa" on messages;
create policy "mensagens: via a conversa"
  on messages for all
  using (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id and c.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id and c.owner_id = auth.uid()
  ));

-- enum antigo já sem uso
drop type scope;
```

- [ ] **Step 2: Aplicar (db reset)**

Run: `supabase db reset`
Expected: re-corre todas as migrações sem erro; "Finished supabase db reset".

- [ ] **Step 3: Verificar o esquema**

Run: `supabase db reset && echo "OK"` (ou inspecionar via Studio em 560xx).
Expected: tabelas `profiles`, `conversations.visibility`, `chunks.visibility`, tipo `visibility`; `scope` já não existe.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260603120000_auth_profiles_visibility.sql
git commit -m "feat(auth): migração profiles + visibilidade (privado) + RLS

Audit: n/a — migração SQL, verificada por db reset + teste RLS na Task 4
Docs: ver AUTH-E-SHELL.md (modelo de visibilidade)"
```

---

### Task 3: Seed do utilizador de dev + ingest com owner

**Files:**
- Create: `scripts/seed-user.ts`
- Modify: `scripts/ingest.ts` (chunks passam a ter `owner_id` do seed user)
- Modify: `package.json` (script `seed:user`)

- [ ] **Step 1: Script que cria o user de dev**

Create `scripts/seed-user.ts`:

```ts
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

async function main(): Promise<void> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
    });
    if (error && !error.message.includes('already been registered')) {
        throw new Error(`createUser falhou: ${error.message}`);
    }
    const userId = data?.user?.id;
    console.log(`✅ utilizador de dev: ${EMAIL} (${userId ?? 'já existia'})`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
```

- [ ] **Step 2: Adicionar script ao package.json**

Modify `package.json` `scripts`, adicionar:

```json
"seed:user": "tsx scripts/seed-user.ts",
```

- [ ] **Step 3: Criar o user**

Run: `npm run seed:user`
Expected: imprime o email + uuid do user. (O trigger criou o profile.)

- [ ] **Step 4: ingest.ts passa a marcar owner**

Modify `scripts/ingest.ts` — resolver o id do user de dev e meter em cada insert. Substituir o corpo de `main()`:

```ts
async function main(): Promise<void> {
  const db = getSupabaseAdmin();

  const { data: list, error: listErr } = await db.auth.admin.listUsers();
  if (listErr) throw new Error(`listUsers falhou: ${listErr.message}`);
  const owner = list.users.find((u) => u.email === 'dev@mem-vector.local');
  if (!owner) throw new Error('utilizador de dev não existe — corre `npm run seed:user` primeiro.');

  await db.from('chunks').delete().eq('source', 'seed');

  for (const doc of docs) {
    const embedding = await embedPassage(doc.content);
    const { error } = await db.from('chunks').insert({
      content: doc.content,
      embedding: JSON.stringify(embedding),
      source: doc.source,
      owner_id: owner.id,
    });
    if (error) throw new Error(`insert falhou: ${error.message}`);
    console.log('indexado:', doc.content.slice(0, 50), '...');
  }

  const { count } = await db.from('chunks').select('*', { count: 'exact', head: true });
  console.log(`\n✅ ${count} chunks na base de dados (owner: ${owner.email}).`);
}
```

- [ ] **Step 5: Re-ingerir**

Run: `npm run ingest`
Expected: "6 chunks na base de dados (owner: dev@mem-vector.local)".

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-user.ts scripts/ingest.ts package.json
git commit -m "feat(auth): seed do user de dev + ingest com owner_id

Audit: n/a — scripts de seed/ingestão (offline, service-role)
Cycle-skip: docs — operação já descrita em RAG-EMBEDDINGS.md"
```

---

### Task 4: Teste de isolamento RLS (a prova)

**Files:**
- Create: `src/tests/rls-visibility.test.ts`

> Cria dois users via admin, faz login de cada um com o **cliente anon** (RLS ativa), e prova que A não vê o `privado` de B.

- [ ] **Step 1: Escrever o teste a falhar**

Create `src/tests/rls-visibility.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient as createAnon } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function userClient(email: string, password: string) {
    const admin = getSupabaseAdmin();
    await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const c = createAnon(URL, ANON);
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return c;
}

describe('RLS visibilidade privado', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let bob: Awaited<ReturnType<typeof userClient>>;
    let aliceId: string;

    beforeAll(async () => {
        alice = await userClient('alice-rls@test.local', 'pw-alice-123');
        bob = await userClient('bob-rls@test.local', 'pw-bob-123');
        aliceId = (await alice.auth.getUser()).data.user!.id;
        // Alice cria uma conversa privada.
        const { error } = await alice
            .from('conversations')
            .insert({ owner_id: aliceId, title: 'segredo da alice' });
        if (error) throw error;
    });

    it('o dono vê a sua conversa', async () => {
        const { data } = await alice.from('conversations').select('title');
        expect(data?.some((r) => r.title === 'segredo da alice')).toBe(true);
    });

    it('outro user NÃO vê a conversa privada', async () => {
        const { data } = await bob.from('conversations').select('title');
        expect(data?.some((r) => r.title === 'segredo da alice')).toBe(false);
    });
});
```

> Nota: confirmar que `conversations` tem `title` na migração `init`; se o nome da coluna for outro, ajustar o insert/select.

- [ ] **Step 2: Correr — verificar que falha**

Run: `npm run test:run -- rls-visibility`
Expected: FAIL (ou erro) — sem os clientes/migração corretos ainda não passa de forma fiável.

- [ ] **Step 3: Garantir migração + seed aplicados**

Run: `supabase db reset && npm run seed:user`
Expected: DB no estado novo.

- [ ] **Step 4: Correr — verde**

Run: `npm run test:run -- rls-visibility`
Expected: PASS (2 testes). Bob não vê o privado da Alice.

- [ ] **Step 5: Commit**

```bash
git add src/tests/rls-visibility.test.ts
git commit -m "test(auth): isolamento RLS — user nao ve o privado de outro

Audit: o teste É a auditoria do modelo de visibilidade (privado)"
```

---

### Task 5: Middleware (refrescar sessão + proteger rotas)

**Files:**
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/middleware.ts`

- [ ] **Step 1: updateSession helper**

Create `src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/chat', '/tarefas'];

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options),
                    );
                },
            },
        },
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;
    const isProtected = PROTECTED.some((p) => path.startsWith(p));

    if (!user && isProtected) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }
    if (user && path === '/login') {
        const url = request.nextUrl.clone();
        url.pathname = '/chat';
        return NextResponse.redirect(url);
    }

    return response;
}
```

- [ ] **Step 2: middleware raiz**

Create `src/middleware.ts`:

```ts
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
    return updateSession(request);
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

- [ ] **Step 3: Verificar typecheck + arranque**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Smoke manual (verify)**

Run: `npm run dev` e abrir `/chat` sem sessão.
Expected: redirect para `/login`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/middleware.ts src/middleware.ts
git commit -m "feat(auth): middleware refresca sessao + protege /chat e /tarefas

Audit: smoke manual (rota protegida sem sessao -> /login)
Cycle-skip: docs — fluxo descrito em AUTH-E-SHELL.md"
```

---

### Task 6: Actions de auth + página de login

**Files:**
- Create: `src/modules/auth/auth.actions.ts`
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: signIn / signOut (server actions)**

Create `src/modules/auth/auth.actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signIn(_prev: unknown, formData: FormData) {
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        return { error: 'Email ou password inválidos.' };
    }
    // Carimba o último login (gancho de onboarding fica para depois).
    if (data.user) {
        await supabase
            .from('profiles')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', data.user.id);
    }
    redirect('/chat');
}

export async function signOut() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
}
```

- [ ] **Step 2: Página de login (form mínimo, reutiliza Input/Button)**

Create `src/app/login/page.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { signIn } from '@/modules/auth/auth.actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
    const [state, formAction, pending] = useActionState(signIn, null);

    return (
        <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
            <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
            <form action={formAction} className="flex flex-col gap-3">
                <Input name="email" type="email" placeholder="email" required />
                <Input name="password" type="password" placeholder="password" required />
                {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
                <Button type="submit" disabled={pending}>
                    {pending ? 'A entrar…' : 'Entrar'}
                </Button>
            </form>
        </main>
    );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS (sem `<button>`/`<input>` raw — usa `<Button>`/`<Input>`).

- [ ] **Step 4: Smoke (verify) — login real**

Run: `npm run dev`, abrir `/login`, entrar com `dev@mem-vector.local` / `dev-password-123`.
Expected: redirect para `/chat`; recarregar `/chat` mantém a sessão (não volta a `/login`).

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/auth.actions.ts src/app/login/page.tsx
git commit -m "feat(auth): signIn/signOut + pagina de login (shadcn)

Audit: smoke manual (login do user de dev -> /chat, sessao persiste)
Cycle-skip: docs — fluxo em AUTH-E-SHELL.md"
```

---

### Task 7: Religar chat + tarefas ao cliente autenticado

**Files:**
- Modify: `src/modules/chat/chat.service.ts` (service-role → cliente server autenticado)
- Modify: `src/modules/chat/chat.actions.ts` (passar owner_id; ler user)
- Modify: `src/modules/tarefas/tarefas.service.ts` e `tarefas.actions.ts` (idem)

> Objetivo: o caminho do user usa a RLS. O `getSupabaseAdmin` fica **só** no ingest/seed.

- [ ] **Step 1: chat.service usa o cliente server**

Modify `src/modules/chat/chat.service.ts` — trocar a fonte do db:

```ts
// antes: import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase/server';
// ...
export async function respond(question: string): Promise<ChatResult> {
    const db = await createClient();
    // resto igual (embedQuery → match_chunks → generate)
    // ...
}
```

> `match_chunks` é `security definer`? Não — é `stable`/SQL. Com RLS, o retrieval só vê os chunks visíveis ao user. Como o seed pertence ao user de dev, faz login com ele para o chat recuperar contexto. Confirmar que o rpc respeita RLS; se precisar de ver chunks de outro escopo no futuro, é a slice de visibilidade.

- [ ] **Step 2: chat.actions injeta o owner_id ao criar conversa/mensagens**

Modify `src/modules/chat/chat.actions.ts` — ler o user e gravar `owner_id`:

```ts
import { createClient } from '@/lib/supabase/server';
// no início da action:
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) throw new Error('sem sessão');
// usar user.id como owner_id ao inserir conversation/messages
```

> Ajustar às chamadas concretas existentes (criar conversa, inserir mensagens) — meter `owner_id: user.id` nos inserts de `conversations`.

- [ ] **Step 3: tarefas idem**

Modify `src/modules/tarefas/tarefas.service.ts` + `tarefas.actions.ts` — `createClient()` server, `owner_id: user.id` no insert de tarefas. (Confirmar que a tabela `tarefas`/módulo tem `owner_id` + RLS; se a tabela ainda não tem coluna de owner, adicionar na migração da Task 2 antes de prosseguir.)

- [ ] **Step 4: Verify completo**

Run: `npm run verify`
Expected: format + lint + typecheck + testes PASS.

- [ ] **Step 5: Smoke (verify) — fim a fim**

Run: `npm run dev`, login, mandar uma pergunta no `/chat`, criar uma tarefa.
Expected: chat responde com contexto; tarefa aparece; nada de `fetch failed`/erros de RLS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/chat src/modules/tarefas
git commit -m "feat(auth): chat e tarefas correm como o user autenticado (RLS)

Audit: smoke fim-a-fim (login -> chat com contexto -> criar tarefa)
Docs: ver nota de auth em RAG-EMBEDDINGS.md + AUTH-E-SHELL.md"
```

---

## Self-Review (writing-plans)

**Cobertura do spec (AUTH-E-SHELL.md):** auth email+password ✅ (T6) · login+seed ✅ (T3,T6) · RLS privado ✅ (T2,T4) · profiles + ganchos theme/onboarded_at/last_login_at ✅ (T2,T6) · clientes @supabase/ssr ✅ (T1) · middleware ✅ (T5) · service-role só ingest ✅ (T3,T7) · visibility enum + group_id dormente ✅ (T2). **Fora deste plano (Plano B):** o app-shell (headers/rail/route-group/dark-light) — não coberto aqui de propósito.

**Lacuna conhecida a confirmar na execução:** a coluna de owner/RLS do módulo **tarefas** — o `init` pode não a ter. Task 7 Step 3 manda confirmar e, se faltar, **acrescentar à migração da Task 2** antes de avançar. (Resolver no arranque da execução, não deixar para o fim.)

**Placeholders:** nenhum step de código sem código. ✅
**Consistência de tipos:** `createClient()` (server async / browser) usado igual em T1/T5/T6/T7; enum `'privado'|'protected'|'publico'` consistente. ✅

## Nota cycle gate

Este plano vive num repo `~/src/*` com o cycle gate ativo. Cada commit traz já um trailer `Audit:` ou `Cycle-skip:` apropriado. O **push** da branch `feat/auth` exige pelo menos um `Audit:` no range — a auditoria a sério é o teste RLS (T4) + os smokes; registar o veredicto no commit de fecho ou correr `/code-review` antes do push.
