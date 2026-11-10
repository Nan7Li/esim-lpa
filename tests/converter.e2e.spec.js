import { test, expect } from '@playwright/test';
import QRCode from 'qrcode';
const LPA = 'LPA:1$SMDP.EXAMPLE.COM$Abc12-Def34$1.3.6.1.4.1$1';
const image = async text => ({ name: 'test-qr.png', mimeType: 'image/png', buffer: await QRCode.toBuffer(text, { width: 640, margin: 4 }) });

test.beforeEach(async ({ page }) => { await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8742'); });

test('operator QR is decoded locally, copied intact and cleared', async ({ page, context }) => {
  const traffic = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) traffic.push(request.url()); });
  await page.locator('#file-input').setInputFiles(await image(LPA));
  await expect(page.locator('#lpa-output')).toHaveValue(LPA);
  await expect(page.locator('#smdp-output')).toHaveText('SMDP.EXAMPLE.COM');
  await expect(page.locator('#activation-output')).toHaveText('Abc12-Def34');
  await expect(page.locator('#optional-output')).toHaveText('1.3.6.1.4.1$1');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '複製完整 LPA', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LPA);
  expect(traffic).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  expect(new URL(page.url()).search).toBe('');
  await page.getByRole('button', { name: '清除所有資料', exact: true }).click();
  await expect(page.locator('#lpa-output')).toHaveValue('');
  await expect(page.locator('#results')).toBeHidden();
  expect(errors).toEqual([]);
});

test('rejects unrelated QR and clears stale results', async ({ page }) => {
  await page.locator('#file-input').setInputFiles(await image(LPA));
  await expect(page.locator('#results')).toBeVisible();
  await page.locator('#file-input').setInputFiles(await image('https://example.com/not-an-esim'));
  await expect(page.locator('#status')).toContainText('不是支援的 eSIM');
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#lpa-output')).toHaveValue('');
});

test('manual LPA input preserves every optional field and reload does not retain data', async ({ page }) => {
  await page.locator('.manual summary').click();
  await page.locator('#manual-input').fill(LPA);
  await page.getByRole('button', { name: '解析文字', exact: true }).click();
  await expect(page.locator('#lpa-output')).toHaveValue(LPA);
  await page.reload();
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#manual-input')).toHaveValue('');
});

test('supports image paste and image drop', async ({ page }) => {
  const { buffer } = await image(LPA);
  const bytes = Array.from(buffer);
  for (const mode of ['paste', 'drop']) {
    await page.evaluate(({ bytes, mode }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], 'pasted.png', { type: 'image/png' }));
      if (mode === 'paste') document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
      else document.querySelector('#dropzone').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }, { bytes, mode });
    await expect(page.locator('#lpa-output')).toHaveValue(LPA);
    await page.getByRole('button', { name: '清除所有資料', exact: true }).click();
  }
});

test('reports malformed and non-image files without exposing raw content', async ({ page }) => {
  await page.locator('#file-input').setInputFiles({ name: 'private.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.locator('#status')).toContainText('無法讀取');
  await page.locator('#file-input').setInputFiles({ name: 'secret.txt', mimeType: 'text/plain', buffer: Buffer.from('sensitive secret') });
  await expect(page.locator('#status')).toContainText('圖片');
  await expect(page.locator('body')).not.toContainText('sensitive secret');
});

test('mobile layout has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#file-input').setInputFiles(await image(LPA));
  await expect(page.locator('#lpa-output')).toHaveValue(LPA);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const mode of ['paste', 'drop']) {
  test(`rejects zero-sized SVG ${mode} with the supported-image message and enabled buttons`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(mode => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"/>'], 'private.svg', { type: 'image/svg+xml' }));
      if (mode === 'paste') document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
      else document.querySelector('#dropzone').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }, mode);
    await expect(page.locator('#status')).toHaveText('請選擇 PNG、JPG、WebP、GIF 或 BMP 圖片。');
    await expect(page.locator('#choose-file')).toBeEnabled();
    await expect(page.locator('#parse-text')).toBeEnabled();
    await expect(page.locator('#busy')).toBeHidden();
    await expect(page.locator('#results')).toBeHidden();
    expect(errors).toEqual([]);
  });
}

for (const failure of ['nullContext', 'drawImage', 'getImageData']) {
  test(`canvas ${failure} failure settles the scan and allows retry`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(failure => {
      const prototype = failure === 'nullContext' ? HTMLCanvasElement.prototype : CanvasRenderingContext2D.prototype;
      const method = failure === 'nullContext' ? 'getContext' : failure;
      const original = prototype[method];
      prototype[method] = function () {
        if (failure === 'nullContext') return null;
        throw new Error('private canvas failure');
      };
      window.restoreCanvas = () => { prototype[method] = original; };
    }, failure);
    await page.locator('#file-input').setInputFiles(await image(LPA));
    await expect(page.locator('#status')).toHaveText('無法讀取這張圖片，請改用 PNG 或 JPG。');
    await expect(page.locator('#choose-file')).toBeEnabled();
    await expect(page.locator('#parse-text')).toBeEnabled();
    await expect(page.locator('#busy')).toBeHidden();
    await expect(page.locator('#results')).toBeHidden();
    await expect(page.locator('body')).not.toContainText('private canvas failure');
    expect(errors).toEqual([]);
    await page.evaluate(() => window.restoreCanvas());
    await page.locator('#file-input').setInputFiles(await image(LPA));
    await expect(page.locator('#lpa-output')).toHaveValue(LPA);
  });
}

for (const outcome of ['success', 'failure']) {
  test(`clear ignores a pending scan's late ${outcome}`, async ({ page }) => {
    await page.evaluate(outcome => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        ...descriptor,
        set(value) { window.finishPendingImage = () => descriptor.set.call(this, value); }
      });
      const revoke = URL.revokeObjectURL;
      window.revokedImageURLs = 0;
      URL.revokeObjectURL = url => { window.revokedImageURLs++; revoke.call(URL, url); };
      if (outcome === 'failure') CanvasRenderingContext2D.prototype.getImageData = () => { throw new Error('private late failure'); };
    }, outcome);
    await page.locator('#file-input').setInputFiles(await image(LPA));
    await expect(page.locator('#busy')).toBeVisible();
    await page.getByRole('button', { name: '清除所有資料', exact: true }).click();
    await page.evaluate(() => window.finishPendingImage());
    await expect.poll(() => page.evaluate(() => window.revokedImageURLs)).toBe(1);
    // The image callback and scan promise continuations complete before this read.
    await expect(page.locator('#status')).toHaveText('等待選擇圖片');
    await expect(page.locator('#lpa-output')).toHaveValue('');
    await expect(page.locator('#manual-input')).toHaveValue('');
    await expect(page.locator('#results')).toBeHidden();
    await expect(page.locator('#busy')).toBeHidden();
    await expect(page.locator('#choose-file')).toBeEnabled();
    await expect(page.locator('#parse-text')).toBeEnabled();
  });
}
