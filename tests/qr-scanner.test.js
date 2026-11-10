import test from 'node:test';
import assert from 'node:assert/strict';
import { scanFile } from '../src/core/qr-scanner.js';

const LPA = 'LPA:1$SMDP.EXAMPLE.COM$Abc12-Def34$1.3.6.1.4.1$1';

function imageEnvironment(t, { width = 640, height = 640, failure } = {}) {
  const revoked = [];
  const callbackErrors = [];
  let created = 0;
  let canvases = 0;
  const context = {
    drawImage() { if (failure === 'drawImage') throw new Error('private draw failure'); },
    getImageData() {
      if (failure === 'getImageData') throw new Error('private pixel failure');
      return { data: new Uint8ClampedArray(4), width, height };
    }
  };
  const globals = {
    window: { jsQR: () => ({ data: LPA }) },
    Image: class {
      width = width;
      height = height;
      naturalWidth = width;
      naturalHeight = height;
      set src(value) {
        if (failure === 'src') throw new Error('private source failure');
        queueMicrotask(() => {
          try {
            if (failure === 'onerror') this.onerror();
            else this.onload();
          } catch (error) { callbackErrors.push(error); }
        });
      }
    },
    document: { createElement() {
      canvases++;
      if (failure === 'createElement') throw new Error('private canvas failure');
      return {
        set width(value) { if (failure === 'width') throw new Error('private allocation failure'); },
        set height(value) { if (failure === 'height') throw new Error('private allocation failure'); },
        getContext() {
          if (failure === 'getContext') throw new Error('private context failure');
          return failure === 'nullContext' ? null : context;
        }
      };
    } }
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else delete globalThis[name];
    });
  }
  t.mock.method(URL, 'createObjectURL', () => { created++; return 'blob:local-image'; });
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  return { revoked, callbackErrors, get created() { return created; }, get canvases() { return canvases; } };
}

for (const type of ['image/svg+xml', 'image/avif', 'text/plain', '']) {
  test(`scanFile rejects unsupported MIME ${type || '(empty)'} before loading`, async t => {
    const env = imageEnvironment(t);
    await assert.rejects(scanFile({ type, size: 100 }), /File must be an image\./);
    assert.equal(env.created, 0);
  });
}

test('scanFile rejects a zero-sized SVG before image callbacks or canvas allocation', async t => {
  const env = imageEnvironment(t, { width: 0, height: 0 });
  await assert.rejects(scanFile({ type: 'image/svg+xml', size: 100 }), /File must be an image\./);
  assert.equal(env.created, 0);
  assert.equal(env.canvases, 0);
});

async function settles(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Scan did not settle.')), 100); })
    ]);
  } finally { clearTimeout(timer); }
}

for (const failure of ['createElement', 'width', 'height', 'getContext', 'nullContext', 'drawImage', 'getImageData', 'src', 'onerror']) {
  test(`scanFile rejects ${failure} failures and revokes its object URL`, async t => {
    const env = imageEnvironment(t, { failure });
    await assert.rejects(settles(scanFile({ type: 'image/png', size: 100 })), /^Error: Failed to load image\.$/);
    assert.deepEqual(env.callbackErrors, []);
    assert.deepEqual(env.revoked, ['blob:local-image']);
  });
}

for (const [width, height] of [[0, 640], [640, 0], [-1, 640], [NaN, 640], [Infinity, 640], [1.5, 640], [8193, 1], [1, 8193], [8192, 4096]]) {
  test(`scanFile rejects unsafe dimensions ${width}x${height} before canvas allocation`, async t => {
    const env = imageEnvironment(t, { width, height });
    await assert.rejects(settles(scanFile({ type: 'image/png', size: 100 })), /^Error: Failed to load image\.$/);
    assert.equal(env.canvases, 0);
    assert.deepEqual(env.revoked, ['blob:local-image']);
  });
}

for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']) {
  test(`scanFile accepts ${type}, preserves exact LPA and revokes its object URL`, async t => {
    const env = imageEnvironment(t);
    assert.equal(await settles(scanFile({ type, size: 100 })), LPA);
    assert.deepEqual(env.callbackErrors, []);
    assert.deepEqual(env.revoked, ['blob:local-image']);
  });
}
