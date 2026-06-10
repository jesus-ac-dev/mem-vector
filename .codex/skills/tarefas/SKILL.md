---
name: tarefas
description: "Use in the mem-vector repo when managing tarefas.md, project task lists, pending work, audit follow-ups, TODO conversion, or session task tracking. Trigger also on tarefas, /tarefas, \"o que falta fazer\", \"adiciona à lista\", \"marca como feito\", or requests to update this repo's task ledger."
---

# mem-vector — /tarefas

Project-scoped Codex playbook for managing the root `tarefas.md` ledger in `~/src/mem-vector`.

## Usage

- Use only inside the `mem-vector` repository.
- Treat slash-command names in headings as trigger aliases, not shell commands.
- Resolve paths such as `src/...`, `supabase/...`, `docs/...` from the repository root.
- This skill is standalone. It does not require CRM Credito hooks, agents, or routing.
- Follow higher-priority Codex/system/developer instructions first.

## When To Use

- At the start of technical work, read `tarefas.md` if the task could affect current pending work.
- At the end of significant work, update `tarefas.md` if tasks moved, new follow-ups appeared, or audit findings changed.
- Use when the user asks: "tarefas", "o que falta?", "adiciona à lista", "marca X como feito", "actualiza/atualiza tarefas.md", or similar.

## Workflow

1. Read `tarefas.md`.
2. Interpret the user's intent:
   - show status -> summarize `Em Progresso`, high priority, and blockers first;
   - add work -> add under the appropriate priority;
   - start work -> move from `Pendentes` to `Em Progresso`;
   - complete work -> move to `Concluidas Recentemente`;
   - update -> reconcile with the repo state and current branch.
3. Before editing, check `git status --short`.
4. Edit only `tarefas.md` unless the user asked for more.
5. Update `Ultima atualizacao`, branch, and last commit.

## File Rules

Keep this structure:

```md
# tarefas

Ultima atualizacao: YYYY-MM-DD

## Em Progresso
## Pendentes — Alta
## Pendentes — Media
## Pendentes — Baixa
## Concluidas Recentemente
## Notas
## Relatorio de Audit
```

Task format:

```md
- [ ] **Titulo curto** — contexto necessario. Ref: `path/file.ts`.
```

Status:

- `[ ]` pending.
- `[B]` analysis/decidir/clarificar escopo antes de implementar.
- `[d]` in progress.
- `[?]` testing/review.
- `[x]` done.
- `[-]` cancelled/superado.

Priorities:

- Alta: perda de memoria, bugs que afetam utilizadores, RLS/isolamento, dados inconsistentes, caminho bloqueante.
- Media: robustez, arquitetura, performance, DX, testes importantes.
- Baixa: polish, copy, docs locais, melhorias nice-to-have.

Limit `Concluidas Recentemente` to the most recent 15 items.

## Notes

- Do not duplicate long vault strategy here. Link or summarize.
- If a finding belongs in the MythosEngine vault too, mention it to the user or update the vault when requested.
- Prefer concrete file references and validation commands.
