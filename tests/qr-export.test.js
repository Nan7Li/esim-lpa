import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { build } from 'esbuild';
import { parseActivation } from '../src/core/lpa-converter.js';

test('browser-bundle-compatible QR export round-trips exact LPA as 800px M-level black-on-white PNG with four-module quiet zone', async () => {
  const { renderActivationQR } = await loadCore();
  const input = '  LPA:1$SMDP.Example.COM$AbC-123$OID$$1$  ';
  const { dataURL, lpa } = await renderActivationQR(input);
  assert.equal(lpa, parseActivation(input).lpa);
  assert.match(dataURL, /^data:image\/png;base64,/);
  const png = PNG.sync.read(Buffer.from(dataURL.split(',')[1], 'base64'));
  assert.equal(png.width, 800);
  assert.equal(png.height, 800);
  assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data, lpa);
  const qr = QRCode.create(lpa, { errorCorrectionLevel: 'M' });
  const scale = 800 / (qr.modules.size + 8);
  for (let y = 0; y < 800; y++) {
    for (let x = 0; x < 800; x++) {
      const moduleX = Math.floor(x / scale) - 4;
      const moduleY = Math.floor(y / scale) - 4;
      const inside = moduleX >= 0 && moduleY >= 0 && moduleX < qr.modules.size && moduleY < qr.modules.size;
      const expected = inside && qr.modules.get(moduleY, moduleX) ? 0 : 255;
      const pixel = (y * 800 + x) * 4;
      assert.deepEqual([...png.data.subarray(pixel, pixel + 4)], [expected, expected, expected, 255]);
    }
  }
  const bundle = await build({ entryPoints: [new URL('../src/core/qr-export.js', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'iife', write: false, metafile: true });
  assert.ok(Object.keys(bundle.metafile.inputs).some(path => path.endsWith('qrcode/lib/browser.js')));
  assert.ok(!Object.keys(bundle.metafile.inputs).some(path => path.includes('qrcode/lib/server') || path.includes('pngjs/')));
});

const loadCore = () => import('../src/core/qr-export.js');

test('field composer preserves identifier case and raw optional suffix separators', async () => {
  const { composeActivation } = await loadCore();
  const fields = { smdp: 'SMDP.Example.COM', matchingId: 'AbC-123' };
  for (const optionalFields of ['', 'OID$1', '$1', 'OID$$1$']) {
    assert.equal(composeActivation({ ...fields, optionalFields }), `LPA:1$SMDP.Example.COM$AbC-123${optionalFields ? '$' + optionalFields : ''}`);
  }
  assert.equal(composeActivation(fields), 'LPA:1$SMDP.Example.COM$AbC-123');
  for (const invalid of [{ smdp: '', matchingId: 'ID' }, { smdp: 'not-domain', matchingId: 'ID' }, { smdp: 'smdp.example.com', matchingId: '' }, { ...fields, optionalFields: 'OID $1' }, { ...fields, optionalFields: null }]) {
    assert.throws(() => composeActivation(invalid), /eSIM.*格式/);
  }
});

test('QR export rejects invalid LPA and input over 2000 characters with concise Traditional Chinese errors', async () => {
  const { renderActivationQR } = await loadCore();
  assert.equal(typeof renderActivationQR, 'function');
  for (const input of [null, undefined, 123, '', 'https://example.com', 'LPA:2$smdp.example.com$ID', 'LPA:1$bad$ID', 'LPA:1$smdp.example.com$', 'LPA:1$smdp.example.com$has space']) {
    await assert.rejects(() => renderActivationQR(input), error => /eSIM.*格式/.test(error.message) && error.message.length < 80);
  }
  const oversized = 'LPA:1$smdp.example.com$' + 'A'.repeat(2000);
  for (const input of [oversized, ' '.repeat(2001)]) {
    await assert.rejects(() => renderActivationQR(input), /eSIM.*長度/);
  }
});

test('QR export reports multibyte QR capacity overflow in Traditional Chinese without leaking payload', async () => {
  const { renderActivationQR } = await loadCore();
  const input = 'LPA:1$smdp.example.com$' + '密'.repeat(1000);
  await assert.rejects(() => renderActivationQR(input), error => /eSIM.*長度/.test(error.message) && error.message.length < 80 && !error.message.includes('密'));
});

test('field composer rejects optional suffix whitespace instead of silently trimming it', async () => {
  const { composeActivation } = await loadCore();
  for (const optionalFields of ['OID$1 ', 'OID$1\t', 'OID$1\n']) {
    assert.throws(() => composeActivation({ smdp: 'smdp.example.com', matchingId: 'ID', optionalFields }), /eSIM.*格式/);
  }
});

test('field composer rejects separator, whitespace and control injection in required fields', async () => {
  const { composeActivation } = await loadCore();
  for (const field of ['smdp', 'matchingId']) {
    for (const injected of ['evil$injected', 'has space', 'has\ttab', 'line\nbreak', 'trailing ', '\u0000']) {
      assert.throws(() => composeActivation({ smdp: 'smdp.example.com', matchingId: 'AbC123', [field]: injected }), /eSIM.*格式/);
    }
  }
});
