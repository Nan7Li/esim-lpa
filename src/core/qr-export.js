/** Privacy-focused QR export helpers. GPL-3.0. */
import QRCode from 'qrcode';
import { parseActivation } from './lpa-converter.js';

export async function renderActivationQR(input) {
  if (typeof input === 'string' && input.length > 2000) {
    throw new Error('eSIM 字串長度不能超過 2000 個字元。');
  }
  let lpa;
  try {
    lpa = parseActivation(input).lpa;
  } catch {
    throw new Error('eSIM 格式不正確，請確認 LPA 字串。');
  }
  try {
    const dataURL = await QRCode.toDataURL(lpa, {
      type: 'image/png',
      width: 800,
      errorCorrectionLevel: 'M',
      margin: 4,
      color: { dark: '#000000ff', light: '#ffffffff' }
    });
    return { dataURL, lpa };
  } catch {
    throw new Error('eSIM QR Code 產生失敗，請確認字串長度與格式。');
  }
}

export function composeActivation({ smdp, matchingId, optionalFields = '' }) {
  for (const field of [smdp, matchingId]) {
    if (typeof field !== 'string' || /[$\s\u0000-\u001f\u007f]/u.test(field)) {
      throw new Error('eSIM 欄位格式不正確，不能含有 $、空白或控制字元。');
    }
  }
  if (typeof optionalFields !== 'string' || /[\s\u0000-\u001f\u007f]/u.test(optionalFields)) {
    throw new Error('eSIM 附加欄位格式不正確。');
  }
  try {
    return parseActivation(`LPA:1$${smdp}$${matchingId}${optionalFields ? '$' + optionalFields : ''}`).lpa;
  } catch {
    throw new Error('eSIM 欄位格式不正確。');
  }
}
