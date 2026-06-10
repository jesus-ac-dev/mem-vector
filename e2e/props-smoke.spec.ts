// Smoke descartável: propriedades de notas (tags/summary/visibility) + filtro
// por tag no explorer. Corre contra o dev server + Supabase local. Apagar
// depois de aceite (ou promover a e2e permanente).
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = 'dev@mem-vector.local';
const PASS = 'dev-password-123';
const TITULO = 'Smoke Props';
const TAG = 'smoke-props';

test.beforeAll(async () => {
    // Semear: nota limpa (sem tags) para o utilizador dev.
    const admin = createClient(URL_SB, SERVICE);
    const { data: users } = await admin.auth.admin.listUsers();
    const dev = users.users.find((u) => u.email === EMAIL);
    if (!dev) throw new Error('utilizador dev não existe no Supabase local');

    await admin
        .from('knowledge')
        .delete()
        .eq('owner_id', dev.id)
        .eq('slug', 'smoke-props');
    const { error } = await admin.from('knowledge').insert({
        owner_id: dev.id,
        slug: 'smoke-props',
        title: TITULO,
        content_md: `# ${TITULO}\n\nNota de smoke das propriedades.`,
        frontmatter: { title: TITULO },
    });
    if (error) throw new Error(`seed: ${error.message}`);
});

test('propriedades na UI + filtro por tag no explorer', async ({ page }) => {
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
        if (m.type() === 'error') erros.push(`console.error: ${m.text()}`);
    });

    // Login fresco.
    await page.goto('/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/chat');

    // Abrir a nota no explorer.
    await page.getByRole('button', { name: TITULO }).first().click();

    // Bloco de propriedades visível com defaults.
    await expect(page.getByText('Visibilidade')).toBeVisible();
    await expect(page.getByText('Sem resumo')).toBeVisible();
    await expect(page.getByText('Criada')).toBeVisible();

    // Adicionar tag.
    await page.getByPlaceholder('tag…').fill(TAG);
    await page.getByPlaceholder('tag…').press('Enter');
    await expect(page.getByText(`#${TAG}`).first()).toBeVisible();

    // Filtro por tag aparece no explorer (após refresh do workspace).
    const chipFiltro = page.getByRole('button', { name: `#${TAG}` });
    await expect(chipFiltro).toBeVisible();
    await chipFiltro.click();
    // Com o filtro ativo a nota continua visível na árvore.
    await expect(page.getByRole('button', { name: TITULO }).first()).toBeVisible();

    // Persistência: reload limpo, reabrir a nota, a tag está lá.
    await page.reload();
    await page.getByRole('button', { name: `#${TAG}` }).click(); // filtra
    await page.getByRole('button', { name: TITULO }).first().click();
    await expect(page.getByText(`#${TAG}`).first()).toBeVisible();

    // Sem erros client.
    const bufferErros = await page.evaluate(
        () => (window as unknown as { __MEM_VECTOR_ERRORS__?: unknown[] }).__MEM_VECTOR_ERRORS__ ?? [],
    );
    expect(bufferErros).toEqual([]);
    expect(erros).toEqual([]);
});
