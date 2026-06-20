import { parseWikilinks } from './knowledge.links';

// #121 (Ponte E): o "grafo sem órfãos" do vault, em código. Uma nota nova do
// agente que não liga a NADA — havendo notas relacionadas para ligar — ficaria
// uma ilha (o problema da teia em reta do #104, que era só prompt). Recusa de
// forma RECUPERÁVEL: o agente recebe a mensagem com sugestões e cria de novo com
// a ligação. Sem candidatas não força (a 1.ª nota de um assunto novo não tem a
// quem ligar). Função pura — a chamada que computa candidatas vive na tool.
export function avaliarCriarNota(
    contentMd: string,
    candidatas: { slug: string }[],
): { ok: true } | { ok: false; mensagem: string } {
    const temLink = parseWikilinks(contentMd).length > 0;
    if (!temLink && candidatas.length) {
        const sugestoes = candidatas
            .slice(0, 3)
            .map((c) => `[[${c.slug}]]`)
            .join(', ');
        return {
            ok: false,
            mensagem:
                'Esta nota ficaria órfã (sem [[ligações]]). O workspace é uma teia: ' +
                `liga-a a uma nota relacionada — ${sugestoes} — e cria de novo.`,
        };
    }
    return { ok: true };
}
