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

    it(
        'sem linha = sem provider ativo (#40 caminho a: o user configura)',
        { timeout: 30_000 },
        async () => {
            const { lerDefinicoesVistaCom } =
                await import('@/modules/definicoes/definicoes.service');
            const d = await lerDefinicoesVistaCom(alice);
            expect(d.metodoDestilacao).toBe('one-shot');
            // Sem defaults: nenhum agente herda a conta da máquina.
            expect(Object.keys(d.agentes)).toHaveLength(0);
        },
    );

    it(
        'sem provider ativo, providerDoChatCom lança (não cai na conta da máquina)',
        { timeout: 30_000 },
        async () => {
            const { providerDoChatCom } = await import('@/lib/providers/factory');
            await expect(providerDoChatCom(alice)).rejects.toThrow(/Configura um provider/);
        },
    );

    it(
        'row gravada com agentes vazios = sem provider ativo (2.ª via fechada)',
        { timeout: 30_000 },
        async () => {
            const { gravarDefinicoesCom, lerDefinicoesServidorCom } =
                await import('@/modules/definicoes/definicoes.service');
            const { providerDoChatCom } = await import('@/lib/providers/factory');
            // Gravar SEM ativar provider já não re-injeta claude/cli.
            await gravarDefinicoesCom(bruno, {
                metodoDestilacao: 'one-shot',
                modulosAtivos: [],
                chatProvider: 'claude',
                matchCount: 5,
                webHabilitada: false,
                agentes: {},
            });
            const servidor = await lerDefinicoesServidorCom(bruno);
            expect(Object.keys(servidor.agentes)).toHaveLength(0);
            await expect(providerDoChatCom(bruno)).rejects.toThrow(/Configura um provider/);
        },
    );

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
                matchCount: 5,
                webHabilitada: false,
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
                matchCount: 5,
                webHabilitada: false,
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

    // #45: a key de pesquisa web (Tavily) segue o MESMO contrato das keys dos
    // providers — cifra at rest, mascara na vista, decifra no servidor.
    it(
        'web key (#45): cifra at rest, mascara na vista, decifra no servidor',
        { timeout: 30_000 },
        async () => {
            const { gravarDefinicoesCom, lerDefinicoesVistaCom, lerDefinicoesServidorCom } =
                await import('@/modules/definicoes/definicoes.service');

            const vista = await gravarDefinicoesCom(alice, {
                metodoDestilacao: 'one-shot',
                modulosAtivos: [],
                chatProvider: 'claude',
                matchCount: 5,
                webHabilitada: true,
                webKey: 'tavily-key-de-teste-1234',
                agentes: {},
            });
            // Vista: a key nunca aparece — só a máscara.
            expect(vista.webTemKey).toBe(true);
            expect(vista.webKeySufixo).toBe('1234');
            expect(JSON.stringify(vista)).not.toContain('tavily-key-de-teste');

            // At rest: cifrada (gcm:), nunca plaintext.
            const { data: row } = await alice.from('definicoes').select('web_key_cifrada').single();
            const cifrada = (row as { web_key_cifrada: string }).web_key_cifrada;
            expect(cifrada.startsWith('gcm:')).toBe(true);
            expect(cifrada).not.toContain('tavily-key-de-teste');

            // Servidor: decifra.
            const servidor = await lerDefinicoesServidorCom(alice);
            expect(servidor.webKey).toBe('tavily-key-de-teste-1234');

            // Regravar sem webKey (undefined) mantém a key.
            await gravarDefinicoesCom(alice, {
                metodoDestilacao: 'one-shot',
                modulosAtivos: [],
                chatProvider: 'claude',
                matchCount: 5,
                webHabilitada: true,
                agentes: {},
            });
            const depois = await lerDefinicoesVistaCom(alice);
            expect(depois.webTemKey).toBe(true);
        },
    );

    // M7 Fatia 1: o token GitHub (PAT) segue o MESMO contrato das keys — cifra
    // at rest, máscara na vista, decifra no servidor. github_repos viajam em
    // claro (não são segredo) e o GH_TOKEN do subprocesso usa o token decifrado.
    it(
        'github (M7): token cifra/mascara/decifra + repos ligados',
        { timeout: 30_000 },
        async () => {
            const { gravarDefinicoesCom, lerDefinicoesVistaCom, lerDefinicoesServidorCom } =
                await import('@/modules/definicoes/definicoes.service');

            const vista = await gravarDefinicoesCom(alice, {
                metodoDestilacao: 'one-shot',
                modulosAtivos: ['github'],
                chatProvider: 'claude',
                matchCount: 5,
                webHabilitada: false,
                githubToken: 'github_pat_de_teste_5678',
                githubRepos: ['jesus-ac-dev/mem-vector'],
                agentes: {},
            });
            // Vista: o token NUNCA aparece — só a máscara; os repos sim.
            expect(vista.githubTemToken).toBe(true);
            expect(vista.githubKeySufixo).toBe('5678');
            expect(vista.githubRepos).toEqual(['jesus-ac-dev/mem-vector']);
            expect(JSON.stringify(vista)).not.toContain('github_pat_de_teste');

            // At rest: cifrada (gcm:), nunca plaintext.
            const { data: row } = await alice
                .from('definicoes')
                .select('github_token_cifrada')
                .single();
            const cifrada = (row as { github_token_cifrada: string }).github_token_cifrada;
            expect(cifrada.startsWith('gcm:')).toBe(true);
            expect(cifrada).not.toContain('github_pat_de_teste');

            // Servidor: decifra (é o que vira GH_TOKEN do subprocesso).
            const servidor = await lerDefinicoesServidorCom(alice);
            expect(servidor.githubToken).toBe('github_pat_de_teste_5678');
            expect(servidor.githubRepos).toEqual(['jesus-ac-dev/mem-vector']);

            // Regravar sem githubToken (undefined) mantém o token; os repos mudam.
            await gravarDefinicoesCom(alice, {
                metodoDestilacao: 'one-shot',
                modulosAtivos: ['github'],
                chatProvider: 'claude',
                matchCount: 5,
                webHabilitada: false,
                githubRepos: ['jesus-ac-dev/mem-vector', 'jesus-ac-dev/mythos-engine'],
                agentes: {},
            });
            const depois = await lerDefinicoesVistaCom(alice);
            expect(depois.githubTemToken).toBe(true);
            expect(depois.githubRepos).toEqual([
                'jesus-ac-dev/mem-vector',
                'jesus-ac-dev/mythos-engine',
            ]);
        },
    );

    // Relay: o mapa cruzamento→provider faz round-trip (config, não segredo).
    it(
        'cruzamentos (relay): config round-trip vista/servidor + keep-on-undefined',
        { timeout: 30_000 },
        async () => {
            const { gravarDefinicoesCom, lerDefinicoesVistaCom, lerDefinicoesServidorCom } =
                await import('@/modules/definicoes/definicoes.service');

            const vista = await gravarDefinicoesCom(alice, {
                metodoDestilacao: 'one-shot',
                modulosAtivos: [],
                chatProvider: 'claude',
                matchCount: 5,
                webHabilitada: false,
                cruzamentos: {
                    dev: { principal: 'codex', validador: 'claude' },
                    analise: { principal: 'claude', validador: 'none' },
                },
                agentes: {},
            });
            expect(vista.cruzamentos.dev).toEqual({ principal: 'codex', validador: 'claude' });

            const servidor = await lerDefinicoesServidorCom(alice);
            expect(servidor.cruzamentos.analise).toEqual({
                principal: 'claude',
                validador: 'none',
            });

            // Regravar sem cruzamentos (undefined) mantém os atuais.
            await gravarDefinicoesCom(alice, {
                metodoDestilacao: 'one-shot',
                modulosAtivos: [],
                chatProvider: 'claude',
                matchCount: 5,
                webHabilitada: false,
                agentes: {},
            });
            const depois = await lerDefinicoesVistaCom(alice);
            expect(depois.cruzamentos.dev).toEqual({ principal: 'codex', validador: 'claude' });
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
                matchCount: 5,
                webHabilitada: false,
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
