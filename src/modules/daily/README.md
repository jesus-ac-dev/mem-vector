# Módulo `daily`

> Notas diárias (Daily Notes) — um documento markdown por dia, guardado em BD tipada e indexado no vectorial. Inspirado no `memsearch`, mas sem `.memsearch/memory/*.md` em disco.

## O que faz

Mantém um registo diário por utilizador. Cada turno do chat gera um recap markdown curto, acrescentado ao daily do dia (ou cria-o se ainda não existir). O conteúdo é versionado e indexado para pesquisa semântica, reutilizando o mesmo kernel de `file_versions` + `chunks` que o módulo `knowledge`.

## Ficheiros

- `daily.capture.ts` — prompt/parse/format do recap de turno para markdown diário.
- `daily.service.ts` — persistência: `acrescentarAoDaily(linha, dia?)` + queries (listar, obter, histórico de versões).

## Modelo de dados

### Tabela `dailies`

| Coluna        | Tipo          | Notas                                       |
| ------------- | ------------- | ------------------------------------------- |
| `id`          | `uuid` PK     | gerado automaticamente                      |
| `owner_id`    | `uuid` FK     | `auth.users`, cascade delete                |
| `visibility`  | `visibility`  | default `'privado'`                         |
| `group_id`    | `uuid`        | partilha por grupo (visibility='protected') |
| `dia`         | `date`        | unique por owner — uma linha por dia        |
| `content_md`  | `text`        | conteúdo acumulado em markdown              |
| `frontmatter` | `jsonb`       | metadados opcionais                         |
| `created_at`  | `timestamptz` |                                             |
| `updated_at`  | `timestamptz` | atualizado em cada append                   |

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

## Identidade operacional

- `dia` continua a ser label/rota humana.
- `id` é a chave operacional preferida no workspace: `getDailyPorId` e `substituirDailyPorId` evitam colisões quando dailies próprios e `protected` partilhados têm a mesma data visível.
- `substituirDailyPorId` usa `replace_daily_entry_by_id` e restringe edição ao dono até o modelo colaborativo de reindex/chunks partilhados ficar fechado.

## Fluxo — capturar turno no dia

1. `destilarTurno` recebe a pergunta e resposta já mostrada ao utilizador.
2. `resumirTurnoParaDaily` gera 2-5 bullets factuais em markdown.
3. `formatDailyTurnoEntry` embrulha o recap em `### HH:mm` e acrescenta link `[[slug]]` quando a destilação também escreveu/atualizou uma nota `knowledge`.
4. `acrescentarAoDaily(linha, dia?)` resolve `dia` para hoje em `Europe/Lisbon` se omitido (`hojeLisboa()` via `Intl.DateTimeFormat('sv-SE', ...)`).
5. Chama a RPC `append_daily_entry(dia, linha)`, que serializa por `(owner,dia)`, cria ou atualiza `dailies` e insere a versão em `file_versions` no mesmo statement transacional.
6. Enfileira e processa o projector `agent_jobs(type='derived_index_entity')`, que reindexa chunks/embeddings e regenera edges dos `[[wikilinks]]` encontrados no daily.
8. Devolve `{ dia, criado }`.

## Ligações

- **Escrito por:** `destilarTurno` no módulo `chat` — grava sempre o recap do turno no daily do dia, mesmo quando não há nota `knowledge`.
- **View:** `src/app/(app)/daily/[dia]/page.tsx` — lê `getDaily` + `listarVersoesDaily`; mostra o conteúdo ou o comparador de diff (modo `?view=history`) reutilizando `NoteContent`, `DiffView` e `VersionPicker` do módulo `knowledge`.
- **Padrão partilhado:** replica a arquitectura do módulo `knowledge` (upsert + `file_versions` + `chunks` + embedding); não duplica lógica de diff nem de UI.
