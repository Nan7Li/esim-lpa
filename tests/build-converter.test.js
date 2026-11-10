import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, copyFileSync, readFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function buildFixture(t) {
  const fixture = mkdtempSync(join(tmpdir(), 'esim-converter-build-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const name of ['build-converter.js', 'package.json', 'converter.html', 'converter.css', 'converter-headers', 'LICENSE']) {
    copyFileSync(new URL(`../${name}`, import.meta.url), join(fixture, name));
  }
  cpSync(new URL('../src/', import.meta.url), join(fixture, 'src'), { recursive: true });
  symlinkSync(new URL('../node_modules/', import.meta.url), join(fixture, 'node_modules'), 'dir');
  return fixture;
}

test('production build ships the QR decoder license alongside the app', t => {
  const fixture = buildFixture(t);
  execFileSync(process.execPath, ['build-converter.js'], { cwd: fixture });
  assert.equal(existsSync(join(fixture, 'dist/THIRD_PARTY_LICENSES.txt')), true, 'Missing bundled jsQR license');
  assert.match(readFileSync(join(fixture, 'dist/THIRD_PARTY_LICENSES.txt'), 'utf8'), /Apache License/);
});

test('production build ships the exact installed QR encoder license separately without replacing jsQR notice', t => {
  const fixture = buildFixture(t);
  execFileSync(process.execPath, ['build-converter.js'], { cwd: fixture });
  assert.equal(readFileSync(join(fixture, 'dist/QRCODE-LICENSE.txt'), 'utf8'), readFileSync(join(fixture, 'node_modules/qrcode/license'), 'utf8'));
  assert.match(readFileSync(join(fixture, 'dist/QRCODE-LICENSE.txt'), 'utf8'), /MIT License|MIT/);
  assert.equal(readFileSync(join(fixture, 'dist/THIRD_PARTY_LICENSES.txt'), 'utf8'), readFileSync(join(fixture, 'node_modules/jsqr/LICENSE'), 'utf8'));
});

test('converter build removes stale upstream redirects and security entry pages', t => {
  const fixture = buildFixture(t);
  mkdirSync(join(fixture, 'dist/security'), { recursive: true });
  writeFileSync(join(fixture, 'dist/_redirects'), '/* /404.html 404\n');
  writeFileSync(join(fixture, 'dist/security/entry'), '<html>old upstream security entry</html>');
  execFileSync(process.execPath, ['build-converter.js'], { cwd: fixture });
  assert.equal(existsSync(join(fixture, 'dist/_redirects')), false, 'Stale redirects conflict with converter deployment');
  assert.equal(existsSync(join(fixture, 'dist/security')), false, 'Stale upstream security pages must not ship');
  assert.equal(readFileSync(join(fixture, 'dist/index.html'), 'utf8'), readFileSync(join(fixture, 'converter.html'), 'utf8'));
});
