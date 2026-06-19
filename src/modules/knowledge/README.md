# Módulo `knowledge`

> O kernel de ficheiros: o agente-autor escreve notas tipadas, versionadas, ligadas por wikilinks e pesquisáveis via RAG.

## O que faz

Cada nota é um documento Markdown com frontmatter (título, tags). A identidade real é `id`; a identidade humana é Obsidian-like: `slug` único dentro da pasta, não global. Cada escrita gera uma versão imutável em `file_versions`, que serve de rede de revisão e permite comparar diffs linha a linha. Os `[[wikilinks]]` no corpo da nota são extraídos e guardados como arestas tipadas na tabela `edges`, construindo um grafo de conhecimento navegável. O conteúdo de cada nota é também fragmentado e embedado na tabela partilhada `chunks`, tornando-o pesquisável pelo pipeline RAG do chat.

## Ficheiros

- `knowledge.schema.ts` — schemas Zod (`FrontmatterSchema`, `EscritaKnowledgeSchema`) e interfaces TypeScript (`NotaKnowledge`, `Versao`, `EscritaKnowledge`).
- `knowledge.links.ts` — `slugify(text)` (normaliza NFD, lowercase, hífens) e `parseWikilinks(markdown)` (extrai slugs únicos de `[[...]]`; em `[[alvo|texto]]`, só o alvo entra no grafo).
- `knowledge.diff.ts` — `diffLines(before, after): DiffLine[]` implementado via LCS (Longest Common Subsequence); cada linha tem `op: 'same' | 'add' | 'del'`.
- `knowledge.service.ts` — primitiva `escreverNotaCom`/`escreverNota`, archive/restore/rename e queries `listarKnowledgeCom`/`listarKnowledge`, `getNotaCom`/`getNota`, `listarVersoesCom`/`listarVersoes`.
- `knowledge.destilar.ts` — destilação proativa: `buildDestilarPrompt`, `parseDestilacao` (extrai bloco JSON ou retorna `null`), e `destilar(question, answer)` que chama o LLM e decide se uma troca merece nota persistida.
- `diff-view.tsx` — componente apresentacional que renderiza um `DiffLine[]` numa tabela com gutter `+`/`-`/` `.
- `note-content.tsx` — componente apresentacional que renderiza o Markdown da nota com `[[wikilinks]]` resolvidos para links Next.js internos.
- `version-picker.tsx` — componente cliente (`'use client'`) com `<Select>` para escolher a versão base de comparação; suporta `basePath` genérico (reutilizável em `/daily` e `/knowledge`).

## Modelo de dados

| Tabela          | Propósito                          | Colunas-chave                                                                                                     |
| --------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `knowledge`     | Nota viva (última versão)          | `owner_id`, `folder_id`, `slug` (unique por pasta), `title`, `frontmatter` (jsonb), `content_md`, `visibility`    |
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

## Identidade operacional

- `slug` continua a ser label/rota/wikilink.
- `id` é a chave operacional preferida no workspace: `getNotaPorId` e `atualizarNotaPorId` evitam colisões quando uma nota própria e uma nota `protected` partilhada têm o mesmo slug visível.
- O slug é único por pasta: `knowledge_owner_folder_slug_uniq` em `(owner_id, folder_id, lower(slug))`, com `folder_id null` tratado como raiz.
- `escreverNotaCom` escreve/atualiza na raiz; `escreverNotaEmPastaCom` escreve/atualiza diretamente numa pasta.
- Quando um `[[wikilink]]` encontra vários alvos com o mesmo slug, `regenerarEdgesCom` deixa `to_id=null` em vez de escolher um alvo arbitrário.
- `atualizarNotaPorId` usa `write_knowledge_entry_by_id` e restringe edição ao dono até o modelo colaborativo de reindex/chunks partilhados ficar fechado.

## Fluxo de escrita (a primitiva)

`escreverNotaCom(db, input)`:

1. **Valida** o input com `EscritaKnowledgeSchema.parse`.
2. **Autentica** — lança erro se não houver sessão.
3. **Deriva o slug** com `slugify(title)`.
4. **Chama `write_knowledge_entry`** — RPC transacional que serializa por `(owner,slug)`, cria/atualiza `knowledge`, insere `file_versions` e devolve o conteúdo anterior para o diff.
5. **A versão** imutável nasce dentro da RPC, no mesmo statement da nota viva.
6. **Enfileira e processa o projector** `agent_jobs(type='derived_index_entity')`: carrega a nota atual, reindexa chunks por heading, regenera embeddings e edges, e deixa retry explícito se falhar.
7. **Devolve** `ResultadoEscrita` com o diff linha a linha (null se nota nova).

## Arquivar / repor

- `arquivarNotaCom` chama `archive_knowledge_entry(slug)`, uma RPC transacional que marca `archived=true` e apaga os chunks ativos da nota no mesmo statement. Fecha o caso "nota arquivada continua no RAG".
- `reporNotaCom` chama `restore_knowledge_entry(slug)` para repor a nota e depois reindexa em Node, porque os embeddings ainda são gerados fora da DB. Se a reindexação falhar, chama `archive_knowledge_entry` como compensação para a nota não ficar visível sem RAG.

## Rename

- `renomearNotaCom` chama `rename_knowledge_entry(slug, newSlug, newTitle, author)`, que atualiza nota, `file_versions`, metadata dos chunks e edges de destino no mesmo statement.
- Depois reescreve os `[[wikilinks]]` das notas referentes via `escreverNotaCom(..., 'user')`, para versionar o conteúdo alterado e passar essas notas pelo projector.
- Se a reescrita de backlinks falhar depois da RPC, repetir o rename com o slug antigo completa a correção: a função trata o caso "já renomeado" como retry e procura conteúdo que ainda aponte ao slug antigo.

## Versões: restaurar + guarda de encolhimento (#119)

O `content_md` faz **overwrite** em cada escrita (não é aditivo como as tags). Para a memória não se perder por descuido do modelo, há dois mecanismos:

- **Restaurar versão** (`restaurarVersaoKnowledgeCom` → `restaurarVersaoAction`): repõe o corpo de uma `file_versions` antiga como o atual, reusando `atualizarNotaPorIdCom('user')` — gera uma **nova** versão (o histórico nunca se apaga, por isso o restauro é ele próprio reversível). É o "git revert" de uma nota, exposto pelo botão **Restaurar esta versão** no histórico do file-pane (só knowledge).
- **Guarda de encolhimento** (trigger `guard_encolhimento_corpo` em `before insert on file_versions`): numa **continuação do agente** (`author='agent'`), se o corpo encolhe para < 50% de um corpo anterior > 280 chars, a escrita é **recusada** (o `raise` aborta a transação do RPC → o overwrite reverte) e o agente reenvia o `content_md` completo. Exempto: criação (sem versão anterior), edições do utilizador (deliberadas, incl. o restauro) e `daily` (aditivo).

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
