import { test, expect } from '@playwright/test';

test('a página inicial mostra o título do núcleo', async ({ page }) => {
    await page.goto('/');
    await expect(
        page.getByRole('heading', { name: 'O núcleo do MythosEngine' }),
    ).toBeVisible();
});
