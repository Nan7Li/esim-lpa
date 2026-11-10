/** Modified esimswap interface, GPL-3.0; no history, analytics or deep links. */
import jsQR from 'jsqr';
import { scanFile } from './core/qr-scanner.js';
import { parseActivation } from './core/lpa-converter.js';
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
  const currentJob = ++job;
  resetResult();
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
function clear() {
  ++job; busy(false); resetResult();
  $('#manual-input').value = ''; $('#file-input').value = '';
  status('等待選擇圖片');
}
$('#clear').addEventListener('click', clear);
window.addEventListener('pagehide', clear);
window.addEventListener('pageshow', event => { if (event.persisted) clear(); });
clear();
