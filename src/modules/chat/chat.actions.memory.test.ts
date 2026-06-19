import { beforeEach, describe, expect, it, vi } from 'vitest';

const convId = '11111111-1111-4111-8111-111111111111';
const userMsgId = '22222222-2222-4222-8222-222222222222';
const assistantMsgId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';
const jobId = '55555555-5555-4555-8555-555555555555';

const abrirOuReusarSessaoComMock = vi.fn();
const registarObservacaoComMock = vi.fn();
const respondMock = vi.fn();

function fakeDb() {
    let messageInserts = 0;
    return {
        auth: {
            getUser: vi.fn(async () => ({
                data: { user: { id: 'user-1' } },
            })),
        },
        from: vi.fn((table: string) => {
            if (table !== 'messages') throw new Error(`tabela inesperada: ${table}`);
            return {
                insert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        single: vi.fn(async () => {
                            messageInserts += 1;
                            return {
                                data:
                                    messageInserts === 1
                                        ? { id: userMsgId, created_at: '2026-06-19T10:00:00Z' }
                                        : {
                                              id: assistantMsgId,
                                              created_at: '2026-06-19T10:00:01Z',
                                          },
                                error: null,
                            };
                        }),
                    })),
                })),
            };
        }),
    };
}

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => fakeDb()),
}));

vi.mock('./chat.conversas', () => ({
    garantirConversaCom: vi.fn(async () => convId),
    listarConversas: vi.fn(),
    ultimasMensagensCom: vi.fn(async () => []),
}));

vi.mock('./chat.indexing', () => ({
    indexarMensagensChatCom: vi.fn(async () => undefined),
}));

vi.mock('./chat.jobs', () => ({
    criarDestilacaoJobCom: vi.fn(async () => jobId),
    reclamarDestilacaoJobCom: vi.fn(),
    estadoDestilacaoJobCom: vi.fn(),
    concluirDestilacaoJobCom: vi.fn(),
    falharDestilacaoJobCom: vi.fn(),
}));

vi.mock('./chat.service', () => ({
    respond: respondMock,
}));

vi.mock('@/modules/memory/memory.service', () => ({
    abrirOuReusarSessaoCom: abrirOuReusarSessaoComMock,
    registarObservacaoCom: registarObservacaoComMock,
}));

describe('chat.actions + memória operacional', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        abrirOuReusarSessaoComMock.mockResolvedValue({ id: sessionId });
        registarObservacaoComMock.mockResolvedValue({ id: 'obs-1' });
        respondMock.mockResolvedValue({
            answer: 'Resposta do assistente',
            sources: [],
            costUsd: null,
            tokensIn: null,
            tokensCache: null,
            tokensOut: null,
            provider: 'claude',
            latencyMs: 123,
            modelo: 'claude-opus',
            modeloPedido: 'opus',
        });
    });

    it('ask cria sessão e regista pergunta/resposta como observações', async () => {
        const { ask } = await import('./chat.actions');

        const result = await ask({ question: 'O que ficou por fazer?' });

        expect(result.conversationId).toBe(convId);
        expect(result.distillationJobId).toBe(jobId);
        expect(abrirOuReusarSessaoComMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                conversationId: convId,
                operator: 'web',
                runner: 'chat',
            }),
        );
        expect(registarObservacaoComMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                sessionId,
                conversationId: convId,
                type: 'user-prompt',
                content: 'O que ficou por fazer?',
                metadata: { messageId: userMsgId },
            }),
        );
        expect(registarObservacaoComMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                sessionId,
                conversationId: convId,
                type: 'assistant-response',
                content: 'Resposta do assistente',
                metadata: expect.objectContaining({
                    messageId: assistantMsgId,
                    provider: 'claude',
                    sourcesCount: 0,
                    latencyMs: 123,
                }),
            }),
        );
    });
});
