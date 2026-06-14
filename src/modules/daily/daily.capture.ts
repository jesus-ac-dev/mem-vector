import { generate } from '@/lib/claude';

export interface DailyTurnoNota {
    slug: string;
    title: string;
    criada: boolean;
}

export interface DailyTurnoEntryInput {
    resumoMd: string;
    nota?: DailyTurnoNota | null;
    hora?: string;
    // Liga o recap à conversa-fonte: o heading ganha [[conversa:<id>]] navegável (teia de memória).
    conversationId?: string;
}

export function horaLisboa(date: Date = new Date()): string {
    return new Intl.DateTimeFormat('pt-PT', {
        timeZone: 'Europe/Lisbon',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(date);
}

// "2026-06-12 (quinta-feira)" — vai nos prompts de destilação (#53): sem a
// data de hoje o modelo não resolve prazos relativos ("este fim de semana").
export function hojeComDiaSemana(date: Date = new Date()): string {
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(date);
    const semana = new Intl.DateTimeFormat('pt-PT', {
        timeZone: 'Europe/Lisbon',
        weekday: 'long',
    }).format(date);
    return `${dia} (${semana})`;
}

function clamp(text: string, max = 4000): string {
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function buildDailyCapturePrompt(question: string, answer: string): string {
    return (
        'Es um registador factual de Daily Notes deste workspace.\n' +
        'Recebes uma troca entre Utilizador e Assistente. Resume o que aconteceu como memoria diaria, ' +
        'em portugues de Portugal, em 2 a 5 bullets markdown. Mantem factos, decisoes, alteracoes, ' +
        'bloqueios e proximos passos. Nao respondas ao utilizador; so escreve o recap.\n\n' +
        'Formato obrigatorio: cada linha comeca por "- ". Sem titulo, sem fences, sem preambulo.\n\n' +
        `[Utilizador]\n${clamp(question)}\n\n` +
        `[Assistente]\n${clamp(answer)}`
    );
}

export function parseDailyCapture(raw: string): string {
    const txt = raw.trim();
    const fence = txt.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
    const candidate = (fence ? fence[1] : txt).trim();
    const bullets = candidate
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 6);

    if (!bullets.length) return '- Turno registado sem resumo utilizavel.';
    return bullets.map((line) => `- ${line}`).join('\n');
}

export function formatDailyTurnoEntry({
    resumoMd,
    nota,
    hora,
    conversationId,
}: DailyTurnoEntryInput): string {
    const horaFmt = hora ?? horaLisboa();
    const cabecalho = conversationId
        ? `### ${horaFmt} · [[conversa:${conversationId}|conversa]]`
        : `### ${horaFmt}`;
    const lines = [cabecalho, parseDailyCapture(resumoMd)];
    if (nota) {
        const acao = nota.criada ? 'criada' : 'atualizada';
        lines.push(`- Estado escrito: [[${nota.slug}]] (${acao}: ${nota.title})`);
    }
    return lines.join('\n');
}

export async function resumirTurnoParaDaily(question: string, answer: string): Promise<string> {
    const { text } = await generate(buildDailyCapturePrompt(question, answer));
    return parseDailyCapture(text);
}
