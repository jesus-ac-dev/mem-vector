import { describe, expect, it } from 'vitest';

import { temCookieAuthSupabase } from './middleware';

describe('temCookieAuthSupabase', () => {
    it('deteta cookies Supabase de sessão sem olhar para valores', () => {
        expect(
            temCookieAuthSupabase([
                { name: 'foo' },
                { name: 'sb-proj-auth-token' },
                { name: 'sb-proj-auth-token.0' },
            ]),
        ).toBe(true);
    });

    it('não trata qualquer cookie sb-* como sessão', () => {
        expect(temCookieAuthSupabase([{ name: 'sb-proj-other' }, { name: 'theme' }])).toBe(false);
    });
});
