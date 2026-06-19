import { describe, it, expect } from 'vitest';
import { labelFerramenta } from './chat.service';

describe('labelFerramenta (#100)', () => {
    it('mapeia o nome da tool MCP para um passo legível, sem o prefixo', () => {
        expect(labelFerramenta('mcp__memvector__procurar_web')).toBe('a procurar na web');
        expect(labelFerramenta('mcp__memvector__ler_nota')).toBe('a ler uma nota');
        expect(labelFerramenta('mcp__memvector__listar_tarefas_abertas')).toBe('a ver as tarefas');
    });
    it('cai num passo genérico para tools desconhecidas', () => {
        expect(labelFerramenta('mcp__memvector__tool_nova')).toBe('a usar uma ferramenta');
    });
});
