import { PROVIDERS, type Provider } from '@/modules/definicoes/definicoes.schema';

// O Guardar só força o teste de ligação aos providers LIGADOS nesta sessão da
// modal (ativo passou a true) e ainda não confirmados pelo botão "Testar
// ligação". Desativar ou só mudar modelo/key de um provider já ligado não
// dispara teste — o utilizador testa à mão se quiser.
export function providersPorForcarTeste(
    agentes: Partial<Record<Provider, { ativo?: boolean }>>,
    ligados: ReadonlySet<Provider>,
    confirmados: ReadonlySet<Provider>,
): Provider[] {
    return PROVIDERS.filter(
        (p) => Boolean(agentes[p]?.ativo) && ligados.has(p) && !confirmados.has(p),
    );
}
