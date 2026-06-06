# Módulo `knowledge`

> O kernel de ficheiros: o agente-autor escreve notas tipadas, versionadas, ligadas por wikilinks e pesquisáveis via RAG.

## O que faz

Cada nota é um documento Markdown com frontmatter (título, tags) identificado por um slug único por utilizador. Cada escrita gera uma versão imutável em `file_versions`, que serve de rede de revisão e permite comparar diffs linha a linha. Os `[[wikilinks]]` no corpo da nota são extraídos e guardados como arestas tipadas na tabela `edges`, construindo um grafo de conhecimento navegável. O conteúdo de cada nota é também fragmentado e embedado na tabela partilhada `chunks`, tornando-o pesquisável pelo pipeline RAG do chat.

## Ficheiros

- `knowledge.schema.ts` — schemas Zod (`FrontmatterSchema`, `EscritaKnowledgeSchema`) e interfaces TypeScript (`NotaKnowledge`, `Versao`, `EscritaKnowledge`).
- `knowledge.links.ts` — `slugify(text)` (normaliza NFD, lowercase, hífens) e `parseWikilinks(markdown)` (extrai slugs únicos de `[[...]]`).
- `knowledge.diff.ts` — `diffLines(before, after): DiffLine[]` implementado via LCS (Longest Common Subsequence); cada linha tem `op: 'same' | 'add' | 'del'`.
- `knowledge.service.ts` — primitiva `escreverNotaCom`/`escreverNota` + queries `listarKnowledgeCom`/`listarKnowledge`, `getNotaCom`/`getNota`, `listarVersoesCom`/`listarVersoes`.
- `knowledge.destilar.ts` — destilação proativa: `buildDestilarPrompt`, `parseDestilacao` (extrai bloco JSON ou retorna `null`), e `destilar(question, answer)` que chama o LLM e decide se uma troca merece nota persistida.
- `diff-view.tsx` — componente apresentacional que renderiza um `DiffLine[]` numa tabela com gutter `+`/`-`/` `.
- `note-content.tsx` — componente apresentacional que renderiza o Markdown da nota com `[[wikilinks]]` resolvidos para links Next.js internos.
- `version-picker.tsx` — componente cliente (`'use client'`) com `<Select>` para escolher a versão base de comparação; suporta `basePath` genérico (reutilizável em `/daily` e `/knowledge`).

## Modelo de dados

| Tabela          | Propósito                          | Colunas-chave                                                                                                     |
| --------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `knowledge`     | Nota viva (última versão)          | `owner_id`, `slug` (unique juntos), `title`, `frontmatter` (jsonb), `content_md`, `visibility`, `group_id`        |
| `edges`         | Grafo de wikilinks                 | `owner_id`, `from_type`, `from_id`, `to_slug`, `to_id` (null se alvo não existe ainda), `kind`                    |
| `file_versions` | Histórico imutável                 | `owner_id`, `entity_type`, `entity_id`, `content_md`, `frontmatter`, `author`                                     |
| `chunks`        | Embeddings RAG (tabela partilhada) | `owner_id`, `content`, `embedding`, `source='knowledge'`, `metadata.entity_id`, `metadata.slug`, `metadata.title` |

RLS ativa em todas as tabelas. `knowledge` e `file_versions` permitem leitura de notas `protected` a membros do mesmo grupo (`group_id in (select meus_grupos())`); escrita e apagamento são exclusivos do dono. `edges` e `file_versions` seguem política simples `owner_id = auth.uid()`. O schema é genérico: `entity_type`/`entity_id` em `file_versions` permitem versionar qualquer entidade (ex.: `'daily'`); `from_type`/`to_type` em `edges` permitem ligar qualquer tipo de nó.

## API principal (exports)

```ts
// knowledge.service.ts
escreverNota(input: EscritaKnowledge): Promise<ResultadoEscrita>
escreverNotaCom(db: SupabaseClient, input: EscritaKnowledge): Promise<ResultadoEscrita>

listarKnowledge(): Promise<NotaKnowledge[]>
listarKnowledgeCom(db: SupabaseClient): Promise<NotaKnowledge[]>

getNota(slug: string): Promise<NotaKnowledge | null>
getNotaCom(db: SupabaseClient, slug: string): Promise<NotaKnowledge | null>

listarVersoes(entityId: string): Promise<Versao[]>
listarVersoesCom(db: SupabaseClient, entityId: string): Promise<Versao[]>

// knowledge.destilar.ts
destilar(question: string, answer: string): Promise<EscritaKnowledge | null>
buildDestilarPrompt(question: string, answer: string): string
parseDestilacao(raw: string): EscritaKnowledge | null

// knowledge.links.ts
slugify(text: string): string
parseWikilinks(markdown: string): string[]

// knowledge.diff.ts
diffLines(before: string, after: string): DiffLine[]
```

`ResultadoEscrita` estende `NotaKnowledge` com `diff: DiffLine[] | null` (null na primeira escrita).

## Fluxo de escrita (a primitiva)

`escreverNotaCom(db, input)`:

1. **Valida** o input com `EscritaKnowledgeSchema.parse`.
2. **Autentica** — lança erro se não houver sessão.
3. **Deriva o slug** com `slugify(title)` e lê a nota existente (para guardar o `before` para o diff).
4. **Upsert** na tabela `knowledge` pela constraint `unique(owner_id, slug)` — cria ou substitui sem mudar o `id`.
5. **Insere versão** imutável em `file_versions` com `author: 'agent'`.
6. **Regenera chunks**: apaga os chunks anteriores pelo `metadata->>entity_id` e insere um novo chunk com o embedding calculado por `embedPassage`.
7. **Regenera edges**: apaga os edges `from_id = nota.id` e reinsere um edge por cada slug alvo encontrado via `parseWikilinks` + `input.links`; resolve `to_id` para os slugs que já existem.
8. **Devolve** `ResultadoEscrita` com o diff linha a linha (null se nota nova).

## Dependências

- `@/lib/embeddings` — `embedPassage` para gerar o vector do chunk.
- `@/lib/supabase/server` — `createClient` para leitura da sessão a partir dos cookies (Server Actions / Route Handlers).
- `@/lib/claude` — `generate` usado pela destilação para interrogar o LLM.

## Ligações

**Usado por:**

- **Chat** — `destilar(question, answer)` é chamado no fim de cada turno para decidir proativamente se persiste conhecimento novo.
- **Daily** — reutiliza `file_versions` e `VersionPicker` com o mesmo padrão de versionamento.

**Decisões de design:**

- Registadas em `decisions/log.md` (vault) nas entradas de 2026-06-02 e 2026-06-05.
- Spec e contexto no vault em `projects/mem-vector/`.
