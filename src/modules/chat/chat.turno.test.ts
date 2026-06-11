import { describe, it, expect } from 'vitest';
import { parseTurno, buildTurnoPrompt } from './chat.turno';

describe('buildTurnoPrompt com candidatos', () => {
    it('lista as notas existentes e manda continuar reutilizando o título exato', () => {
        const prompt = buildTurnoPrompt('q', 'a', [
            {
                id: 'id-filhos',
                slug: 'filhos-de-carlos-e-sofia',
                title: 'Filhos de Carlos e Sofia',
                contentMd: 'O Carlos e a Sofia têm dois filhos: Lucas e Filipe.',
            },
        ]);
        expect(prompt).toContain('Filhos de Carlos e Sofia');
        expect(prompt).toContain('Lucas e Filipe');
        expect(prompt).toMatch(/continua/i);
        expect(prompt).toMatch(/exat/i); // reutilizar o título EXATAMENTE
    });

    it('sem candidatos não inclui a secção de notas existentes', () => {
        expect(buildTurnoPrompt('q', 'a')).not.toMatch(/notas existentes/i);
    });
});

// Declarativa sem marcas de pergunta = facto declarado → a nota é obrigatória,
// salvo trivialidade (#19, decisão 2026-06-10).
describe('buildTurnoPrompt com intenção declarativa', () => {
    const declarativa = { tipo: 'declarativa' as const, incerta: false };

    it('força a escrita da nota quando o utilizador declarou um facto', () => {
        const prompt = buildTurnoPrompt('o carlos gosta da sofia', 'Registado.', [], declarativa);
        expect(prompt).toMatch(/declarou um facto/i);
        expect(prompt).toMatch(/"nota": null NÃO é opção/i);
        expect(prompt).toMatch(/sauda|trivial/i); // a única exceção fica explícita
    });

    it('sem intenção (ou pergunta) mantém o prompt atual, sem bloco de facto', () => {
        expect(buildTurnoPrompt('q', 'a')).not.toMatch(/declarou um facto/i);
        expect(buildTurnoPrompt('q?', 'a', [], { tipo: 'pergunta', incerta: false })).not.toMatch(
            /declarou um facto/i,
        );
    });

    it('manda escrever o facto autocontido, sem meta-comentário', () => {
        const prompt = buildTurnoPrompt('eles têm dois filhos', 'Registado.', [], declarativa);
        expect(prompt).toMatch(/autocontido/i);
        expect(prompt).toMatch(/meta-coment/i);
    });
});

// Janela de conversa: a destilação resolve pronomes pelo fio, não adivinha.
describe('buildTurnoPrompt com histórico', () => {
    it('inclui a conversa recente quando há histórico', () => {
        const prompt = buildTurnoPrompt(
            'eles têm dois filhos juntos',
            'Registado: o Carlos e a Sofia têm dois filhos.',
            [],
            { tipo: 'declarativa', incerta: false },
            [{ role: 'user', content: 'o carlos gosta da sofia' }],
        );
        expect(prompt).toMatch(/conversa recente/i);
        expect(prompt).toContain('o carlos gosta da sofia');
    });

    it('sem histórico não inclui o bloco', () => {
        expect(buildTurnoPrompt('q', 'a')).not.toMatch(/conversa recente/i);
    });
});

// Contrato de estilo (#19, 3.º smoke): a nota saiu log frio — "(declarado a
// 2026-06-10)" em cada linha e título-frase. A nota é uma página de wiki viva
// para leitura humana; a proveniência vive no versionamento, não no corpo.
// Daily sem inflação (#19, re-smoke 21:18): "olá bom dia" gerou 2 bullets de
// enchimento ("a aguardar tarefa") porque o prompt EXIGIA 2 a 5. O daily nunca
// escreve mais do que aconteceu; turno trivial = [].
describe('buildTurnoPrompt: daily sem inflação', () => {
    it('permite daily vazio e proíbe encher', () => {
        const prompt = buildTurnoPrompt('q', 'a');
        expect(prompt).toMatch(/0 a 5 bullets/i);
        expect(prompt).not.toMatch(/2 a 5 bullets/i);
        expect(prompt).toMatch(/nunca mais do que foi dito|não escrevas mais do que/i);
        expect(prompt).toMatch(/"daily": \[\]/);
    });
});

describe('buildTurnoPrompt: estilo da nota', () => {
    it('manda escrever página viva em prosa, não log de declarações', () => {
        const prompt = buildTurnoPrompt('q', 'a');
        expect(prompt).toMatch(/página viva/i);
        expect(prompt).toMatch(/prosa/i);
    });

    it('proíbe carimbos de proveniência no corpo', () => {
        const prompt = buildTurnoPrompt('q', 'a');
        expect(prompt).toMatch(/proveniência/i);
        expect(prompt).toMatch(/declarado a/i); // o anti-exemplo fica explícito
    });

    it('título de factos sobre pessoas são os nomes, nunca o facto', () => {
        const prompt = buildTurnoPrompt('q', 'a');
        expect(prompt).toMatch(/"Carlos e Sofia"/);
        expect(prompt).toMatch(/nunca o facto/i);
    });
});

// Gate de pertinência (#19, 2.º smoke): a nota-lixo "coisas que acontecem"
// capturou o facto da Sofia — continuar só quando o assunto pertence à nota.
describe('blocoCandidatos com gate de pertinência', () => {
    it('continua só se o assunto pertencer; lixo/teste não captura factos', () => {
        const prompt = buildTurnoPrompt('q', 'a', [
            {
                id: 'id-x',
                slug: 'coisas-que-acontecem',
                title: 'coisas que acontecem',
                contentMd: '# coisas que acontecem',
            },
        ]);
        expect(prompt).toMatch(/APENAS se o facto pertencer/i);
        expect(prompt).toMatch(/genéric|teste|quase vazia/i);
    });
});

describe('parseTurno', () => {
    it('extrai resumo (bullets) e nota de um bloco json combinado', () => {
        const raw =
            '```json\n' +
            '{"daily":["fez X","decidiu Y"],' +
            '"nota":{"title":"T","content_md":"c","links":[],"reason":"r"}}\n' +
            '```';
        expect(parseTurno(raw)).toEqual({
            resumoMd: '- fez X\n- decidiu Y',
            nota: { title: 'T', content_md: 'c', links: [], reason: 'r' },
        });
    });

    it('nota null: devolve só o resumo, sem nota', () => {
        const raw = '{"daily":["só registo"],"nota":null}';
        expect(parseTurno(raw)).toEqual({ resumoMd: '- só registo', nota: null });
    });

    // Turno trivial: "daily": [] deliberado fica vazio (sem o fallback do
    // parseDailyCapture), para o aplicarDailyTurno poder não escrever nada.
    it('daily [] deliberado devolve resumo vazio, sem bullet de fallback', () => {
        const raw = '{"daily":[],"nota":null}';
        expect(parseTurno(raw)).toEqual({ resumoMd: '', nota: null });
    });

    it('daily como string também vira bullets', () => {
        const raw = '{"daily":"- linha um\\n- linha dois","nota":null}';
        expect(parseTurno(raw)).toEqual({ resumoMd: '- linha um\n- linha dois', nota: null });
    });

    it('json inválido: trata o texto como bullets do daily e nota null (daily sobrevive)', () => {
        const raw = '- bullet solto\n- outro bullet';
        expect(parseTurno(raw)).toEqual({
            resumoMd: '- bullet solto\n- outro bullet',
            nota: null,
        });
    });

    it('nota com campos em falta é descartada, mas o resumo mantém-se', () => {
        const raw = '{"daily":["x"],"nota":{"title":"sem corpo"}}';
        expect(parseTurno(raw)).toEqual({ resumoMd: '- x', nota: null });
    });

    it('extrai a nota mesmo quando o content_md tem um bloco de código (fence interno)', () => {
        const raw =
            '```json\n' +
            '{"daily":["x"],"nota":{"title":"T","content_md":"exemplo:\\n```js\\nx=1\\n```","links":[],"reason":"r"}}\n' +
            '```';
        const out = parseTurno(raw);
        expect(out.nota?.title).toBe('T');
        expect(out.nota?.content_md).toContain('x=1');
    });
});

describe('buildTurnoPrompt: summary auto (#22)', () => {
    it('pede o summary no envelope e manda re-resumir a nota inteira', () => {
        const prompt = buildTurnoPrompt('q', 'a');
        expect(prompt).toContain('"summary": "resumo de 1 frase"');
        expect(prompt).toContain('REGRA PARA summary');
        expect(prompt).toContain('NOTA INTEIRA');
        expect(prompt).toContain('re-resume o todo');
    });
});

describe('parseTurno: summary auto (#22)', () => {
    it('passa o summary da nota quando o envelope o traz', () => {
        const raw =
            '{"daily":["x"],"nota":{"title":"T","content_md":"c","links":[],"reason":"r","summary":"resumo da nota"}}';
        expect(parseTurno(raw).nota).toEqual({
            title: 'T',
            content_md: 'c',
            links: [],
            reason: 'r',
            summary: 'resumo da nota',
        });
    });

    it('nota sem summary continua válida (campo opcional)', () => {
        const raw = '{"daily":["x"],"nota":{"title":"T","content_md":"c","links":[],"reason":"r"}}';
        expect(parseTurno(raw).nota?.summary).toBeUndefined();
        expect(parseTurno(raw).nota?.title).toBe('T');
    });
});
