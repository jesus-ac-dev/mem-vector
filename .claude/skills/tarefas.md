# /tarefas — Gerir o tarefas.md do projeto

## Contexto

O `tarefas.md` na **raiz** de `~/src/mem-vector` é o **ledger leve de dev**: o que está em
curso, pendente e concluído há pouco, com referências a ficheiros. **Não** é o hub do vault —
esse guarda a estratégia e as tarefas formais (`🆔`, issues). **Não duplicar o vault aqui:**
ligar/resumir, e mencionar o vault quando um achado também lá pertence. Gémeo da skill Codex
(`.codex/skills/tarefas/SKILL.md`) — manter as duas em sintonia.

## Quando usar

- Início de trabalho técnico: ler o `tarefas.md` se a tarefa pode afetar pendentes.
- Fim de trabalho significativo: atualizar (tarefas que mudaram, follow-ups novos, achados de audit).
- Pedidos: "o que falta?", "adiciona à lista", "marca X como feito", "atualiza tarefas".

## Estrutura (manter)

```md
# tarefas
Ultima atualizacao: AAAA-MM-DD
## Em Progresso
## Pendentes — Alta
## Pendentes — Media
## Pendentes — Baixa
## Concluidas Recentemente   (últimas 15)
## Notas
## Relatorio de Audit
```

- Tarefa: `- [ ] **Titulo curto** — contexto. Ref: \`path/file.ts\`.`
- Estados: `[ ]` pendente · `[d]` em progresso · `[?]` testing · `[x]` feito · `[-]` cancelado.
- Prioridade: **Alta** (perda de memória, bug de utilizador, RLS/isolamento, dados inconsistentes, bloqueante) · **Media** (robustez, arquitetura, performance, DX, testes) · **Baixa** (polish, copy, docs, nice-to-have).

## Fluxo

1. Ler o `tarefas.md`.
2. Interpretar: mostra → resume Em Progresso + Alta + bloqueios; adiciona → prioridade certa;
   começa → Em Progresso; conclui → Concluidas; atualiza → reconciliar com o estado do repo.
3. `git status --short` antes de editar.
4. Editar **só** o `tarefas.md` (salvo pedido em contrário).
5. Atualizar `Ultima atualizacao`, branch e último commit.
