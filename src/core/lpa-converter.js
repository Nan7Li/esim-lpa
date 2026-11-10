/** Privacy-focused converter added to the esimswap fork. GPL-3.0. */
export function parseActivation(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('請提供 eSIM QR Code 或 LPA 字串。');
  const lpa = input.trim();
  if (!lpa.startsWith('LPA:')) throw new Error('不是支援的 eSIM 格式：需要 LPA:1$ 開頭。');
  const parts = lpa.slice(4).split('$');
  if (parts[0] !== '1') throw new Error('不支援此 eSIM 格式版本，請向電信商確認。');
  if (parts.length < 3 || !parts[1] || !parts[2]) throw new Error('eSIM 格式缺少 SM-DP+ 或啟用碼欄位。');
  if (/\s|[\u0000-\u001f\u007f]/u.test(lpa)) throw new Error('eSIM 欄位含有空白或控制字元，無法安全轉換。');
  if (!/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z0-9-]+$/.test(parts[1])) throw new Error('SM-DP+ 欄位格式不正確。');
  return { lpa, smdp: parts[1], matchingId: parts[2], optionalFields: parts.slice(3) };
}
