import { describe, expect, it } from 'vitest';

import { buildCloneArgs, buildRemoteCheckArgs, remoteBate } from './github';

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
