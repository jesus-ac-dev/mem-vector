// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function userClient(email: string, password: string) {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error && !error.message.includes('already been registered')) throw error;
    const c = createAnonClient(URL, ANON);
    const { error: e2 } = await c.auth.signInWithPassword({ email, password });
    if (e2) throw e2;
    return c;
}

async function limparKernelDe(userId: string): Promise<void> {
    const admin = getSupabaseAdmin();
    const { data: pastas } = await admin
        .from('folders')
        .select('id')
        .eq('owner_id', userId)
        .ilike('name', 'kernel');
    for (const p of pastas ?? []) {
        const { data: notas } = await admin.from('knowledge').select('id').eq('folder_id', p.id);
        for (const n of notas ?? []) {
            await admin.from('file_versions').delete().eq('entity_id', n.id);
            await admin.from('chunks').delete().eq('metadata->>entity_id', n.id);
            await admin.from('edges').delete().eq('from_id', n.id);
            await admin.from('knowledge').delete().eq('id', n.id);
        }
        await admin.from('folders').delete().eq('id', p.id);
    }
}

// Kernel do workspace (#34): a pasta `Kernel` na raiz dá personalidade ao
// agente; arquivadas ficam fora; sem pasta = sem bloco.
describe('lerKernelCom (integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let aliceId: string;

    beforeAll(async () => {
        alice = await userClient('alice-kernel@test.local', 'pw-alice-123');
        aliceId = (await alice.auth.getUser()).data.user!.id;
        const admin = getSupabaseAdmin();
        // limpar runs anteriores: notas do kernel e a pasta
        const { data: pastas } = await admin
            .from('folders')
            .select('id')
            .eq('owner_id', aliceId)
            .ilike('name', 'kernel');
        for (const p of pastas ?? []) {
            const { data: notas } = await admin
                .from('knowledge')
                .select('id')
                .eq('folder_id', p.id);
            for (const n of notas ?? []) {
                await admin.from('file_versions').delete().eq('entity_id', n.id);
                await admin.from('chunks').delete().eq('metadata->>entity_id', n.id);
                await admin.from('edges').delete().eq('from_id', n.id);
                await admin.from('knowledge').delete().eq('id', n.id);
            }
            await admin.from('folders').delete().eq('id', p.id);
        }
    });

    it('sem pasta Kernel devolve vazio (zero mudança)', async () => {
        const { lerKernelCom } = await import('@/agent/kernel');
        expect(await lerKernelCom(alice)).toEqual([]);
    });

    it(
        'lê as notas da pasta Kernel (case-insensitive) e exclui arquivadas',
        { timeout: 30_000 },
        async () => {
            const { lerKernelCom } = await import('@/agent/kernel');
            const { escreverNotaEmPastaCom, arquivarNotaPorIdCom } =
                await import('@/modules/knowledge/knowledge.service');

            const pasta = await alice
                .from('folders')
                .insert({ owner_id: aliceId, name: 'kernel' })
                .select('id')
                .single();
            expect(pasta.error).toBeNull();
            const folderId = String(pasta.data!.id);

            await escreverNotaEmPastaCom(
                alice,
                {
                    title: 'Regras do agente',
                    content_md: '# Regras do agente\n\nTrata o Carlos por tu.',
                    links: [],
                    reason: 'kernel',
                },
                folderId,
            );
            const morta = await escreverNotaEmPastaCom(
                alice,
                {
                    title: 'Antiga',
                    content_md: '# Antiga\n\nfora',
                    links: [],
                    reason: 'kernel',
                },
                folderId,
            );
            await arquivarNotaPorIdCom(alice, morta.id);

            const kernel = await lerKernelCom(alice);
            expect(kernel.map((n) => n.title)).toEqual(['Regras do agente']);
            expect(kernel[0].contentMd).toContain('Trata o Carlos por tu.');
        },
    );
});

describe('garantirKernelCom (seed #36, integração RLS)', () => {
    it(
        'cria pasta + notas seed uma vez; segunda chamada é no-op; arquivada é opt-out',
        { timeout: 60_000 },
        async () => {
            const { garantirKernelCom, lerKernelCom, MYTHOS_BASE_SEED, precisaOnboardingCom } =
                await import('@/agent/kernel');
            const admin = getSupabaseAdmin();
            const bob = await userClient('bob-kernel-seed@test.local', 'pw-bob-123');
            const bobId = (await bob.auth.getUser()).data.user!.id;

            // limpar runs anteriores: notas + pastas kernel do bob
            const { data: pastas } = await admin
                .from('folders')
                .select('id')
                .eq('owner_id', bobId)
                .ilike('name', 'kernel');
            for (const p of pastas ?? []) {
                const { data: notas } = await admin
                    .from('knowledge')
                    .select('id')
                    .eq('folder_id', p.id);
                for (const n of notas ?? []) {
                    await admin.from('file_versions').delete().eq('entity_id', n.id);
                    await admin.from('chunks').delete().eq('metadata->>entity_id', n.id);
                    await admin.from('edges').delete().eq('from_id', n.id);
                    await admin.from('knowledge').delete().eq('id', n.id);
                }
                await admin.from('folders').delete().eq('id', p.id);
            }

            // 1ª chamada: cria pasta + Mythos Base (genérico; o pessoal NÃO entra)
            expect(await garantirKernelCom(bob)).toBe(true);
            const kernel = await lerKernelCom(bob);
            expect(kernel.map((n) => n.title).sort()).toEqual(
                MYTHOS_BASE_SEED.map((s) => s.title).sort(),
            );
            // user fresh (sem "Sobre mim") precisa de onboarding
            expect(await precisaOnboardingCom(bob)).toBe(true);

            // 2ª chamada: idempotente
            expect(await garantirKernelCom(bob)).toBe(false);

            // arquivar a pasta = opt-out: não recria
            const { data: pasta } = await bob
                .from('folders')
                .select('id')
                .eq('owner_id', bobId)
                .ilike('name', 'kernel')
                .single();
            await bob.from('folders').update({ archived: true }).eq('id', pasta!.id);
            expect(await garantirKernelCom(bob)).toBe(false);
            expect(await lerKernelCom(bob)).toEqual([]);
        },
    );
});

describe('onboarding (#40, integração RLS)', () => {
    it(
        'dono (incluirPessoal) nasce com o pessoal e não precisa onboarding',
        { timeout: 60_000 },
        async () => {
            const {
                garantirKernelCom,
                lerKernelCom,
                KERNEL_SEED,
                MYTHOS_BASE_SEED,
                precisaOnboardingCom,
            } = await import('@/agent/kernel');
            const dono = await userClient('dono-onboarding@test.local', 'pw-dono-123');
            const donoId = (await dono.auth.getUser()).data.user!.id;
            await limparKernelDe(donoId);

            expect(await garantirKernelCom(dono, undefined, true)).toBe(true);
            const kernel = await lerKernelCom(dono);
            expect(kernel.map((n) => n.title).sort()).toEqual(
                [...MYTHOS_BASE_SEED, ...KERNEL_SEED].map((s) => s.title).sort(),
            );
            expect(await precisaOnboardingCom(dono)).toBe(false);
        },
    );

    it(
        'user fresh: completarOnboardingCom escreve o pessoal e fecha o onboarding',
        { timeout: 60_000 },
        async () => {
            const { garantirKernelCom, lerKernelCom, precisaOnboardingCom } =
                await import('@/agent/kernel');
            const { completarOnboardingCom } =
                await import('@/modules/onboarding/onboarding.service');
            const novo = await userClient('fresh-onboarding@test.local', 'pw-fresh-123');
            const novoId = (await novo.auth.getUser()).data.user!.id;
            await limparKernelDe(novoId);

            await garantirKernelCom(novo); // só Mythos Base
            expect(await precisaOnboardingCom(novo)).toBe(true);

            await completarOnboardingCom(novo, {
                sobreMim: 'Sou a Ana, gestora.',
                prioridades: 'Lançar o produto.',
                regras: 'Direto e em PT.',
            });
            const kernel = await lerKernelCom(novo);
            expect(kernel.map((n) => n.title)).toContain('Sobre mim');
            expect(kernel.find((n) => n.title === 'Sobre mim')?.contentMd).toContain('Sou a Ana');
            expect(await precisaOnboardingCom(novo)).toBe(false);
        },
    );
});
