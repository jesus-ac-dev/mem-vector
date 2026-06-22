import { homedir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandirHome } from './paths';

describe('expandirHome', () => {
    it('expande ~ sozinho para a home', () => {
        expect(expandirHome('~')).toBe(homedir());
    });
    it('expande ~/sub para home/sub (o spawn não passa por shell)', () => {
        expect(expandirHome('~/src/teste')).toBe(join(homedir(), 'src/teste'));
    });
    it('não toca em paths absolutos', () => {
        expect(expandirHome('/home/x/src/teste')).toBe('/home/x/src/teste');
    });
    it('não toca em paths sem ~ (relativos / Windows)', () => {
        expect(expandirHome('src/teste')).toBe('src/teste');
        expect(expandirHome('C:\\src\\teste')).toBe('C:\\src\\teste');
    });
    it('um ~ no meio não é expandido (só prefixo)', () => {
        expect(expandirHome('/a/~/b')).toBe('/a/~/b');
    });
});
