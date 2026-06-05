# Módulo `tarefas`

> Gestão de tarefas do utilizador autenticado, com visibilidade privada ou partilhada por grupo.

## O que faz

Permite criar e listar tarefas. É o **módulo de referência** do padrão feature-first do projeto:
`ecrã → action (Zod) → serviço → DB`. Cada camada tem uma responsabilidade única e não há
lógica de negócio espalhada.

## Ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `tarefas.schema.ts` | `NovaTarefaSchema` (Zod) para validação de input + tipo `Tarefa` (saída do serviço) |
| `tarefas.service.ts` | `listarTarefas` e `criarTarefa` — acesso ao Supabase com cliente autenticado; a RLS é a guarda de dados |
| `tarefas.actions.ts` | Server Action Next.js — porta do servidor: valida com Zod, chama o serviço, invalida a cache |
| `nova-tarefa-form.tsx` | Componente client-side com formulário (título + visibilidade + grupo) |

## Modelo de dados

Tabela `tarefas` (criada em `20260603120000_auth_profiles_visibility.sql`, políticas alargadas
em `20260603140000_grupos_protected.sql`):

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK, gerado automaticamente |
| `titulo` | `text` | obrigatório |
| `feita` | `boolean` | default `false` |
| `owner_id` | `uuid` | FK → `auth.users`; cascade delete |
| `visibility` | `visibility` (enum) | `privado` ou `protected` |
| `group_id` | `uuid` | obrigatório quando `visibility = 'protected'` |
| `created_at` | `timestamptz` | default `now()` |

**RLS:**
- `ler` — dono (`owner_id = auth.uid()`) **ou** `protected` com `group_id in (meus_grupos())`.
- `criar` / `apagar` — só o dono.
- `editar` — dono ou membro do grupo para tarefas `protected`.

## API principal (exports)

```ts
// tarefas.schema.ts
export const NovaTarefaSchema  // Zod — valida { titulo, visibility, groupId? }
export type NovaTarefa          // z.infer<typeof NovaTarefaSchema>
export interface Tarefa { id: string; titulo: string; feita: boolean; criadaEm: string }

// tarefas.service.ts
export async function listarTarefas(): Promise<Tarefa[]>
export async function criarTarefa(input: NovaTarefa): Promise<Tarefa>

// tarefas.actions.ts
export async function criarTarefa(input: unknown): Promise<void>  // Server Action

// nova-tarefa-form.tsx
export function NovaTarefaForm({ grupos }: { grupos: { id: string; nome: string }[] })
```

## Fluxo

```
NovaTarefaForm (client)
  └─ submete { titulo, visibility, groupId? } (unknown)
       └─ criarTarefa (Server Action)
            ├─ NovaTarefaSchema.parse(input)   ← rejeita dados inválidos na fronteira do servidor
            ├─ criarTarefaService(dados)
            │    ├─ createClient() — cliente Supabase SSR com sessão do utilizador
            │    ├─ auth.getUser() — obtém owner_id
            │    └─ INSERT tarefas (RLS aplica-se aqui)
            └─ revalidatePath('/tarefas')       ← invalida cache do Next.js
```

## Ligações

- **Padrão arquitetura-por-feature** — este módulo é o exemplo vivo e mais simples do padrão
  usado em todo o projeto (`knowledge/`, `daily/`, `conversations/`).
- **RLS visibility/grupos** — o enum `visibility` e a função `meus_grupos()` são partilhados
  com os módulos `knowledge` e `daily`; qualquer alteração ao modelo de grupos afeta todos.
- **`NovaTarefaForm`** recebe `grupos` do Server Component pai (que chama `listarTarefas` e
  vai buscar os grupos do utilizador) — sem fetch no cliente.
