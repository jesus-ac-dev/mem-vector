import { describe, expect, it } from 'vitest';
import {
    buildClaudeArgs,
    buildClaudeAgenticArgs,
    buildClaudeAgenticStreamArgs,
    buildClaudeStreamArgs,
    claudeAgenticTimeoutMs,
    claudeConcurrency,
    claudeTimeoutMs,
    createAsyncSemaphore,
    interpretarLinhaStream,
    modeloPrincipal,
    tokensDoEnvelopeClaude,
} from './claude';

describe('modeloPrincipal (#183)', () => {
    it('escolhe o modelo de maior custo, não a 1ª chave (haiku interno no agentic)', () => {
        // No agentic o CLI reporta o principal (opus, caro) + um interno (haiku,
        // barato). A 1ª chave calhava ser o haiku — o de maior custo é o que respondeu.
        const modelUsage = {
            'claude-haiku-4-5-20251001': { costUSD: 0.02, outputTokens: 80 },
            'claude-opus-4-8': { costUSD: 0.81, outputTokens: 5551 },
        };
        expect(modeloPrincipal(modelUsage)).toBe('claude-opus-4-8');
    });

    it('com um só modelo devolve esse', () => {
        expect(modeloPrincipal({ 'claude-opus-4-8': { costUSD: 0.14 } })).toBe('claude-opus-4-8');
    });

    it('ignora custos não finitos e preserva a ordem em empate/sem custo', () => {
        expect(
            modeloPrincipal({
                'claude-haiku-4-5-20251001': { costUSD: Number.NaN },
                'claude-opus-4-8': { costUSD: 0.14 },
            }),
        ).toBe('claude-opus-4-8');

        expect(
            modeloPrincipal({
                'claude-sonnet-4-5': { inputTokens: 10 },
                'claude-haiku-4-5-20251001': { outputTokens: 5 },
            }),
        ).toBe('claude-sonnet-4-5');
    });

    it('sem modelUsage devolve undefined', () => {
        expect(modeloPrincipal(undefined)).toBeUndefined();
        expect(modeloPrincipal({})).toBeUndefined();
    });
});

describe('claudeTimeoutMs', () => {
    it('usa valor positivo vindo do ambiente', () => {
        expect(claudeTimeoutMs('3000')).toBe(3000);
    });

    it('cai no default para valores inválidos', () => {
        expect(claudeTimeoutMs('0')).toBe(120_000);
        expect(claudeTimeoutMs('-1')).toBe(120_000);
        expect(claudeTimeoutMs('nope')).toBe(120_000);
    });
});

describe('claudeConcurrency', () => {
    it('usa inteiro positivo vindo do ambiente', () => {
        expect(claudeConcurrency('2')).toBe(2);
    });

    it('cai no default para valores inválidos', () => {
        expect(claudeConcurrency('0')).toBe(1);
        expect(claudeConcurrency('-1')).toBe(1);
        expect(claudeConcurrency('1.5')).toBe(1);
        expect(claudeConcurrency('nope')).toBe(1);
    });
});

describe('buildClaudeArgs', () => {
    it('nao coloca o prompt na argv para permitir stdin', () => {
        const args = buildClaudeArgs();

        expect(args).toContain('-p');
        expect(args).toContain('--input-format');
        expect(args).toContain('text');
        expect(args).not.toContain('prompt enorme');
    });
});

describe('isolamento do host (#117)', () => {
    const cfg = {
        mcpConfig: '{"mcpServers":{}}',
        allowedTools: ['mcp__memvector__criar_nota'],
        systemPrompt: 'contrato',
    };
    const builders: Array<[string, () => string[]]> = [
        ['buildClaudeArgs', () => buildClaudeArgs()],
        ['buildClaudeStreamArgs', () => buildClaudeStreamArgs()],
        ['buildClaudeAgenticArgs', () => buildClaudeAgenticArgs(cfg)],
        ['buildClaudeAgenticStreamArgs', () => buildClaudeAgenticStreamArgs(cfg)],
    ];

    // O runner usa a subscrição do host (login vive no ~/.claude), mas NÃO pode
    // herdar o comportamento do andaime: CLAUDE.md, hooks, settings e skills.
    it.each(builders)(
        '%s não carrega nenhuma fonte de settings do host (--setting-sources vazio)',
        (_nome, build) => {
            const args = build();
            const i = args.indexOf('--setting-sources');
            expect(i).toBeGreaterThanOrEqual(0);
            // string vazia = nenhuma fonte (user/project/local) → sem CLAUDE.md,
            // hooks nem settings do ~/.claude. O login não é uma fonte: mantém-se.
            expect(args[i + 1]).toBe('');
        },
    );

    it.each(builders)(
        '%s proíbe a tool Skill (as skills dos plugins do host ficam inertes)',
        (_nome, build) => {
            const args = build();
            expect(args).toContain('--disallowedTools');
            expect(args).toContain('Skill');
        },
    );
});

describe('buildClaudeAgenticArgs', () => {
    const cfg = {
        mcpConfig: '{"mcpServers":{}}',
        allowedTools: ['mcp__memvector__criar_nota', 'mcp__memvector__ler_nota'],
        systemPrompt: 'contrato',
    };

    it('liga as tools MCP em vez de proibir tudo, mantendo built-ins proibidas', () => {
        const args = buildClaudeAgenticArgs(cfg);

        expect(args).toContain('--mcp-config');
        expect(args).toContain('--strict-mcp-config');
        expect(args).toContain('mcp__memvector__criar_nota');
        expect(args).toContain('mcp__memvector__ler_nota');
        // Built-ins continuam fora: o "filesystem" do produto é a BD.
        expect(args).toContain('--disallowedTools');
        expect(args).toContain('Bash');
        expect(args).toContain('Write');
    });

    it('limita o loop com --max-turns e mantém o prompt fora da argv', () => {
        const args = buildClaudeAgenticArgs(cfg);
        expect(args[args.indexOf('--max-turns') + 1]).toBe('15');
        expect(buildClaudeAgenticArgs({ ...cfg, maxTurns: 7 })).toContain('7');
        expect(args).not.toContain('prompt enorme');
    });

    it('passa o modelo escolhido ao CLI com --model (e omite-o sem modelo)', () => {
        // #89: o caminho agentic perdia a escolha de modelo (sonnet) e caía no
        // default da conta (opus). Espelha buildClaudeArgs: --model só quando há.
        const comModelo = buildClaudeAgenticArgs({ ...cfg, model: 'sonnet' });
        expect(comModelo[comModelo.indexOf('--model') + 1]).toBe('sonnet');

        expect(buildClaudeAgenticArgs(cfg)).not.toContain('--model');
    });
});

describe('buildClaudeAgenticStreamArgs (#100)', () => {
    const cfg = {
        mcpConfig: '{"mcpServers":{}}',
        allowedTools: ['mcp__memvector__procurar_web'],
        systemPrompt: 'contrato',
    };

    it('streama (stream-json + verbose + parciais) mantendo as tools agentic', () => {
        const args = buildClaudeAgenticStreamArgs(cfg);
        // streaming: a resposta escalada deixa de vir num bloco só
        expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
        expect(args).toContain('--verbose');
        expect(args).toContain('--include-partial-messages');
        // tools agentic intactas
        expect(args).toContain('--mcp-config');
        expect(args).toContain('mcp__memvector__procurar_web');
        expect(args).toContain('--max-turns');
        expect(args).toContain('--disallowedTools');
    });

    it('honra o modelo escolhido (e omite-o sem modelo)', () => {
        expect(buildClaudeAgenticStreamArgs({ ...cfg, model: 'sonnet' })).toContain('sonnet');
        expect(buildClaudeAgenticStreamArgs(cfg)).not.toContain('--model');
    });
});

describe('claudeAgenticTimeoutMs', () => {
    it('usa valor do ambiente e cai no default agentic (5 min)', () => {
        expect(claudeAgenticTimeoutMs('60000')).toBe(60_000);
        expect(claudeAgenticTimeoutMs('nope')).toBe(300_000);
    });
});

describe('tokensDoEnvelopeClaude', () => {
    it('soma o input fresco com os tokens de cache (o contexto real que o modelo viu)', () => {
        // Envelope real do CLI (#65): input_tokens é só o fresco; o cache lido/criado
        // foi processado na mesma. tokens_in honesto = a soma dos três.
        const usage = {
            input_tokens: 9,
            cache_creation_input_tokens: 11545,
            cache_read_input_tokens: 17283,
            output_tokens: 117,
        };
        expect(tokensDoEnvelopeClaude(usage)).toEqual({
            tokensIn: 9 + 11545 + 17283, // total (fresco + cache)
            tokensCache: 11545 + 17283, // só a porção de cache (lido + criado)
            tokensOut: 117,
        });
    });

    it('funciona sem campos de cache (só input/output)', () => {
        expect(tokensDoEnvelopeClaude({ input_tokens: 50, output_tokens: 20 })).toEqual({
            tokensIn: 50,
            tokensCache: null,
            tokensOut: 20,
        });
    });

    it('devolve nulls quando o envelope não traz usage', () => {
        expect(tokensDoEnvelopeClaude(undefined)).toEqual({
            tokensIn: null,
            tokensCache: null,
            tokensOut: null,
        });
        expect(tokensDoEnvelopeClaude({})).toEqual({
            tokensIn: null,
            tokensCache: null,
            tokensOut: null,
        });
    });
});

describe('buildClaudeStreamArgs (#66)', () => {
    it('pede stream-json com parciais (texto token-a-token)', () => {
        const args = buildClaudeStreamArgs();
        expect(args).toContain('--output-format');
        expect(args).toContain('stream-json');
        expect(args).toContain('--verbose'); // stream-json em -p exige verbose
        expect(args).toContain('--include-partial-messages');
        // built-ins continuam proibidas, como no generate normal
        expect(args).toContain('--disallowedTools');
        expect(args).not.toContain('json'); // não o one-shot 'json'
    });
});

describe('interpretarLinhaStream (#66)', () => {
    it('extrai o texto de um content_block_delta/text_delta', () => {
        const linha = JSON.stringify({
            type: 'stream_event',
            event: {
                type: 'content_block_delta',
                index: 1,
                delta: { type: 'text_delta', text: 'olá' },
            },
        });
        expect(interpretarLinhaStream(linha)).toEqual({ tipo: 'texto', texto: 'olá' });
    });

    it('ignora o thinking_delta (raciocínio interno, não é a resposta)', () => {
        const linha = JSON.stringify({
            type: 'stream_event',
            event: {
                type: 'content_block_delta',
                delta: { type: 'thinking_delta', thinking: 'hmm' },
            },
        });
        expect(interpretarLinhaStream(linha)).toEqual({ tipo: 'ignorar' });
    });

    it('do result final tira custo, modelo e tokens (cache somado)', () => {
        const linha = JSON.stringify({
            type: 'result',
            subtype: 'success',
            total_cost_usd: 0.0035,
            usage: {
                input_tokens: 10,
                cache_read_input_tokens: 200,
                cache_creation_input_tokens: 0,
                output_tokens: 5,
            },
            modelUsage: { 'claude-haiku-4-5-20251001': { inputTokens: 10 } },
        });
        expect(interpretarLinhaStream(linha)).toEqual({
            tipo: 'final',
            costUsd: 0.0035,
            model: 'claude-haiku-4-5-20251001',
            tokensIn: 210,
            tokensCache: 200,
            tokensOut: 5,
        });
    });

    it('ignora eventos de sistema, linhas vazias e JSON inválido', () => {
        expect(interpretarLinhaStream('{"type":"system","subtype":"init"}')).toEqual({
            tipo: 'ignorar',
        });
        expect(interpretarLinhaStream('')).toEqual({ tipo: 'ignorar' });
        expect(interpretarLinhaStream('não-é-json {')).toEqual({ tipo: 'ignorar' });
    });

    it('#100: início de bloco tool_use vira evento ferramenta (narração de passo)', () => {
        const linha = JSON.stringify({
            type: 'stream_event',
            event: {
                type: 'content_block_start',
                content_block: { type: 'tool_use', name: 'mcp__memvector__procurar_web' },
            },
        });
        expect(interpretarLinhaStream(linha)).toEqual({
            tipo: 'ferramenta',
            nome: 'mcp__memvector__procurar_web',
        });
        // outros content_block (texto) não são ferramenta
        const textoStart = JSON.stringify({
            type: 'stream_event',
            event: { type: 'content_block_start', content_block: { type: 'text' } },
        });
        expect(interpretarLinhaStream(textoStart)).toEqual({ tipo: 'ignorar' });
    });
});

describe('createAsyncSemaphore', () => {
    it('serializa tarefas quando a concorrencia e 1', async () => {
        const semaphore = createAsyncSemaphore(1);
        const events: string[] = [];
        let releaseFirst!: () => void;

        const first = semaphore.run(async () => {
            events.push('start:first');
            await new Promise<void>((resolve) => {
                releaseFirst = resolve;
            });
            events.push('end:first');
            return 'first';
        });
        const second = semaphore.run(async () => {
            events.push('start:second');
            return 'second';
        });

        await Promise.resolve();
        expect(events).toEqual(['start:first']);

        releaseFirst();
        await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
        expect(events).toEqual(['start:first', 'end:first', 'start:second']);
    });
});
