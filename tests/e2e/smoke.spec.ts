import { test, expect } from '@playwright/test';

test.describe('P2P Whiteboard — Smoke', () => {
  test('lobby loads with heading and buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'P2P Whiteboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Room' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter room code')).toBeVisible();
  });

  test('create room → whiteboard appears with toolbar', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create Room' }).click();

    await expect(page.locator('.toolbar')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.whiteboard-canvas')).toBeVisible();

    await expect(page.locator('.room-info strong')).not.toBeEmpty();

    const url = page.url();
    expect(url).toContain('#');
  });

  test('canvas accepts pointer input without errors', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create Room' }).click();
    await expect(page.locator('.whiteboard-canvas')).toBeVisible({ timeout: 10_000 });

    const canvas = page.locator('.whiteboard-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.down();
    await page.mouse.move(box!.x + 200, box!.y + 150, { steps: 10 });
    await page.mouse.move(box!.x + 300, box!.y + 100, { steps: 10 });
    await page.mouse.up();

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    expect(errors).toHaveLength(0);
  });

  test('leave room returns to lobby', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create Room' }).click();
    await expect(page.locator('.toolbar')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Leave' }).click();
    await expect(page.getByRole('heading', { name: 'P2P Whiteboard' })).toBeVisible();
  });
});
