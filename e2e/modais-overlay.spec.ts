// Regressão (smoke do Carlos 2026-06-21): abrir Definições/Perfil a partir do
// menu de perfil e FECHAR deixava o `body` com `pointer-events: none` preso — a
// app ficava não-clicável. Causa: o DropdownMenu modal (Radix) + o Dialog modal
// pisam a gestão de pointer-events do body. Fix: DropdownMenu modal={false}.
import { test, expect } from '@playwright/test';

process.loadEnvFile('.env.local');

const EMAIL = 'dev@mem-vector.local';
const PASS = 'dev-password-123';

async function login(page: import('@playwright/test').Page) {
    await page.goto('/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/chat');
}

// Abre o item do menu de perfil, fecha o modal por Escape, e confirma que o body
// não ficou bloqueado (o sintoma do bug).
async function abrirFecharEConfirmar(page: import('@playwright/test').Page, item: string) {
    await page.getByRole('button', { name: 'Perfil' }).click();
    await page.getByRole('menuitem', { name: item }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Fecha pelo X (como o Carlos faz).
    await dialog.getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // O BUG: body com pointer-events: none preso → app não clicável.
    await expect
        .poll(() => page.evaluate(() => document.body.style.pointerEvents))
        .not.toBe('none');
}

test('fechar Definições e Perfil não bloqueia a app (pointer-events do body)', async ({ page }) => {
    await login(page);

    await abrirFecharEConfirmar(page, 'Definições');
    await abrirFecharEConfirmar(page, 'Perfil');

    // Funcional: o badge do perfil volta a abrir (a app não está bloqueada).
    await page.getByRole('button', { name: 'Perfil' }).click();
    await expect(page.getByRole('menuitem', { name: 'Definições' })).toBeVisible();
});
