// Repro do #23: nota com versões do agente + 2 edições manuais via UI; o
// histórico tem de mostrar QUEM fez a versão atual ("tu") em vez de deixar o
// autor da base de comparação ("agente") ler-se como autoria do edit.
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = 'dev@mem-vector.local';
const PASS = 'dev-password-123';
const TITULO = 'Smoke Historia Autor';

test.beforeAll(async () => {
    // Semear: nota escrita pelo AGENTE (knowledge + file_version author=agent).
    const admin = createClient(URL_SB, SERVICE);
    const { data: users } = await admin.auth.admin.listUsers();
    const dev = users.users.find((u) => u.email === EMAIL);
    if (!dev) throw new Error('utilizador dev não existe no Supabase local');

    const slug = 'smoke-historia-autor';
    const { data: existentes } = await admin
        .from('knowledge')
        .select('id')
        .eq('owner_id', dev.id)
        .eq('slug', slug);
    for (const row of existentes ?? []) {
        await admin.from('file_versions').delete().eq('entity_id', row.id);
        await admin.from('chunks').delete().eq('metadata->>entity_id', row.id);
        await admin.from('edges').delete().eq('from_id', row.id);
        await admin.from('knowledge').delete().eq('id', row.id);
    }

    const conteudo = `# ${TITULO}\n\nEscrito pelo agente.`;
    const { data: nota, error } = await admin
        .from('knowledge')
        .insert({
            owner_id: dev.id,
            slug,
            title: TITULO,
            content_md: conteudo,
            frontmatter: { title: TITULO },
        })
        .select('id')
        .single();
    if (error) throw new Error(`seed knowledge: ${error.message}`);
    const { error: vErr } = await admin.from('file_versions').insert({
        owner_id: dev.id,
        entity_type: 'knowledge',
        entity_id: nota.id,
        content_md: conteudo,
        frontmatter: { title: TITULO },
        author: 'agent',
    });
    if (vErr) throw new Error(`seed file_version: ${vErr.message}`);
});

test('histórico mostra a autoria da versão atual (tu) e da base (agente)', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/chat');

    // Abrir a nota e editar manualmente (1.º edit do utilizador).
    await page.getByRole('button', { name: TITULO }).first().click();
    await page.getByRole('button', { name: 'Editar' }).click();
    const editor = page.getByPlaceholder('Escreve em Markdown...');
    await editor.fill(`# ${TITULO}\n\nEscrito pelo agente. Editado pelo Carlos.`);
    await page.getByRole('button', { name: 'Guardar' }).click();

    // Histórico: a versão ATUAL é do utilizador (NOME, não "user" cru — com
    // grupos a proveniência é por pessoa); a base é do agente. O dev user não
    // tem display_name → cai para o email.
    await page.getByRole('button', { name: 'Histórico' }).click();
    const linhaAtual = page.getByText(/Versão atual:/);
    await expect(linhaAtual).toBeVisible();
    await expect(linhaAtual).toContainText(EMAIL);
    // O trigger do select (base default = versão anterior) mostra "agente".
    await expect(page.getByRole('combobox')).toContainText('agente');

    // 2.º edit manual: a base default passa a ser o 1.º edit (nome nos dois).
    await page.getByRole('button', { name: 'Voltar ao conteúdo' }).click();
    await page.getByRole('button', { name: 'Editar' }).click();
    await editor.fill(`# ${TITULO}\n\nEscrito pelo agente. Editado duas vezes.`);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('button', { name: 'Histórico' }).click();
    await expect(page.getByText(/Versão atual:/)).toContainText(EMAIL);
    await expect(page.getByRole('combobox')).toContainText(EMAIL);
});
