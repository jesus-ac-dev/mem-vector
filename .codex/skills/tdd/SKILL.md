---
name: tdd
description: "Use in the mem-vector repo when implementing bug fixes or features with tests, reproducing bugs, writing or updating Vitest/Playwright tests, following RED-GREEN-REFACTOR, or deciding validation commands. Trigger also on TDD, RED GREEN REFACTOR, teste primeiro, Vitest, Playwright, npm run test:run, or npm run verify."
---

# mem-vector — /tdd

Project-scoped Codex playbook for Test-Driven Development with Vitest and Playwright.

## Usage

- Use only inside the `mem-vector` repository.
- Treat slash-command names in headings as trigger aliases, not shell commands.
- Resolve paths such as `src/...`, `e2e/...`, and `vitest.config.ts` from the repository root.
- Follow higher-priority Codex/system/developer instructions first.

## Context

Features e bugfixes fazem-se RED -> GREEN -> REFACTOR quando for razoável. Runner principal:
Vitest para unit/integração; Playwright para e2e.

## Cycle

1. **RED**: escrever primeiro o teste que falha. Capturar comportamento esperado, não implementação.
2. **GREEN**: fazer o mínimo de código para passar.
3. **REFACTOR**: limpar com os testes a verde.

## Where

- Unit/integração: `src/**/*.test.ts(x)`, ao lado do código.
- e2e: `e2e/*.spec.ts`.
- Setup global: `src/tests/setup.ts`.
- Lógica pura deve ter cobertura direta e rápida.

## Commands

```bash
npm run test
npm run test:run
npm run test:e2e
npm run verify
```

## Rules

- Bug = primeiro um teste que o reproduz, depois a correção.
- Testar comportamento observável, não detalhes de implementação.
- Correr checks relevantes antes de dar por fechado; `npm run verify` quando a mudança justificar.
