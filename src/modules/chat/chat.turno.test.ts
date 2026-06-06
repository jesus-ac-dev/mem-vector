import { describe, it, expect } from 'vitest';
import { parseTurno, buildTurnoPrompt } from './chat.turno';

describe('buildTurnoPrompt com candidatos', () => {
    it('lista as notas existentes e manda continuar reutilizando o título exato', () => {
        const prompt = buildTurnoPrompt('q', 'a', [
            {
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
