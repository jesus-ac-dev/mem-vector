import { describe, expect, it } from 'vitest';
import {
    buildDailyCapturePrompt,
    formatDailyTurnoEntry,
    horaLisboa,
    parseDailyCapture,
} from './daily.capture';

describe('daily.capture', () => {
    it('monta prompt de recap sem pedir resposta ao utilizador', () => {
        const prompt = buildDailyCapturePrompt('Como fazemos daily?', 'Criamos dailies na BD.');

        expect(prompt).toContain('Daily Notes');
        expect(prompt).toContain('[Utilizador]');
        expect(prompt).toContain('Como fazemos daily?');
        expect(prompt).toContain('[Assistente]');
        expect(prompt).toContain('Criamos dailies na BD.');
        expect(prompt).toContain('so escreve o recap');
    });

    it('normaliza output livre em bullets markdown', () => {
        expect(parseDailyCapture('Resumo\n* fez X\n- fez Y')).toBe('- Resumo\n- fez X\n- fez Y');
    });

    it('formata entrada diária com heading horário e link para knowledge quando existe', () => {
        const entry = formatDailyTurnoEntry({
            hora: '09:45',
            resumoMd: '- User pediu daily\n- Assistente explicou o fluxo',
            nota: { slug: 'daily-notes', title: 'Daily Notes', criada: true },
        });

        expect(entry).toBe(
            '### 09:45\n' +
                '- User pediu daily\n' +
                '- Assistente explicou o fluxo\n' +
                '- Estado escrito: [[daily-notes]] (criada: Daily Notes)',
        );
    });

    it('calcula hora de Lisboa de forma determinística', () => {
        expect(horaLisboa(new Date('2026-06-06T08:30:00.000Z'))).toBe('09:30');
    });
});
