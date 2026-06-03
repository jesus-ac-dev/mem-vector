# Autenticação + Shell — Slice 1 (design)

> Primeira fatia do cacho "login/auth". Funda a auth real (Supabase Auth) e o
> esqueleto do app-shell. Desenhado no brainstorm de 2026-06-03. Visão UX-alvo
> (workspace multi-pane, theming) em [VISAO-UX.md](./VISAO-UX.md).
>
> **Estado:** **Plano A (auth + DB) implementado** 2026-06-03 (`feat/auth`) — Supabase Auth email+password, RLS `privado` real, `profiles` + trigger, `tarefas` passou a tabela real, chat/tarefas autenticados. 8 testes verdes (RLS auditada ao vivo, sem furos críticos). **Plano B (app-shell: headers/rail/route-group/dark-light) por fazer.** Plano: `docs/plans/2026-06-03-auth-db-foundation.md`.

## Âmbito desta slice

**Dentro:** auth email+password (**login + utilizador no seed**, sem signup público), RLS real por-utilizador (**só `privado`**), esqueleto do app-shell (header + rail de ícones + área de conteúdo), **toggle dark/light** (barato — light+dark já existem no `globals.css`), tabela `profiles`.

**Fora (próximas slices):** signup público · grupos + `protected` · `público` (URL anónimo) · workspace multi-pane · **temas nomeados + densidade** · billing.

## Modelo (fundação, decidida no brainstorm)

- **Utilizadores:** planos, **todos iguais** (sem perfis/admin/hierarquia). Cada um **paga a sua subscrição** (billing diferido).
- **Grupos** (slice 2+): coletivos de pares — **nome + imagem**, entra-se por **convite + aceitar**, um user pertence a **vários** grupos (M:N), sem dono.
- **Visibilidade (3 níveis):**
  - `privado` — só o `owner`.
  - `protected` — um **grupo**; como o user está em vários, o recurso **carrega um `group_id`** (escolhido ao marcar protected).
  - `público` — **URL anónimo, na net** (leitura sem login; caminho de acesso diferente de "todos os logados").
- **Esta slice:** tudo nasce `privado`.

## Esquema e RLS (migração; greenfield → `db reset` + seed)

- **`profiles`** (1 linha por user): `id uuid PK → auth.users(id) on delete cascade`, `display_name text`, `theme text null` (gancho de tema), `onboarded_at timestamptz null` (gancho de onboarding — `null` = primeiro login), `created_at`, `last_login_at`.
  - RLS: cada user lê/edita **o seu** (`id = auth.uid()`).
  - **Trigger** `on auth.users insert → insert into profiles(id)` (padrão Supabase): todo o novo user ganha profile automático.
- **Visibilidade:** o enum `owner_scope` (`pessoal`/`comum`) passa a **`visibility` (`privado`/`protected`/`público`)** em `conversations` e `chunks` (`messages` herdam via conversa). `owner_id` fica **not null**. Adiciona-se já `group_id uuid null` (dorme até à slice 2).
- **RLS da slice 1 (só privado):** `using (owner_id = auth.uid())` + `with check (owner_id = auth.uid())`. As regras de `protected`/`público` entram nas slices 2-3 — o enum e o `group_id` já existem para não refazer.
- **Seed:** 1 utilizador de dev (via auth admin do Supabase); os chunks de conhecimento já ingeridos passam a ser dele (`privado`) para o chat dele recuperar.

## Estrutura de código (molde crmcredito = `@supabase/ssr`)

- **`src/lib/supabase/`** (infra, não é feature): `server.ts` (cliente server com cookies), `client.ts` (cliente browser).
- **`src/middleware.ts`** (raiz Next): refresca a sessão; protege as rotas do grupo `(app)`.
- **`src/modules/auth/`** (feature): `auth.actions.ts` (`signIn`, `signOut`) + `auth.service.ts` (ler/garantir profile).
- **`src/app/login/page.tsx`** — formulário shadcn (email+password), fora do shell.
- **O service-role sai do caminho do user:** `chat.actions`/`tarefas` passam ao cliente server **autenticado** → a RLS aplica-se. `getSupabaseAdmin` (service-role) fica **só** para o offline/não-user (script de ingestão de embeddings).

## Shell (UI) — esqueleto que cresce para panes

- **Header (app, autenticado):** `logo+nome` (esq) · **search** ao meio (slot **reservado**, ligado quando houver conteúdo) · dark/light · **profile dropdown** (dir) → menu de perfil + logout.
- **Header (público, não-logado):** `logo+nome` (esq) · nav à direita (Home · Serviços · Price · **Login** · dark/light) — só o Login é real nesta slice; o resto enche quando a landing crescer.
- **Rail de ícones** fino à esquerda: troca a view ativa. Slice 1 = só **Chat** e **Tasks**; File Explorer & cª ficam **slots**.
- **Área de conteúdo:** a view ativa. É o **futuro host dos panes** (ver [VISAO-UX.md](./VISAO-UX.md)) — desenhada para crescer, não construída como motor de panes agora.
- **Template:** `src/app/(app)/layout.tsx` (route group) = o shell partilhado; `chat/` e `tarefas/` movem para dentro e herdam-no.
- **"One-page":** via route group — o shell **persiste**, só o conteúdo troca (navegação client-side, mantém deep-links `/chat` `/tarefas` e o back).
- **Componentes reutilizáveis:** forms via shadcn `Form` + RHF + Zod (padrão `padroes-ui`); `Header` e `IconRail` como componentes próprios em cima das primitivas shadcn.

## Fluxo de auth + erros

- **`signIn(email, password)`** (server action): `supabase.auth.signInWithPassword` → cookies → redirect para a app. Credenciais erradas → erro no form (`FormMessage`).
- **`signOut`** (server action): limpa sessão → redirect `/login`.
- **Middleware:** sem sessão numa rota `(app)` → redirect `/login`; com sessão em `/login` → redirect para a app; `/` pública fica aberta.
- **Profile:** criado pelo trigger; o header lê `display_name`. O `signIn` carimba `last_login_at`. `onboarded_at` null = primeiro login (gancho; slice 1 ignora).
- **Erros:** credenciais inválidas → erro no form; Supabase em baixo → mensagem amigável; rota protegida sem sessão → redirect (não erro).

## Testes (TDD)

- **Isolamento RLS:** dois users no Supabase local — user A **não** vê o `privado` do user B (conversations/tarefas/chunks).
- **`auth.service`:** ler/garantir profile.
- **Actions:** chat/tarefas passam a exigir sessão (sem sessão → redirect/deny).
- **Nota cycle gate:** o gate está ativo no mem-vector → o push desta slice exige trailer `Audit:` + tocar nesta doc. Dogfood na própria feature.

## Theming

**Nesta slice:** **toggle dark/light** nos dois headers, via `next-themes` (a classe `.dark` troca o conjunto de CSS vars que já existe no `globals.css`). A preferência por-utilizador persiste no gancho **`profiles.theme`** (esta slice cria a coluna; `next-themes` trata do localStorage/cookie entretanto).

**Diferido** (temas nomeados + densidade): abordagem = **design tokens como CSS variables** (não ficheiros SCSS); troca = `data-theme` no `<html>`, runtime. Cores + radius já feitos; **font-family** é o próximo ganho fácil; spacing/font-size themáveis exigem mapear as escalas do Tailwind para `var()`. Detalhe em [VISAO-UX.md](./VISAO-UX.md).

## Decisões (porquê)

- **email+password** na slice 1: zero setup externo, caminho mais curto a "user real + RLS". OAuth Google/GitHub + invite-links evoluem depois (troca de provedor no Supabase, sem reescrever o modelo).
- **Login-only + seed** (sem signup público): YAGNI; melhora-se à medida que percebemos o UI.
- **`profiles` vs `user_metadata`:** tabela, para query/RLS decentes e espaço a crescer.
- **Sem perfis/admin:** o modelo de pares + billing por-user mata o problema "quem é dono da org e quem paga".
- **Route group para o one-page:** sensação SPA sem perder URLs/deep-links/back.

## Próximas slices

1. **Grupos + `protected`** (nome/imagem, convite+aceitar, `group_id`, RLS protected).
2. **`público`** (URL anónimo na net — entra com o file explorer).
3. **Workspace multi-pane** ([VISAO-UX.md](./VISAO-UX.md)).
4. **Theming switcher** (+ font-family).
5. **Billing** por-utilizador.
