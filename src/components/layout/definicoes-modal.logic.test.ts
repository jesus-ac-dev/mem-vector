import { describe, expect, it } from 'vitest';

import { providersPorForcarTeste } from './definicoes-modal.logic';

// Regra (pedido do Carlos): o Guardar só força o teste de ligação aos providers
// que foram LIGADOS nesta sessão da modal e ainda não foram testados. Mexer no
// modelo/key de um provider já ligado, ou desativar, não dispara teste.
describe('providersPorForcarTeste', () => {
    it('inclui um provider ligado agora e ainda não testado', () => {
        expect(
            providersPorForcarTeste({ claude: { ativo: true } }, new Set(['claude']), new Set()),
        ).toEqual(['claude']);
    });

    it('exclui um provider já testado (confirmado pelo botão)', () => {
        expect(
            providersPorForcarTeste(
                { claude: { ativo: true } },
                new Set(['claude']),
                new Set(['claude']),
            ),
        ).toEqual([]);
    });

    it('não força teste a um provider já ligado de antes (não está em ligados)', () => {
        expect(providersPorForcarTeste({ claude: { ativo: true } }, new Set(), new Set())).toEqual(
            [],
        );
    });

    it('nunca testa um provider desativado, mesmo que tenha sido tocado', () => {
        expect(
            providersPorForcarTeste({ codex: { ativo: false } }, new Set(['codex']), new Set()),
        ).toEqual([]);
    });

    it('desativar todos = nada a testar (o Guardar passa sem provider)', () => {
        expect(
            providersPorForcarTeste(
                { claude: { ativo: false }, codex: { ativo: false } },
                new Set(),
                new Set(),
            ),
        ).toEqual([]);
    });
});
