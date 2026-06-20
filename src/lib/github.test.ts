import { describe, it, expect } from 'vitest';

import { buildIssueArgs } from './github';

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
