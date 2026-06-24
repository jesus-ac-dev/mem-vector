// Orquestração pura do sweeper de jobs: processa cada id, isolando falhas (uma
// não derruba as outras) e contando. Sem deps de BD. Vive em lib para ser
// partilhada (destilação + projeção de índices) sem dependência circular: o
// index-projector não pode importar chat.jobs (chat.jobs → postturno → knowledge
// → index-projector), mas ambos podem importar este leaf.
export async function varrerJobsCom(
    ids: string[],
    processar: (id: string) => Promise<unknown>,
): Promise<{ processados: number; falhados: number }> {
    let processados = 0;
    let falhados = 0;
    for (const id of ids) {
        try {
            await processar(id);
            processados += 1;
        } catch {
            falhados += 1;
        }
    }
    return { processados, falhados };
}
