# Grupos + Protected (Slice 2) — Implementation Plan

> **For agentic workers:** executar task-a-task com TDD. Design completo (SQL,
> RLS, fluxos): [`docs/GRUPOS-PROTECTED.md`](../GRUPOS-PROTECTED.md). Este plano é
> a sequência + checkpoints; o SQL detalhado vive no spec.

**Goal:** grupos de pares + visibilidade `protected` colaborativa (membros do grupo leem e editam recursos partilhados).

**Architecture:** migração (grupos/membros/convites + `meus_grupos()`/`meu_email()` SECURITY DEFINER + RLS protected por-comando) → feature module `grupos/` → página `/grupos` + seletor de visibilidade nas tarefas.

**Tech Stack:** Next 16, `@supabase/ssr`, Supabase local, shadcn, vitest.

**Base:** `feat/grupos` (em cima de `feat/app-shell`). Cycle gate ativo → commits com trailer.

---

### Task 1: Migração — grupos + RLS protected colaborativa

**Files:** Create `supabase/migrations/<ts>_grupos_protected.sql`

- [ ] **1.** Escrever a migração conforme o spec (§Esquema + §RLS protected): tabelas `grupos`/`grupo_membros`/`grupo_convites`; funções `meus_grupos()` + `meu_email()`; RLS de select nas 3 tabelas; substituir as policies `privado` de `tarefas`/`conversations`/`chunks` por policies **por-comando** (ler/editar = dono ou membro; criar = próprias; apagar = só dono); atualizar a policy de `messages` para seguir a visibilidade da conversa.
- [ ] **2.** `supabase db reset` → sem erro.
- [ ] **3.** `npm run seed:user && npm run ingest` (re-semear).
- [ ] **4.** Commit (`Audit: db reset verde + teste RLS na Task 2`).

---

### Task 2: Teste RLS protected colaborativo (a prova)

**Files:** Create `src/tests/rls-grupos.test.ts`

- [ ] **1.** Escrever o teste a falhar: alice cria grupo (via insert direto com service-role no setup, OU via a action quando existir — para a Task 2, usar admin para montar o cenário); bob é membro; alice cria tarefa `protected` ao grupo. Assertivas: **bob vê** a tarefa; **bob edita** (update `feita`) com sucesso; **bob NÃO apaga** (delete falha); um terceiro (carol, não-membro) **não vê**.
- [ ] **2.** Correr → falha (RLS/cenário). Aplicar migração. Correr → verde.
- [ ] **3.** Commit (`Audit: o teste é a auditoria da RLS protected colaborativa`).

---

### Task 3: Feature module `grupos/`

**Files:** Create `src/modules/grupos/{grupos.schema.ts, grupos.service.ts, grupos.actions.ts}`

- [ ] **1.** `grupos.schema.ts` — Zod: `NovoGrupo` (nome, descrição), `Convite` (grupo_id, email).
- [ ] **2.** `grupos.service.ts` — queries autenticadas: `listarMeusGrupos()`, `membros(grupo_id)`, `convitesPendentes()`.
- [ ] **3.** `grupos.actions.ts` — `criarGrupo` (insere grupo + auto-membro), `convidar` (insere convite, só membro), `aceitarConvite` (valida email = meu_email, insere membro), `recusarConvite`, `sair`. Cada um lê o user via `createClient().auth.getUser()`.
- [ ] **4.** Testes dos actions/service (TDD) onde houver lógica (ex: aceitar valida o email).
- [ ] **5.** `npm run verify` verde. Commit.

---

### Task 4: Página `/grupos` + item no IconRail

**Files:** Create `src/app/(app)/grupos/page.tsx`; Modify `src/components/layout/icon-rail.tsx`

- [ ] **1.** IconRail: adicionar item **Grupos** (ícone `Users` de lucide, href `/grupos`).
- [ ] **2.** `/grupos`: form criar grupo (shadcn Form+RHF+Zod), lista dos meus grupos (membros + convidar + sair), convites pendentes (aceitar/recusar). Server Component lê via service; mutações via actions.
- [ ] **3.** typecheck + lint + build verdes. Smoke: navegar /grupos. Commit.

---

### Task 5: Seletor de visibilidade nas tarefas

**Files:** Modify `src/modules/tarefas/{tarefas.schema.ts, tarefas.service.ts, tarefas.actions.ts}`, `src/app/(app)/tarefas/page.tsx`; add shadcn `select`

- [ ] **1.** `npx shadcn add select`.
- [ ] **2.** `tarefas.schema`: `NovaTarefa` ganha `visibility` ('privado'|'protected') + `group_id` opcional (obrigatório se protected — refine no Zod).
- [ ] **3.** `tarefas.service.criarTarefa`: grava `visibility`+`group_id`. `listarTarefas` já devolve via RLS (vê as próprias + as protected dos meus grupos).
- [ ] **4.** UI tarefas: `<Select>` de visibilidade; se protected, `<Select>` dos meus grupos.
- [ ] **5.** `npm run verify` + build verdes. Smoke: criar tarefa protected → o outro membro vê/edita. Commit.

---

## Self-Review

**Cobertura do spec:** grupos/membros/convites ✅ (T1,T3) · RLS protected colaborativo ✅ (T1,T2) · página grupos ✅ (T4) · seletor tarefas ✅ (T5) · `meus_grupos`/`meu_email` ✅ (T1). **Fora (spec):** imagem, expulsar, picker nas conversas, público.

**Risco a vigiar:** a RLS de `grupo_membros` (select) usa `meus_grupos()` que lê `grupo_membros` — confirmar na Task 1 que o SECURITY DEFINER quebra a recursão (não dá erro de policy recursiva). Se der, ajustar a função/policy.

## Nota cycle gate

Cada commit traz `Audit:`/`Cycle-skip:`. A migração + actions tocam comportamento → o push tem de tocar doc (o spec já existe + atualiza-se o estado no fim) e ter `Audit:`.
