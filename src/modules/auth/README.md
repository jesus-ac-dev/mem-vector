# Módulo `auth`

> Autenticação do produto (Supabase Auth, email+password) e fundação do RLS de todo o produto.

## O que faz

- **Login/logout** via Supabase Auth (`signInWithPassword` / `signOut`), implementados como Next.js Server Actions.
- Carimba `profiles.last_login_at` a cada login bem-sucedido.
- A sessão fica em cookies HTTP-only geridos pelo `@supabase/ssr`; é esse cookie que dá o `auth.uid()` que todas as políticas RLS usam.
- O middleware (`src/lib/supabase/middleware.ts`) protege as rotas da app e redireciona utilizadores não autenticados para `/login`.

## Ficheiros

| Ficheiro          | Responsabilidade                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `auth.actions.ts` | `signIn(prev, formData)` e `signOut()` — Server Actions que interagem com o Supabase Auth e fazem redirect |

> `src/lib/supabase/server.ts` e `src/lib/supabase/middleware.ts` são infra partilhada, não feature deste módulo.

## Auth + sessão

- **Provider:** Supabase Auth email+password (sem signup público; utilizador criado via seed).
- **Cliente server:** `createClient()` em `src/lib/supabase/server.ts` — usa `createServerClient` do `@supabase/ssr`, lê e escreve a sessão nos cookies do pedido. A RLS aplica-se (ao contrário do `getSupabaseAdmin` / service-role).
- **`auth.getUser()`:** chamado no middleware para obter o utilizador autenticado; nas actions, `supabase.auth.signInWithPassword` devolve `data.user` que é usado para actualizar `profiles`.
- **Tabela `profiles`:** criada automaticamente por trigger (`on auth.users insert → insert into profiles(id)`) a cada novo utilizador. Campos relevantes para este módulo: `id` (FK → `auth.users`), `display_name`, `last_login_at`, `onboarded_at` (null = primeiro login, gancho diferido), `theme`.

### Fluxo de login

1. Form em `/login` submete `email` + `password` como `FormData`.
2. `signIn` chama `supabase.auth.signInWithPassword({ email, password })`.
3. Em caso de erro devolve `{ error: 'Email ou password inválidos.' }` ao form.
4. Em caso de sucesso actualiza `profiles.last_login_at` e faz `redirect('/chat')`.

### Fluxo de logout

1. `signOut` chama `supabase.auth.signOut()` para limpar a sessão.
2. Faz `redirect('/login')`.

## Rotas protegidas

O middleware `src/lib/supabase/middleware.ts` (`updateSession`) cobre:

```ts
const PROTECTED = ['/chat', '/kanban', '/knowledge', '/daily', '/grupos'];
```

- Utilizador **sem sessão e sem cookie Supabase de auth** numa rota protegida → redirect para
  `/login`.
- Utilizador sem `user`, mas ainda com cookie `sb-*-auth-token` numa rota protegida → não há kick
  imediato; o middleware deixa passar e regista o erro de `getUser()` sem valores de cookie. Isto
  evita logout agressivo quando pedidos concorrentes apanham uma rotação de refresh token. O layout
  autenticado mostra um fallback de reload/login em vez de carregar dados com RLS sem sessão.
- Utilizador **com sessão** em `/login` → redirect para `/chat`.
- `/` e outras rotas públicas ficam abertas.

## Tokens de sessão (`supabase/config.toml`)

- **`enable_refresh_token_rotation = false`** (#179). A rotação torna o refresh token
  single-use; como a app dispara vários pedidos concorrentes (abrir nota = layout +
  barra-direita + ...), eles refrescam o mesmo token em corrida e invalidam-se uns aos
  outros → a sessão cai ("sessão expirada"). A rotação é defesa anti-roubo de token para
  **multi-tenant hostil**; numa app pessoal local de 1 utilizador não dá segurança, só
  cria a corrida. **Rever se/quando for SaaS multi-tenant.**
- **`jwt_expiry = 86400`** (24h, era 1h). Menos refreshes = menos corridas.
- Mudar estes valores exige `supabase stop && supabase start` (o gotrue lê o config no arranque).

## Ligações

- **É a fundação do produto:** sem sessão não existe `auth.uid()`, logo toda a RLS de `conversations`, `messages`, `chunks`, `tarefas`, `knowledge` e `grupos` depende deste módulo.
- **service-role (`getSupabaseAdmin`)** fica fora do caminho do utilizador — usado apenas em scripts de ingestão offline (embeddings); nunca nas actions do utilizador.
- **Decisões de design:** `docs/AUTH-E-SHELL.md` (brainstorm + slice 1, 2026-06-03).
- **Log de decisões:** `decisions/log.md` entrada de 2026-06-03.
- **Próximas slices:** grupos + visibilidade `protected`/`público` — o enum `visibility` e o `group_id` já existem na DB, as regras RLS chegam depois.
