import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PROVIDERS } from '@/modules/definicoes/definicoes.schema';

import { ProviderIcon } from './provider-icon';

describe('ProviderIcon', () => {
    it('cada provider rende um logo SVG (não uma sigla de letra)', () => {
        for (const provider of PROVIDERS) {
            const { container } = render(<ProviderIcon provider={provider} />);
            const svg = container.querySelector('svg');
            expect(svg, `provider ${provider} devia render um <svg>`).not.toBeNull();
            // Os logos são path único, sem texto da sigla (C/Cx/G/Ol).
            expect(svg?.querySelector('path')).not.toBeNull();
            expect(container.textContent).toBe('');
        }
    });

    it('é decorativo (aria-hidden) e propaga o className de tamanho', () => {
        const { container } = render(<ProviderIcon provider="claude" className="h-5 w-5" />);
        const span = container.firstElementChild;
        expect(span?.getAttribute('aria-hidden')).toBe('true');
        expect(span?.className).toContain('h-5');
        expect(span?.className).toContain('w-5');
    });

    it('mantém cor de marca onde existe e currentColor nos logos monocromáticos', () => {
        expect(
            render(<ProviderIcon provider="claude" />).container.querySelector('svg'),
        ).toHaveAttribute('fill', '#D97757');
        expect(
            render(<ProviderIcon provider="gemini" />).container.querySelector('svg'),
        ).toHaveAttribute('fill', '#8E75B2');
        expect(
            render(<ProviderIcon provider="codex" />).container.querySelector('svg'),
        ).toHaveAttribute('fill', 'currentColor');
        expect(
            render(<ProviderIcon provider="ollama" />).container.querySelector('svg'),
        ).toHaveAttribute('fill', 'currentColor');
    });
});
