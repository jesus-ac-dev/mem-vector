import { describe, it, expect } from 'vitest';
import { parseTurno } from './chat.turno';

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
});
