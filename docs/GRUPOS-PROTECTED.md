# Grupos + Protected — Slice 2 (design)

> Segunda fatia do cacho auth. Ativa o `group_id` dormente: grupos de pares e a
> visibilidade **`protected`** (workspace de equipa colaborativo). Desenhado no
> brainstorm de 2026-06-03. Fundação: [AUTH-E-SHELL.md](./AUTH-E-SHELL.md).
>
> **Estado:** **implementado** 2026-06-03 (`feat/grupos`) — migração (grupos/membros/convites + `criar_grupo`/`meus_grupos`/`meu_email` SECURITY DEFINER + RLS protected colaborativa por-comando), módulo `grupos/`, página `/grupos`, seletor de visibilidade nas tarefas. **13 testes** (RLS colaborativa + fluxo de convites). Build verde.
>
> **Limitação conhecida (flat-trust, v1):** a RLS colaborativa permite a um membro, num UPDATE direto, reivindicar `owner_id` ou mover o `group_id` para outro grupo seu. Baixa severidade no modelo de equipa de confiança; não há UI que o exponha. Endurecer (trigger/action a fixar `owner_id`/`group_id` no edit) quando crescer para multi-equipa.

## Âmbito desta slice

**Dentro:** tabelas `grupos`/`grupo_membros`/`grupo_convites`; RLS **`protected` colaborativa** (membros do grupo leem **e editam**) em `conversations`/`chunks`/`tarefas`/`messages`; página `/grupos` (criar, listar, membros, convidar, aceitar/recusar, sair); item "Grupos" no IconRail; **seletor de visibilidade nas tarefas** (privado / protected+grupo).

**Fora (follow-ups):** imagem do grupo (precisa de storage) · expulsar outros membros · seletor de visibilidade nas conversas · `público` (slice 3).

## Modelo (do brainstorm)

- **Utilizadores planos, sem dono/admin.** Grupos = coletivos de pares.
- **Grupo:** `nome` + `descrição` (imagem diferida). Um user pertence a **vários** grupos (M:N).
- **Convite (modelo B, viral):** convida-se por **email**; user com conta aceita já, email sem conta fica **pendente** até ao signup (diferido). Qualquer membro convida.
- **Visibilidade:** `privado` (só o dono, RW) · **`protected` (membros do grupo, RW — colaborativo)** · `publico` (anónimo, slice 3).

## Esquema (migração; greenfield → `db reset` + seed)

```sql
-- ── grupos + membros + convites ──────────────────────────────────
create table grupos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  descricao  text,
  -- imagem_url diferida (precisa de storage)
  created_at timestamptz not null default now()
);

create table grupo_membros (
  grupo_id  uuid not null references grupos(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (grupo_id, user_id)
);

create table grupo_convites (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references grupos(id) on delete cascade,
  email        text not null,            -- o convidado (pode ainda não ter conta)
  convidado_por uuid not null references auth.users(id) on delete cascade,
  estado       text not null default 'pendente' check (estado in ('pendente','aceite','recusado')),
  created_at   timestamptz not null default now()
);
create index on grupo_convites (email);
```

**`meus_grupos()` — helper `SECURITY DEFINER`** (evita recursão de RLS quando as
policies de `tarefas`/etc. consultam `grupo_membros`):

```sql
create function meus_grupos()
returns setof uuid
language sql security definer stable
set search_path = ''
as $$ select grupo_id from public.grupo_membros where user_id = auth.uid(); $$;

-- O meu email (auth.users não é legível em contexto invoker → definer).
create function meu_email()
returns text
language sql security definer stable
set search_path = ''
as $$ select email from auth.users where id = auth.uid(); $$;
```

**RLS de grupos** (cada user vê os grupos a que pertence; membros geridos por actions):

```sql
alter table grupos enable row level security;
alter table grupo_membros enable row level security;
alter table grupo_convites enable row level security;

create policy "grupos: dos meus" on grupos for select to authenticated
  using (id in (select meus_grupos()));
create policy "membros: dos meus grupos" on grupo_membros for select to authenticated
  using (grupo_id in (select meus_grupos()));
create policy "convites: para mim ou dos meus grupos" on grupo_convites for select to authenticated
  using (email = (select meu_email()) or grupo_id in (select meus_grupos()));
```

> Escritas em `grupos`/`membros`/`convites` (criar grupo, convidar, aceitar) passam por **server actions** com o cliente autenticado; a action valida e insere. (Inserts diretos do browser ficam fechados — sem policy de insert genérica.)

## RLS `protected` colaborativa (o coração)

Em `tarefas` (mesmo padrão em `conversations`, `chunks`, e `messages` via a conversa). **Policies por-comando** porque o DELETE é mais restrito:

```sql
drop policy "tarefas: privado do dono" on tarefas;

create policy "tarefas: ler (dono ou grupo)" on tarefas for select to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));

create policy "tarefas: criar (próprias)" on tarefas for insert to authenticated
  with check (owner_id = auth.uid());

create policy "tarefas: editar (dono ou grupo)" on tarefas for update to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())))
  with check (owner_id = auth.uid()
         or (visibility = 'protected' and group_id in (select meus_grupos())));

create policy "tarefas: apagar (só dono)" on tarefas for delete to authenticated
  using (owner_id = auth.uid());
```

- **Ler/editar:** dono **ou** membro de um grupo a que o recurso está `protected`. → colaboração real.
- **Criar:** só recursos próprios (`owner_id = auth.uid()`).
- **Apagar:** **só o dono** — editar ≠ apagar; apagar o partilhado de outro é destrutivo demais para a v1.
- **`messages`:** acesso segue a conversa — a policy passa a `exists(conversations c where c.id = conversation_id and (c.owner_id = auth.uid() or (c.visibility='protected' and c.group_id in (select meus_grupos()))))`.
- **Guarda:** trocar `owner_id`/`group_id` para escapar é mitigado na **action** (a edição colaborativa não mexe em ownership/grupo); a RLS garante que o resultado fica sempre dono-ou-protected-do-meu-grupo.

## Fluxo de convites (feature `grupos`)

- **Criar grupo:** `criarGrupo(nome, descricao)` → insere `grupos` + adiciona o criador a `grupo_membros`.
- **Convidar:** `convidar(grupo_id, email)` → insere `grupo_convites` (pendente). (Membro do grupo only.)
- **Aceitar:** `aceitarConvite(id)` → se o email do convite = o meu email, marca `aceite` + insere `grupo_membros`.
- **Recusar:** `recusarConvite(id)` → marca `recusado`.
- **Sair:** `sair(grupo_id)` → apaga a minha linha de `grupo_membros`.

## UI

- **IconRail:** novo item **Grupos** (ícone `users`).
- **`/grupos`** (dentro do `(app)`): criar grupo (form nome+descrição), lista dos meus grupos (membros + convidar + sair), e os **convites pendentes para mim** (aceitar/recusar). shadcn `Form`+RHF+Zod.
- **Seletor de visibilidade nas tarefas:** ao criar/editar uma tarefa, escolher `privado` ou `protected`+grupo (um `<Select>` dos meus grupos). `npx shadcn add select`.

## Estrutura de código

- **`src/modules/grupos/`** — `grupos.schema.ts` (Zod), `grupos.service.ts` (queries autenticadas), `grupos.actions.ts` (criar/convidar/aceitar/recusar/sair).
- **`tarefas`** ganha visibilidade no service/action (set `visibility`+`group_id`).
- Migração `supabase/migrations/<ts>_grupos_protected.sql`.

## Testes (TDD)

- **RLS colaborativo:** membro vê **e edita** uma tarefa `protected` do grupo; **apaga não** (só o dono); não-membro **não vê**.
- **Grupos:** criar grupo → criador é membro; convite → aceitar → vira membro → passa a ver o protected do grupo.
- **`meus_grupos()`** não recursa (a policy resolve).

## Decisões (porquê)

- **Convite B** (email, pendente): direção viral/sales; funcional já para users com conta, completo quando o signup entrar.
- **Protected colaborativo** (RW): é o "degrau equipa" — workspace partilhado, não só mostrar.
- **DELETE só do dono:** segurança > conveniência na v1.
- **`meus_grupos()` SECURITY DEFINER:** padrão para RLS que cruza tabelas sem recursão.
- **Escritas de grupos via actions** (não policies de insert abertas): a lógica (criar→auto-membro, aceitar→validar email) vive na action, mais clara e segura.
