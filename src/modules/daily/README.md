# Módulo `daily`

> Notas diárias (Daily Notes) — um ficheiro markdown por dia; a destilação acumula o recap do dia.

## O que faz

Mantém um registo diário por utilizador: cada chamada a `acrescentarAoDaily` faz append de uma linha ao daily do dia (ou cria-o se ainda não existir). O conteúdo é versionado e indexado para pesquisa semântica, reutilizando o mesmo kernel de `file_versions` + `chunks` que o módulo `knowledge`.

## Ficheiros

- `daily.service.ts` — toda a lógica: `acrescentarAoDaily(linha, dia?)` + as restantes queries (listar, obter, histórico de versões).

## Modelo de dados

### Tabela `dailies`

| Coluna        | Tipo          | Notas                                      |
|---------------|---------------|--------------------------------------------|
| `id`          | `uuid` PK     | gerado automaticamente                     |
| `owner_id`    | `uuid` FK     | `auth.users`, cascade delete               |
| `visibility`  | `visibility`  | default `'privado'`                        |
| `group_id`    | `uuid`        | partilha por grupo (visibility='protected')|
| `dia`         | `date`        | unique por owner — uma linha por dia       |
| `content_md`  | `text`        | conteúdo acumulado em markdown             |
| `frontmatter` | `jsonb`       | metadados opcionais                        |
| `created_at`  | `timestamptz` |                                            |
| `updated_at`  | `timestamptz` | atualizado em cada append                  |

RLS ativa: leitura por `owner_id = auth.uid()` ou `visibility='protected'` + grupo; escrita e apagamento apenas pelo dono.

### Reutilização do kernel

- `file_versions` com `entity_type = 'daily'` — versão imutável gravada em cada append.
- `chunks` com `source = 'daily'` e `metadata.entity_type = 'daily'` — chunk regenerado em cada append (apaga o anterior e insere novo com embedding atualizado).

## API principal (exports)

```ts
// Versões "Com" recebem um SupabaseClient explícito (úteis em testes/server actions com client próprio)
acrescentarAoDailyCom(db, linha, dia?)  → Promise<ResultadoAcrescento>
listarDailiesCom(db)                    → Promise<DailyListItem[]>
getDailyCom(db, dia)                    → Promise<Daily | null>
listarVersoesDailyCom(db, entityId)     → Promise<Versao[]>

// Versões convenientes (criam o client internamente via createClient())
acrescentarAoDaily(linha, dia?)         → Promise<ResultadoAcrescento>
listarDailies()                         → Promise<DailyListItem[]>
getDaily(dia)                           → Promise<Daily | null>
listarVersoesDaily(entityId)            → Promise<Versao[]>
```

### Tipos

```ts
ResultadoAcrescento { dia: string; criado: boolean }
DailyListItem       { id: string; dia: string; updatedAt: string }
Daily               { id: string; dia: string; contentMd: string; updatedAt: string }
Versao              { id: string; contentMd: string; author: string; createdAt: string }
```

## Fluxo — acumular no dia

1. `acrescentarAoDaily(linha, dia?)` resolve `dia` para hoje em `Europe/Lisbon` se omitido (`hoje()` via `Intl.DateTimeFormat('sv-SE', ...)`).
2. Lê o daily existente para `(owner_id, dia)` via `maybeSingle`.
3. Upsert em `dailies` com `onConflict: 'owner_id,dia'`: cria se novo, ou substitui `content_md` por `<anterior>\n<linha>`.
4. Insere uma nova linha em `file_versions` (`entity_type='daily'`, `author='agent'`).
5. Apaga os chunks anteriores deste daily (`metadata->>'entity_id' = daily.id`), gera embedding do conteúdo completo via `embedPassage`, e insere novo chunk em `chunks`.
6. Devolve `{ dia, criado }`.

## Ligações

- **Escrito por:** `destilarTurno` no módulo `chat` — grava o recap do turno como linha no daily do dia.
- **View:** `src/app/(app)/daily/[dia]/page.tsx` — lê `getDaily` + `listarVersoesDaily`; mostra o conteúdo ou o comparador de diff (modo `?view=history`) reutilizando `NoteContent`, `DiffView` e `VersionPicker` do módulo `knowledge`.
- **Padrão partilhado:** replica a arquitectura do módulo `knowledge` (upsert + `file_versions` + `chunks` + embedding); não duplica lógica de diff nem de UI.
