/** Modified esimswap interface, GPL-3.0; no history, analytics or deep links. */
import jsQR from 'jsqr';
import { scanFile } from './core/qr-scanner.js';
import { parseActivation } from './core/lpa-converter.js';
import { renderActivationQR, composeActivation } from './core/qr-export.js';
window.jsQR = jsQR;
const $ = selector => document.querySelector(selector);
let job = 0;
const buttons = ['#choose-file', '#parse-text'];
function busy(value) {
  $('#busy').hidden = !value;
  for (const selector of buttons) $(selector).disabled = value;
}
function status(message, type = '') {
  $('#status').textContent = message;
  $('#status').className = type;
}
function resetResult() {
  $('#results').hidden = true;
  $('#empty-state').hidden = false;
  $('#lpa-output').value = '';
  for (const selector of ['#smdp-output', '#activation-output', '#optional-output']) $(selector).textContent = '';
  $('#optional-row').hidden = true;
  $('#optional-note').hidden = true;
}
function display(raw) {
  const data = parseActivation(raw);
  $('#lpa-output').value = data.lpa;
  $('#smdp-output').textContent = data.smdp;
  $('#activation-output').textContent = data.matchingId;
  $('#optional-output').textContent = data.optionalFields.join('$');
  $('#optional-row').hidden = data.optionalFields.length === 0;
  $('#optional-note').hidden = data.optionalFields.length === 0;
  $('#results').hidden = false;
  $('#empty-state').hidden = true;
  status('轉換完成，已保留完整 LPA 字串。', 'success');
}
const errors = new Map([
  ['File must be an image.', '請選擇 PNG、JPG、WebP、GIF 或 BMP 圖片。'],
  ['File too large. Maximum 10MB.', '圖片超過 10 MB，請先裁切 QR Code 區域。'],
  ['Failed to load image.', '無法讀取這張圖片，請改用 PNG 或 JPG。'],
  ['No QR code detected. Try a clearer image or use manual input.', '找不到 QR Code，請使用清晰截圖，或先裁切二維碼周圍區域。']
]);
async function processFile(file) {
  if (!file) return;
  selectMode('decode');
  const currentJob = ++job;
  resetResult();
  $('#file-meta').textContent = file.name || '剪貼簿圖片';
  $('#file-meta').hidden = false;
  $('#manual-input').value = '';
  busy(true);
  status('正在本機讀取 QR Code…');
  try {
    const raw = await scanFile(file);
    if (currentJob === job) display(raw);
  } catch (error) {
    if (currentJob === job) status(errors.get(error.message) || (error.message.includes('eSIM') || error.message.includes('SM-DP+') ? error.message : '無法讀取這張圖片，請改用 PNG 或 JPG。'), 'error');
  } finally {
    if (currentJob === job) { busy(false); $('#file-input').value = ''; }
  }
}
$('#choose-file').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', event => processFile(event.target.files[0]));
for (const name of ['dragenter', 'dragover']) $('#dropzone').addEventListener(name, event => {
  event.preventDefault(); $('#dropzone').classList.add('dragover');
});
$('#dropzone').addEventListener('dragleave', () => $('#dropzone').classList.remove('dragover'));
$('#dropzone').addEventListener('drop', event => {
  event.preventDefault(); $('#dropzone').classList.remove('dragover'); processFile(event.dataTransfer.files[0]);
});
document.addEventListener('paste', event => {
  const item = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
  if (item) { event.preventDefault(); processFile(item.getAsFile()); }
});
$('#parse-text').addEventListener('click', () => {
  ++job; busy(false); resetResult();
  try { display($('#manual-input').value); } catch (error) { status(error.message, 'error'); }
});
$('#copy-lpa').addEventListener('click', async () => {
  const value = $('#lpa-output').value;
  if (!value) return;
  try { await navigator.clipboard.writeText(value); status('完整 LPA 已複製；剪貼簿內容請自行保管。', 'success'); }
  catch { $('#lpa-output').focus(); $('#lpa-output').select(); status('瀏覽器未允許複製，請手動複製已選取的 LPA。', 'error'); }
});
let generatorJob = 0;
let generated = null;
function selectMode(mode) {
  for (const name of ['decode', 'generate']) {
    const active = name === mode;
    $(`#mode-${name}`).setAttribute('aria-selected', String(active));
    $(`#mode-${name}`).tabIndex = active ? 0 : -1;
    $(`#${name}-workspace`).hidden = !active;
  }
}
for (const name of ['decode', 'generate']) {
  const tab = $(`#mode-${name}`);
  tab.addEventListener('click', () => selectMode(name));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'decode' : event.key === 'End' ? 'generate' : name === 'decode' ? 'generate' : 'decode';
    selectMode(next); $(`#mode-${next}`).focus();
  });
}
function generatorStatus(message, type = '') {
  $('#generator-status').textContent = message;
  $('#generator-status').className = `generator-status ${type}`;
}
function resetQR() {
  generated = null;
  $('#qr-result').hidden = true;
  $('#qr-empty').hidden = false;
  $('#qr-preview').removeAttribute('src');
  $('#generator-lpa-output').value = '';
  $('#download-qr').disabled = true;
  $('#copy-generated').disabled = true;
}
async function updateQR() {
  const current = ++generatorJob;
  resetQR();
  const input = $('#generator-input').value;
  $('#generator-count').textContent = `${input.length} 字`;
  if (!input.trim()) { generatorStatus('貼上完整 LPA，即可在右側預覽 QR Code。'); return; }
  generatorStatus('正在本機產生 QR Code…');
  try {
    const result = await renderActivationQR(input);
    if (current !== generatorJob) return;
    generated = result;
    $('#qr-preview').src = result.dataURL;
    $('#generator-lpa-output').value = result.lpa;
    $('#qr-empty').hidden = true;
    $('#qr-result').hidden = false;
    $('#download-qr').disabled = false;
    $('#copy-generated').disabled = false;
    generatorStatus('QR Code 已產生。僅確認格式，未驗證電信方案或啟用狀態。', 'success');
  } catch (error) {
    if (current === generatorJob) generatorStatus(/[\u3400-\u9fff]/u.test(error.message) ? error.message : '無法產生 QR Code，請檢查 eSIM 格式或長度。', 'error');
  }
}
$('#generator-input').addEventListener('input', updateQR);
$('#clear-generator').addEventListener('click', () => { clearGenerator(); $('#generator-input').focus(); });
function clearGenerator() {
  ++generatorJob; resetQR();
  $('#generator-input').value = '';
  $('#generator-count').textContent = '0 字';
  for (const selector of ['#builder-smdp', '#builder-code', '#builder-extra']) $(selector).value = '';
  generatorStatus('貼上完整 LPA，即可在右側預覽 QR Code。');
}
$('#paste-lpa').addEventListener('click', async () => {
  const current = generatorJob;
  try {
    const text = await navigator.clipboard.readText();
    if (current !== generatorJob) return;
    $('#generator-input').value = text;
    await updateQR();
  } catch { if (current === generatorJob) generatorStatus('無法存取剪貼簿，請直接在輸入框貼上 LPA。', 'error'); }
});
$('#build-lpa').addEventListener('click', () => {
  try {
    $('#generator-input').value = composeActivation({ smdp: $('#builder-smdp').value, matchingId: $('#builder-code').value, optionalFields: $('#builder-extra').value });
    updateQR();
  } catch (error) { ++generatorJob; resetQR(); generatorStatus(error.message, 'error'); }
});
$('#regenerate-qr').addEventListener('click', () => {
  const value = $('#lpa-output').value;
  if (!value) return;
  selectMode('generate');
  $('#generator-input').value = value;
  updateQR();
});
$('#download-qr').addEventListener('click', () => {
  if (!generated) return;
  const anchor = document.createElement('a');
  anchor.href = generated.dataURL;
  anchor.download = 'esim-qr.png';
  document.body.appendChild(anchor);
  anchor.click(); anchor.remove();
});
$('#copy-generated').addEventListener('click', async () => {
  const value = generated?.lpa;
  if (!value) return;
  try { await navigator.clipboard.writeText(value); if (generated?.lpa === value) generatorStatus('LPA 已複製；請妥善保管剪貼簿內容。', 'success'); }
  catch {
    if (generated?.lpa !== value) return;
    $('#generator-lpa-output').focus(); $('#generator-lpa-output').select();
    generatorStatus('瀏覽器未允許複製，請手動複製已選取的 LPA。', 'error');
  }
});
for (const [button, output] of [['#copy-smdp', '#smdp-output'], ['#copy-activation', '#activation-output']]) {
  $(button).addEventListener('click', async () => {
    const value = $(output).textContent;
    if (!value) return;
    try { await navigator.clipboard.writeText(value); if ($(output).textContent === value) status('欄位已複製；請妥善保管剪貼簿內容。', 'success'); }
    catch { if ($(output).textContent === value) status('瀏覽器未允許複製，請手動選取欄位內容。', 'error'); }
  });
}
function clear() {
  ++job; busy(false); resetResult(); clearGenerator();
  $('#manual-input').value = ''; $('#file-input').value = '';
  $('#file-meta').textContent = ''; $('#file-meta').hidden = true;
  status('等待選擇圖片');
}
$('#clear').addEventListener('click', clear);
window.addEventListener('pagehide', clear);
window.addEventListener('pageshow', event => { if (event.persisted) clear(); });
clear();
