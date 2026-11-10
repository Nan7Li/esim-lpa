import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { readFile } from 'node:fs/promises';
const LPA = 'LPA:1$SMDP.EXAMPLE.COM$Abc12-Def34$1.3.6.1.4.1$1';
const base = process.env.BASE_URL || 'http://127.0.0.1:8743';
test.beforeEach(async ({ page }) => { await page.goto(base); });

test('live generation, downloaded PNG and copied LPA preserve exact payload without network or storage', async ({ page, context }) => {
  await page.getByRole('tab', { name: 'LPA → QR Code', exact: true }).click();
  const network = [], errors = [];
  page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.locator('#generator-input').fill(LPA);
  await expect(page.locator('#qr-result')).toBeVisible();
  await expect(page.locator('#generator-lpa-output')).toHaveValue(LPA);
  const src = await page.locator('#qr-preview').getAttribute('src');
  const png = PNG.sync.read(Buffer.from(src.split(',')[1], 'base64'));
  expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data).toBe(LPA);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載 PNG', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('esim-qr.png');
  const saved = PNG.sync.read(await readFile(await download.path()));
  expect(jsQR(new Uint8ClampedArray(saved.data), saved.width, saved.height).data).toBe(LPA);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '複製此 LPA', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LPA);
  expect(network).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.locator('#clear-generator').click();
  await expect(page.locator('#qr-result')).toBeHidden();
  await expect(page.locator('#qr-preview')).not.toHaveAttribute('src', /.+/);
});

test('invalid edit immediately hides stale downloadable QR and newer input wins', async ({ page }) => {
  await page.locator('#mode-generate').click();
  await page.locator('#generator-input').fill(LPA);
  await expect(page.locator('#qr-result')).toBeVisible();
  await page.locator('#generator-input').fill('https://example.com/private');
  await expect(page.locator('#qr-result')).toBeHidden();
  await expect(page.locator('#generator-status')).toContainText('eSIM');
  await page.locator('#generator-input').fill(LPA);
  await page.locator('#generator-input').fill(LPA.replace('Abc12-Def34', 'NEWER-ID'));
  await expect(page.locator('#generator-lpa-output')).toHaveValue(LPA.replace('Abc12-Def34', 'NEWER-ID'));
});

test('field builder preserves optional suffix and rejects dollar injection', async ({ page }) => {
  await page.locator('#mode-generate').click();
  await page.locator('#generator-builder summary').click();
  await page.locator('#builder-smdp').fill('SMDP.EXAMPLE.COM');
  await page.locator('#builder-code').fill('Abc12-Def34');
  await page.locator('#builder-extra').fill('1.3.6.1.4.1$1');
  await page.locator('#build-lpa').click();
  await expect(page.locator('#generator-input')).toHaveValue(LPA);
  await expect(page.locator('#generator-lpa-output')).toHaveValue(LPA);
  await page.locator('#builder-code').fill('wrong$injected');
  await page.locator('#build-lpa').click();
  await expect(page.locator('#generator-status')).toContainText('欄位');
  await expect(page.locator('#qr-result')).toBeHidden();
});

test('generator is responsive and reload retains no activation data', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#mode-generate').click();
  await page.locator('#generator-input').fill(LPA);
  await expect(page.locator('#qr-result')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await page.locator('#mode-generate').click();
  await expect(page.locator('#generator-input')).toHaveValue('');
  await expect(page.locator('#qr-result')).toBeHidden();
});

test('decoded payload can be regenerated and all-data clear removes both modes', async ({ page }) => {
  await page.locator('#file-input').setInputFiles({ name: 'carrier.png', mimeType: 'image/png', buffer: await QRCode.toBuffer(LPA) });
  await expect(page.locator('#lpa-output')).toHaveValue(LPA);
  await page.locator('#regenerate-qr').click();
  await expect(page.locator('#mode-generate')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#generator-lpa-output')).toHaveValue(LPA);
  await page.locator('#mode-decode').click();
  await page.getByRole('button', { name: '清除所有資料', exact: true }).click();
  await page.locator('#mode-generate').click();
  await expect(page.locator('#generator-input')).toHaveValue('');
  await expect(page.locator('#qr-result')).toBeHidden();
});

test('direction tabs support keyboard and clipboard-denied copy has a manual fallback', async ({ page }) => {
  await page.locator('#mode-decode').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#mode-generate')).toBeFocused();
  await expect(page.locator('#generate-workspace')).toBeVisible();
  await page.locator('#generator-input').fill(LPA);
  await expect(page.locator('#qr-result')).toBeVisible();
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
  await page.locator('#copy-generated').click();
  await expect(page.locator('#generator-status')).toContainText('手動複製');
  expect(await page.locator('#generator-lpa-output').evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd))).toBe(LPA);
});
