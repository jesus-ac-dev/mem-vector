import { describe, expect, it } from 'vitest';

import {
    buildCloneArgs,
    buildIssueArgs,
    buildRemoteCheckArgs,
    numeroDoUrl,
    remoteBate,
} from './github';

describe('buildCloneArgs', () => {
    it('monta o gh repo clone repo path', () => {
        expect(buildCloneArgs('o/r', '/tmp/r')).toEqual(['repo', 'clone', 'o/r', '/tmp/r']);
    });
    it('rejeita repo mal formado', () => {
        expect(() => buildCloneArgs('sembarra', '/tmp/r')).toThrow(/owner\/nome/);
    });
    it('rejeita path vazio', () => {
        expect(() => buildCloneArgs('o/r', '  ')).toThrow(/path/);
    });
});

describe('buildRemoteCheckArgs', () => {
    it('aponta o git ao path com -C', () => {
        expect(buildRemoteCheckArgs('/tmp/r')).toEqual([
            '-C',
            '/tmp/r',
            'remote',
            'get-url',
            'origin',
        ]);
    });
});

describe('remoteBate', () => {
    it('bate em https com .git', () => {
        expect(remoteBate('https://github.com/o/r.git', 'o/r')).toBe(true);
    });
    it('bate em https sem .git', () => {
        expect(remoteBate('https://github.com/o/r', 'o/r')).toBe(true);
    });
    it('bate em ssh', () => {
        expect(remoteBate('git@github.com:o/r.git', 'o/r')).toBe(true);
    });
    it('é case-insensitive', () => {
        expect(remoteBate('https://github.com/O/R.git', 'o/r')).toBe(true);
    });
    it('não bate noutro repo', () => {
        expect(remoteBate('https://github.com/o/outro.git', 'o/r')).toBe(false);
    });
    it('não bate em string vazia', () => {
        expect(remoteBate('', 'o/r')).toBe(false);
    });
});

describe('buildIssueArgs (orchestrator: ver/labels/pr)', () => {
    it('ver = issue view --json title,body,comments,labels', () => {
        expect(buildIssueArgs({ op: 'ver', repo: 'o/r', number: 5 })).toEqual([
            'issue',
            'view',
            '5',
            '--repo',
            'o/r',
            '--json',
            'title,body,comments,labels',
        ]);
    });
    it('labels = add/remove na issue', () => {
        expect(
            buildIssueArgs({ op: 'labels', repo: 'o/r', number: 5, add: ['a'], remove: ['b'] }),
        ).toEqual([
            'issue',
            'edit',
            '5',
            '--repo',
            'o/r',
            '--add-label',
            'a',
            '--remove-label',
            'b',
        ]);
    });
    it('pr = pr create com base/head/title/body', () => {
        const a = buildIssueArgs({
            op: 'pr',
            repo: 'o/r',
            base: 'main',
            head: 'feat/issue-5',
            title: 'Relay: #5',
            body: 'Closes #5',
        });
        expect(a.slice(0, 4)).toEqual(['pr', 'create', '--repo', 'o/r']);
        expect(a[a.indexOf('--head') + 1]).toBe('feat/issue-5');
        expect(a[a.indexOf('--base') + 1]).toBe('main');
    });
});

describe('numeroDoUrl', () => {
    it('tira o número de uma issue', () => {
        expect(numeroDoUrl('https://github.com/o/r/issues/123')).toBe(123);
    });
    it('tira o número de um PR', () => {
        expect(numeroDoUrl('https://github.com/o/r/pull/7')).toBe(7);
    });
    it('null quando não bate', () => {
        expect(numeroDoUrl('https://github.com/o/r')).toBeNull();
    });
});
