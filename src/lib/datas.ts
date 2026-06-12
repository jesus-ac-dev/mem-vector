// Datas à portuguesa (#55): a CHAVE é sempre AAAA-MM-DD (ordenação, BD,
// wikilinks); estes helpers formatam só o que se mostra.

const MESES_ABREV = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
];

const ISO_DIA = /^(\d{4})-(\d{2})-(\d{2})/;

/** '2026-06-12' (ou ISO completo) → '12-06-2026'. Não-data devolve-se intacta. */
export function dataPt(iso: string): string {
    const m = ISO_DIA.exec(iso);
    if (!m) return iso;
    return `${m[3]}-${m[2]}-${m[1]}`;
}

/** '2026-06-12' (ou ISO completo) → '12-Jun'. Não-data devolve-se intacta. */
export function dataCurtaPt(iso: string): string {
    const m = ISO_DIA.exec(iso);
    if (!m) return iso;
    const mes = MESES_ABREV[Number(m[2]) - 1];
    if (!mes) return iso;
    return `${m[3]}-${mes}`;
}
