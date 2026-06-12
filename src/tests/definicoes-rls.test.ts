// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// A cifra precisa do segredo (em prod vem do .env.local).
process.env.MEMVECTOR_KEYS_SECRET ??= 'segredo-de-teste-rls';

async function userClient(email: string, password: string) {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error && !error.message.includes('already been registered')) throw error;
    const c = createAnonClient(URL, ANON);
    const { error: e2 } = await c.auth.signInWithPassword({ email, password });
    if (e2) throw e2;
    return c;
}

const AGENTES = {
    claude: {
        ativo: true,
        modo: 'cli' as const,
        modelo: undefined,
        esforco: undefined,
        apiKey: undefined,
    },
    gemini: {
        ativo: true,
        modo: 'api' as const,
        modelo: 'gemini-2.5-flash',
        esforco: undefined,
        apiKey: 'sk-key-de-teste-wxyz',
    },
};

// #60: definições por utilizador — defaults sem linha, cifra das keys,
// máscara na vista, isolamento por dono.
describe('definições (#60, integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let bruno: Awaited<ReturnType<typeof userClient>>;

    beforeAll(async () => {
        alice = await userClient('alice-definicoes@test.local', 'pw-alice-123');
        bruno = await userClient('bruno-definicoes@test.local', 'pw-bruno-123');
        const admin = getSupabaseAdmin();
        const ids = [
            (await alice.auth.getUser()).data.user!.id,
            (await bruno.auth.getUser()).data.user!.id,
        ];
        await admin.from('definicoes').delete().in('owner_id', ids);
    });

    it('sem linha devolve os defaults (one-shot, claude/cli)', { timeout: 30_000 }, async () => {
        const { lerDefinicoesVistaCom } = await import('@/modules/definicoes/definicoes.service');
        const d = await lerDefinicoesVistaCom(alice);
        expect(d.metodoDestilacao).toBe('one-shot');
        expect(d.chatProvider).toBe('claude');
        expect(d.agentes.claude?.ativo).toBe(true); // o orquestrador vivo
    });

    it(
        'grava com key: cifra at rest, mascara na vista, decifra no servidor',
        { timeout: 30_000 },
        async () => {
            const { gravarDefinicoesCom, lerDefinicoesVistaCom, lerDefinicoesServidorCom } =
                await import('@/modules/definicoes/definicoes.service');

            const vista = await gravarDefinicoesCom(alice, {
                metodoDestilacao: 'agentic',
                modulosAtivos: ['github'],
                chatProvider: 'gemini',
                agentes: AGENTES,
            });
            // Vista (cliente): a key NUNCA aparece — só a máscara.
            expect(vista.agentes.gemini?.temApiKey).toBe(true);
            expect(vista.agentes.gemini?.apiKeySufixo).toBe('wxyz');
            expect(JSON.stringify(vista)).not.toContain('sk-key-de-teste');

            // At rest: cifrada (prefixo gcm:), nunca plaintext.
            const { data: row } = await alice.from('definicoes').select('agentes').single();
            const cifrada = (row!.agentes as Record<string, { apiKeyCifrada?: string }>).gemini
                .apiKeyCifrada!;
            expect(cifrada.startsWith('gcm:')).toBe(true);
            expect(cifrada).not.toContain('sk-key-de-teste');

            // Servidor (factory): decifra.
            const servidor = await lerDefinicoesServidorCom(alice);
            expect(servidor.agentes.gemini?.apiKey).toBe('sk-key-de-teste-wxyz');
            expect(servidor.chatProvider).toBe('gemini');

            // Regravar SEM apiKey mantém a key existente.
            await gravarDefinicoesCom(alice, {
                metodoDestilacao: 'one-shot',
                modulosAtivos: [],
                chatProvider: 'claude',
                agentes: { ...AGENTES, gemini: { ...AGENTES.gemini, apiKey: undefined } },
            });
            const depois = await lerDefinicoesVistaCom(alice);
            expect(depois.agentes.gemini?.temApiKey).toBe(true);

            // O Bruno continua nos defaults dele.
            const doBruno = await lerDefinicoesVistaCom(bruno);
            expect(doBruno.chatProvider).toBe('claude');
            expect(doBruno.agentes.gemini).toBeUndefined();
        },
    );

    // r13: o bug do gemini do Carlos — a config tem de ser respeitada de
    // ponta a ponta (gravar → ler → runtime), e a escolha do chat é
    // CIRÚRGICA (nunca toca em modo/keys que não editou).
    it(
        'modelos viajam no gravar e a escolha do chat não esmaga modo/key',
        { timeout: 30_000 },
        async () => {
            const { gravarDefinicoesCom, gravarEscolhaChatCom, lerDefinicoesServidorCom } =
                await import('@/modules/definicoes/definicoes.service');
            const { criarProvider } = await import('@/lib/providers/factory');

            await gravarDefinicoesCom(alice, {
                metodoDestilacao: 'one-shot',
                modulosAtivos: [],
                chatProvider: 'claude',
                agentes: {
                    ...AGENTES,
                    gemini: {
                        ...AGENTES.gemini,
                        modelos: ['gemini-2.5-flash', 'gemini-2.5-pro'],
                    },
                },
            });
            let servidor = await lerDefinicoesServidorCom(alice);
            expect(servidor.agentes.gemini?.modelos).toEqual([
                'gemini-2.5-flash',
                'gemini-2.5-pro',
            ]);

            // Escolha cirúrgica: muda chat_provider + modelo, NADA mais.
            await gravarEscolhaChatCom(alice, { provider: 'gemini', modelo: 'gemini-2.5-pro' });
            servidor = await lerDefinicoesServidorCom(alice);
            expect(servidor.chatProvider).toBe('gemini');
            expect(servidor.agentes.gemini?.modelo).toBe('gemini-2.5-pro');
            expect(servidor.agentes.gemini?.modo).toBe('api'); // intacto
            expect(servidor.agentes.gemini?.apiKey).toBe('sk-key-de-teste-wxyz'); // intacta
            expect(servidor.agentes.claude?.ativo).toBe(true); // os outros intactos

            // null = limpar o modelo (volta ao default do provider).
            await gravarEscolhaChatCom(alice, { provider: 'gemini', modelo: null });
            servidor = await lerDefinicoesServidorCom(alice);
            expect(servidor.agentes.gemini?.modelo).toBeUndefined();
            expect(servidor.agentes.gemini?.apiKey).toBe('sk-key-de-teste-wxyz'); // continua

            // Provider NUNCA parametrizado: muda a escolha, mas NÃO cria
            // meia-config fantasma (o bug original do gemini).
            await gravarEscolhaChatCom(alice, { provider: 'ollama', modelo: 'llama3.2' });
            servidor = await lerDefinicoesServidorCom(alice);
            expect(servidor.chatProvider).toBe('ollama');
            expect(servidor.agentes.ollama).toBeUndefined(); // sem entrada fabricada

            // Runtime respeita a config: com modo api, o factory toma o ramo
            // API (que exige key) — nunca o binário. Sem key dá o erro do
            // ramo api, deterministicamente e sem rede.
            const instancia = criarProvider('gemini', {
                ...servidor.agentes.gemini!,
                apiKey: undefined,
            });
            await expect(instancia.gerar('x')).rejects.toThrow(/API key em falta/);
        },
    );
});
