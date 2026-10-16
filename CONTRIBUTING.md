# Contributing / 貢獻指南

Contributions in **English or Traditional Chinese** are welcome. Keep user-facing documentation and `static/i18n.js` keys aligned across both languages. Model IDs, API keys and numeric output must remain language-independent.

歡迎以英文或繁體中文貢獻；操作文件與 UI 字典需同步，模型識別、API 欄位及數據不隨語言改變。

## Before submitting / 提交前

Use a new Python environment. Install base/test dependencies and a compatible torch for adapter-contract tests. Run `python -m pytest -q`, `node tests/test_i18n.cjs`, `python tools/http_smoke.py` and `python tools/check_release.py`. Optional browser tests are in [tools/README.md](tools/README.md). Do not report fake-backed tests as pretrained-model performance.

建立獨立環境並執行上述檢查；替身測試不能標成預訓練模型的效能結果。未實測的 GPU／平台請明確標記。

Changes to an adapter need tests for input color order, output shape, intrinsics, units, offline loading and errors. Never add a fake fallback to production inference. Preserve the raw/final depth distinction. Explain new dependencies and their licenses; keep backends lazy-loaded.

修改 adapter 時檢查色彩順序、shape、內參、單位、離線載入及錯誤處理；正式推論失敗不可用假深度替代。新增依賴須說明授權。

Update `PUBLIC_FILES.txt` explicitly when adding, moving or deleting public source/docs/tests. Never add `.env`, weights, camera frames or local outputs. Check staged files and the full history separately before pushing. The release checker detects common mistakes but is not a full security scanner.

新增／移動／刪除公開檔案需手動維護 `PUBLIC_FILES.txt`。禁止提交 `.env`、權重、場景影像或本地結果；推送前另看 staged files 與歷史，發布檢查不是完整安全掃描。

Only submit work you are authorized to contribute under this project's license. Preserve third-party attribution. Disclose generated or externally adapted code in the PR and review it as carefully as handwritten code. Do not include employer/customer code or credentials without explicit permission.

只提交有權以本授權公開的內容，保留第三方聲明；PR 說明 AI 生成或外部改寫來源並自行審查，不擅自帶入公司／客戶程式及帳密。
