import { describe, expect, it } from 'vitest';

import { assinatura, construirHandoff } from './relay.handoff';

describe('assinatura', () => {
    it('1ª linha textual: provider · papel · fase · ronda', () => {
        expect(assinatura({ provider: 'claude', papel: 'validador', fase: 'dev', ronda: 2 })).toBe(
            '— Claude · validador · Desenvolvimento · ronda 2',
        );
    });
});

describe('construirHandoff', () => {
    it('principal (sem veredito): assinatura + o porquê', () => {
        const c = construirHandoff({
            fase: 'dev',
            papel: 'principal',
            provider: 'codex',
            ronda: 1,
            veredito: null,
            porque: 'escrevi os testes e o código.',
        });
        expect(c.split('\n')[0]).toBe('— Codex · principal · Desenvolvimento · ronda 1');
        expect(c).toContain('escrevi os testes e o código.');
        expect(c).not.toContain('Veredito');
    });

    it('validador aprovado mostra ✅; rejeitado mostra ❌ + objeção', () => {
        const ok = construirHandoff({
            fase: 'dev',
            papel: 'validador',
            provider: 'claude',
            ronda: 1,
            veredito: 'ok',
            porque: 'APROVADO',
        });
        expect(ok).toContain('✅ aprovado');

        const no = construirHandoff({
            fase: 'dev',
            papel: 'validador',
            provider: 'claude',
            ronda: 1,
            veredito: 'rejeitado',
            porque: 'REJEITADO: falta o teste de erro',
        });
        expect(no).toContain('❌ rejeitado');
        expect(no).toContain('falta o teste de erro');
    });
});
