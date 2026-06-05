import { describe, it, expect } from 'vitest';
import { diffLines } from './knowledge.diff';

describe('diffLines', () => {
    it('marca linhas iguais, adicionadas e removidas', () => {
        const d = diffLines('a\nb\nc', 'a\nB\nc');
        expect(d).toEqual([
            { op: 'same', text: 'a' },
            { op: 'del', text: 'b' },
            { op: 'add', text: 'B' },
            { op: 'same', text: 'c' },
        ]);
    });
    it('tudo novo quando o anterior é vazio', () => {
        expect(diffLines('', 'x')).toEqual([{ op: 'add', text: 'x' }]);
    });
});
