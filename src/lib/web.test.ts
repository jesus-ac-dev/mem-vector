import { describe, expect, it } from 'vitest';

import { lerUrl, parseDdgHtml } from './web';

// Fixture com a forma REAL do SERP HTML da DDG (capturado do endpoint
// html.duckduckgo.com): o href real vem urlencoded no parâmetro `uddg`.
const HTML = `
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnextjs.org%2F&amp;rut=abc">Next.js by Vercel - The React Framework</a>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnextjs.org%2F">Next.js is the React framework for the web.</a>
</div>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Freleases&amp;rut=def">Releases &middot; vercel/next.js - GitHub</a>
  <a class="result__snippet" href="x">Latest <b>releases</b> of Next.js.</a>
</div>`;

describe('parseDdgHtml (#45)', () => {
    it('extrai título, URL real (descodificada do uddg) e snippet', () => {
        const r = parseDdgHtml(HTML);
        expect(r).toHaveLength(2);
        expect(r[0]).toEqual({
            titulo: 'Next.js by Vercel - The React Framework',
            url: 'https://nextjs.org/',
            snippet: 'Next.js is the React framework for the web.',
        });
        expect(r[1].url).toBe('https://github.com/vercel/next.js/releases');
        // tags HTML do snippet (<b>) são limpas
        expect(r[1].snippet).toBe('Latest releases of Next.js.');
    });

    it('HTML sem resultados (bloqueio/limite) → lista vazia', () => {
        expect(parseDdgHtml('<html><body>no results</body></html>')).toEqual([]);
    });

    it('descarta resultados que apontam para rede interna (anti-SSRF)', () => {
        const html = `
<a class="result__a" href="//duckduckgo.com/l/?uddg=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F&amp;rut=x">metadata</a>
<a class="result__a" href="//duckduckgo.com/l/?uddg=http%3A%2F%2Flocalhost%3A3000%2Fapi&amp;rut=y">localhost</a>
<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnextjs.org%2F&amp;rut=z">externo</a>`;
        const r = parseDdgHtml(html);
        expect(r).toHaveLength(1);
        expect(r[0].url).toBe('https://nextjs.org/');
    });

    it('descarta uddg com esquema não-http (anti javascript:)', () => {
        const html = `<a class="result__a" href="//duckduckgo.com/l/?uddg=javascript%3Aalert(1)&amp;rut=x">xss</a>`;
        expect(parseDdgHtml(html)).toEqual([]);
    });
});

describe('lerUrl (#45) — anti-SSRF', () => {
    it('rejeita esquema não-http', async () => {
        await expect(lerUrl('file:///etc/passwd')).rejects.toThrow('URL inválido');
    });

    it('rejeita rede interna (localhost, metadata, ranges privados)', async () => {
        await expect(lerUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
            'rede interna',
        );
        await expect(lerUrl('http://localhost:3000/api')).rejects.toThrow('rede interna');
        await expect(lerUrl('http://192.168.1.1/')).rejects.toThrow('rede interna');
    });
});
