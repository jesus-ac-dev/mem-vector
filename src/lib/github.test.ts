import { describe, it, expect } from 'vitest';

import { buildIssueArgs, extrairUrl } from './github';

// M7: o arg-builder do gh é o núcleo testável do transporte (o spawn é fino).
describe('github buildIssueArgs (M7)', () => {
    it('criar issue', () => {
        expect(
            buildIssueArgs({
                op: 'criar',
                repo: 'jesus-ac-dev/mem-vector',
                title: 'Corrigir X',
                body: 'contexto completo',
            }),
        ).toEqual([
            'issue',
            'create',
            '--repo',
            'jesus-ac-dev/mem-vector',
            '--title',
            'Corrigir X',
            '--body',
            'contexto completo',
        ]);
    });

    it('ler issues com defaults (open, 20, json)', () => {
        expect(buildIssueArgs({ op: 'ler', repo: 'o/r' })).toEqual([
            'issue',
            'list',
            '--repo',
            'o/r',
            '--state',
            'open',
            '--limit',
            '20',
            '--json',
            'number,title,state,url',
        ]);
    });

    it('comentar issue (número vira string)', () => {
        expect(buildIssueArgs({ op: 'comentar', repo: 'o/r', number: 7, body: 'oi' })).toEqual([
            'issue',
            'comment',
            '7',
            '--repo',
            'o/r',
            '--body',
            'oi',
        ]);
    });

    it('rejeita repo malformado (sem barra)', () => {
        expect(() =>
            buildIssueArgs({ op: 'criar', repo: 'sembarra', title: 'T', body: 'B' }),
        ).toThrow(/owner\/nome/);
    });
});

describe('github extrairUrl (M7)', () => {
    it('extrai o URL mesmo com preâmbulo no stdout', () => {
        expect(extrairUrl('Creating issue...\nhttps://github.com/o/r/issues/12\n')).toBe(
            'https://github.com/o/r/issues/12',
        );
    });

    it('só o URL → devolve-o', () => {
        expect(extrairUrl('https://github.com/o/r/issues/3')).toBe(
            'https://github.com/o/r/issues/3',
        );
    });

    it('sem URL → devolve o stdout aparado (fallback)', () => {
        expect(extrairUrl('  algo inesperado  ')).toBe('algo inesperado');
    });
});
