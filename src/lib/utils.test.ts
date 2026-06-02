import { describe, it, expect } from 'vitest';

import { cn } from '@/lib/utils';

describe('cn', () => {
    it('junta classes', () => {
        expect(cn('a', 'b')).toBe('a b');
    });

    it('resolve conflitos de Tailwind (último ganha)', () => {
        expect(cn('px-2', 'px-4')).toBe('px-4');
    });

    it('ignora valores falsy', () => {
        expect(cn('a', false, null, undefined, 'b')).toBe('a b');
    });
});
