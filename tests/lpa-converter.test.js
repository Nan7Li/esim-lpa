import test from 'node:test';
import assert from 'node:assert/strict';

// Modified converter regression tests; upstream's legacy parser is not used.
const parse = async input => {
  let module;
  try { module = await import('../src/core/lpa-converter.js'); }
  catch (error) { assert.fail(`LPA converter feature missing: ${error.message}`); }
  return module.parseActivation(input);
};

test('extracts the operator server and matching ID without altering the activation string', async () => {
  const lpa = 'LPA:1$SMDP.EXAMPLE.COM$Abc12-Def34';
  const result = await parse(lpa);
  assert.equal(result.lpa, lpa);
  assert.equal(result.smdp, 'SMDP.EXAMPLE.COM');
  assert.equal(result.matchingId, 'Abc12-Def34');
});

test('rejects non-eSIM data, missing fields and unknown versions rather than repairing tokens', async () => {
  for (const value of ['', null, 123, 'https://example.com', 'LPA:2$smdp.example.com$ABC', 'LPA:1$$ABC', 'LPA:1$smdp.example.com', 'LPA:1$smdp.example.com$AB C', 'LPA:1$https://smdp.example.com$ABC']) {
    await assert.rejects(() => parse(value), /eSIM|格式|版本|欄位|空白/);
  }
});
