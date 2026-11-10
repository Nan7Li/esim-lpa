# eSIM → LPA｜繁體中文・隱私優先

此分支是基於 [yagami1997/esimswap](https://github.com/yagami1997/esimswap) 修改的圖片轉 LPA 工具；保留 GPL-3.0 授權。

網站：https://esim-lpa.pages.dev

## 功能與隱私

- 選擇、拖放或貼上 eSIM QR Code 圖片，複製完整 LPA。
- 所有圖片在瀏覽器內解碼，不上傳、不保存歷史、不把啟用碼放進網址。
- 使用獨立解析器，保留 Matching ID 大小寫與全部額外欄位。不猜測確認碼，不自動修復識別碼。
- 無第三方 CDN、字型或分析服務；jsQR 固定版本並打包為同源靜態資源。
- 支援標準 `LPA:1$SM-DP+$MatchingID` 與其後的原始欄位。只移除字串頭尾空白。非 LPA 的專有網站連結不會自動開啟或跟隨。
- 複製的啟用碼會留在系統剪貼簿；清除頁面不會清除系統剪貼簿。
- 工具只讀取二維碼，不連線電信商，不下載或啟用 eSIM，不驗證啟用碼是否有效。

## 本機開發

```sh
npm ci
npm run build
npm test
npx playwright install chromium
python -m http.server 8743 --bind 127.0.0.1 --directory dist
# 另一個終端
BASE_URL=http://127.0.0.1:8743 npm run test:e2e
```

## 部署

Cloudflare Pages Direct Upload 專案：`esim-lpa`，production branch：`main`。

```sh
npm run build
npx wrangler pages deploy dist --project-name esim-lpa --branch main
```

更新需要 Cloudflare 授權，目前未設定 GitHub push 自動部署。可在 Cloudflare 帳號內操作；不要將 API token 或啟用碼提交至 GitHub。

`dist/_headers` 啟用同源腳本、禁止連線、禁止嵌入等安全設定。靜態資源全部直接存放在 Cloudflare Pages，不需要 GitHub/CDN 作為網站執行時來源。

## 上游差異

使用 `build-converter.js`、`converter.html`、`converter.css`、`src/converter-app.js`、`src/core/lpa-converter.js` 建置。保留並使用上游 `src/core/qr-scanner.js` 圖片解碼功能。

原專案的 legacy parser、history、deep-link 仍保留於原始碼與上游測試中，但不包含在此網站建置。原專案功能可用 `npm run build:upstream` 另行建置（需提供上游要求的環境變數）。

## 授權

GPL-3.0，見 `LICENSE`。此修改版由 Nan7Li 維護；上游作者 yagami1997。jsQR 的 Apache-2.0 授權文件隨網站部署於 `THIRD_PARTY_LICENSES.txt`。
