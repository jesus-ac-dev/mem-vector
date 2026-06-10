import { test, expect } from '@playwright/test';

test('a página inicial mostra a entrada pública do workspace', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'O teu workspace' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Entrar na app' })).toHaveAttribute(
        'href',
        '/chat',
    );
});
