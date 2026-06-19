import { describe, it, expect } from 'vitest';
import { parseVideoId, formatTimestamp, limparTranscript } from './youtube';

describe('parseVideoId', () => {
    it('extrai o id de watch?v=', () => {
        expect(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });
    it('extrai de youtu.be e ignora params extra', () => {
        expect(parseVideoId('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('dQw4w9WgXcQ');
        expect(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe(
            'dQw4w9WgXcQ',
        );
    });
    it('apanha m.youtube e /shorts/', () => {
        expect(parseVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
        expect(parseVideoId('https://www.youtube.com/shorts/abc123XYZ_-')).toBe('abc123XYZ_-');
    });
    it('devolve null para o que não é YouTube', () => {
        expect(parseVideoId('https://example.com/watch?v=x')).toBeNull();
        expect(parseVideoId('não é url')).toBeNull();
    });
});

describe('formatTimestamp', () => {
    it('mm:ss abaixo de uma hora', () => {
        expect(formatTimestamp(0)).toBe('00:00');
        expect(formatTimestamp(75_000)).toBe('01:15');
    });
    it('h:mm:ss a partir de uma hora', () => {
        expect(formatTimestamp(3_675_000)).toBe('1:01:15');
    });
});

describe('limparTranscript', () => {
    const seg = (text: string, s: number) => ({ text, offsetMs: s * 1000 });

    it('junta os segmentos em texto corrido, sem timestamps por-segmento', () => {
        const t = limparTranscript([seg('olá', 0), seg('mundo', 2), seg('isto é um teste', 4)]);
        expect(t).toContain('olá mundo isto é um teste');
        // o tempo 0:02 não aparece como marcador por-segmento
        expect(t).not.toContain('00:02');
    });

    it('mete uma âncora [mm:ss] no início e a cada ~30s', () => {
        const t = limparTranscript([
            seg('início', 0),
            seg('ainda no primeiro bloco', 10),
            seg('passados trinta segundos', 31),
            seg('mais texto', 35),
        ]);
        expect(t.startsWith('[00:00]')).toBe(true);
        expect(t).toContain('[00:30]'); // a âncora cai no bucket dos 30s
        expect(t).toContain('passados trinta segundos');
    });

    it('limpa espaços/linhas a mais e ignora segmentos vazios', () => {
        const t = limparTranscript([seg('  a  ', 0), seg('', 1), seg('b', 2)]);
        expect(t).toBe('[00:00] a b');
    });

    it('remove anotações de não-fala ([Music]/[Applause]/[Aplausos]) — ruído p/ o RAG', () => {
        const t = limparTranscript([
            seg('[Music] [Applause] olá a todos', 0),
            seg('[Aplausos]', 2),
            seg('isto é o conteúdo', 4),
        ]);
        expect(t).toBe('[00:00] olá a todos isto é o conteúdo');
        expect(t).not.toMatch(/Music|Applause|Aplausos/i);
        // a âncora de tempo (dígitos entre parênteses retos) sobrevive
        expect(t.startsWith('[00:00]')).toBe(true);
    });
});
