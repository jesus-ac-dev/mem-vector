# Módulo `grupos`

> Grupos de pares (sem hierarquia) — a base da visibilidade `protected` em todo o produto.

## O que faz

- Cria grupos de utilizadores com pertença M:N (qualquer membro pode convidar; não existe dono/admin).
- Gere o ciclo de convites por email (pendente → aceite/recusado) e a saída voluntária.
- Expõe a função `meus_grupos()` SECURITY DEFINER que é reutilizada pelas políticas RLS de `tarefas`, `conversations`, `chunks` e `messages` para implementar a visibilidade `protected` (colaborativa, sem recursão de RLS).

## Ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `grupos.schema.ts` | Schemas Zod (`NovoGrupoSchema`, `ConviteSchema`) e tipos TypeScript (`Grupo`, `ConvitePendente`) |
| `grupos.service.ts` | Queries de leitura autenticadas: `listarMeusGrupos`, `membros`, `convitesParaMim` |
| `grupos.actions.ts` | Server Actions (Next.js `'use server'`): `criarGrupo`, `convidar`, `aceitarConvite`, `recusarConvite`, `sair` |

## Modelo de dados

```
grupos
  id uuid PK | nome text | descricao text | created_at timestamptz

grupo_membros  (M:N; PK composta)
  grupo_id uuid FK→grupos | user_id uuid FK→auth.users | joined_at timestamptz

grupo_convites
  id uuid PK | grupo_id uuid FK→grupos | email text (índice)
  convidado_por uuid FK→auth.users
  estado text CHECK('pendente','aceite','recusado')  default 'pendente'
  created_at timestamptz
```

**Funções SECURITY DEFINER** (migração `20260603140000_grupos_protected.sql`):

| Função | Assinatura | Papel |
|---|---|---|
| `meus_grupos()` | `() → setof uuid` | Devolve os `grupo_id` do utilizador autenticado; usada por todas as policies `protected`. `search_path=''` |
| `meu_email()` | `() → text` | Devolve o email do utilizador (auth.users não é legível em contexto invoker); usada na policy de select dos convites. `search_path=''` |
| `criar_grupo(p_nome, p_descricao?)` | `(text, text) → grupos` | Insere o grupo e adiciona o criador como membro numa única transação (SECURITY DEFINER evita a race condition onde o criador ainda não é membro no momento do INSERT). |

## API principal (exports)

### `grupos.service.ts`

```typescript
listarMeusGrupos(): Promise<Grupo[]>
// Devolve os grupos a que o utilizador autenticado pertence (RLS filtra).

membros(grupoId: string): Promise<string[]>
// Devolve os user_id dos membros do grupo (só grupos a que pertenço, por RLS).

convitesParaMim(): Promise<ConvitePendente[]>
// Devolve os convites pendentes endereçados ao meu email.
```

### `grupos.actions.ts`

```typescript
criarGrupo(formData: FormData): Promise<void>
// Valida com NovoGrupoSchema; chama a RPC criar_grupo (atómica).

convidar(formData: FormData): Promise<void>
// Valida com ConviteSchema; insere em grupo_convites (estado='pendente').
// Só pode convidar quem já é membro do grupo (policy RLS).

aceitarConvite(formData: FormData): Promise<void>
// Lê o convite (RLS garante que é para o meu email); insere em grupo_membros;
// atualiza estado→'aceite'.

recusarConvite(formData: FormData): Promise<void>
// Atualiza estado→'recusado'.

sair(formData: FormData): Promise<void>
// Remove a própria linha em grupo_membros.
```

Todas as actions chamam `revalidatePath('/grupos')` no final.

## RLS / segurança

### Tabelas de grupos

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `grupos` | membros do grupo (`meus_grupos()`) | via `criar_grupo()` SECURITY DEFINER | — | — |
| `grupo_membros` | membros dos meus grupos | só `user_id = auth.uid()` (auto-adição) | — | só `user_id = auth.uid()` (sair) |
| `grupo_convites` | para o meu email **ou** dos meus grupos | membro do grupo (`convidado_por = uid()`) | só o convidado (`email = meu_email()`) | — |

### RLS `protected` colaborativa (padrão por-comando)

Aplicada a `tarefas`, `conversations`, `chunks` e `messages`:

- **SELECT / UPDATE:** `owner_id = auth.uid()` **ou** (`visibility = 'protected'` **e** `group_id in (select meus_grupos())`)
- **INSERT:** `owner_id = auth.uid()` (sempre recursos próprios)
- **DELETE:** `owner_id = auth.uid()` exclusivamente (apagar é destrutivo; membro não pode apagar o conteúdo de outro)
- **`messages`:** acesso delegado à conversa pai (`exists(select 1 from conversations c where c.id = conversation_id and (...))`)

**Limitação conhecida (flat-trust, v1):** um UPDATE direto podia tentar reivindicar `owner_id` ou mover `group_id`. Não existe UI que o exponha; mitigado nas server actions. Endurecer com trigger quando o produto crescer para multi-equipa.

## Ligações

- **Colunas `group_id` + `visibility`** existem em `tarefas`, `conversations` e `chunks`; a função `meus_grupos()` é o elo que as une à pertença de grupo.
- **`messages`** herda o acesso da `conversation` pai via `exists`.
- **Página `/grupos`** (app router) consome todas as actions e queries deste módulo.
- **Decisões de design registadas** em `docs/GRUPOS-PROTECTED.md` e `decisions/log.md` (sessão 2026-06-03).
- **Migração:** `supabase/migrations/20260603140000_grupos_protected.sql` (Slice 2 — grupos + RLS protected colaborativa).
