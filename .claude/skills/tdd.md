# /tdd — Test-Driven Development (Vitest)

## Contexto

Features e bugfixes fazem-se RED → GREEN → REFACTOR. Runner = Vitest (unit/integração); Playwright para e2e.

## Ciclo

1. **RED** — escreve o teste que falha primeiro. Captura o comportamento esperado, não a implementação.
2. **GREEN** — o mínimo de código para passar.
3. **REFACTOR** — limpa com os testes a verde.

## Onde

- Unit/integração: `src/**/*.test.ts(x)` (ao lado do código). Lógica de domínio/use-cases primeiro — é puro e rápido de testar.
- e2e: `e2e/*.spec.ts` (Playwright).
- Setup global de testes: `src/tests/setup.ts`.

## Comandos

```bash
npm run test        # watch
npm run test:run    # single (CI / pre-fecho)
npm run test:e2e    # playwright
```

## Regras

- Bug = primeiro um teste que o reproduz (RED), depois a correção.
- Não testar detalhes de implementação; testar comportamento observável.
- `domain/` e `use-cases/` são puros → cobrir bem aí (sem mocks de I/O).
- Correr `npm run verify` antes de dar por fechado.
