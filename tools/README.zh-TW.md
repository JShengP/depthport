# 開發工具
[English](README.md)

以下指令皆從專案根目錄執行，工具本身不會對外發布 repo。

| 工具 | 用途 | 依賴與界線 |
|---|---|---|
| `tools/check_release.py` | 公開清單、Markdown 連結與明顯帳密檢查 | 標準函式庫；不是完整安全／歷史掃描 |
| `tools/build_release.py` | 公開原始碼 ZIP 與 SHA-256 | 標準函式庫，不下載權重 |
| `tools/stage_public.py` | 僅 stage 公開清單 | 需 Git，不 commit／push |
| `tools/build_site.py` | `_site` 靜態合成示範 | 標準函式庫，停用 AI／RTSP |
| `tools/http_smoke.py` | 真 Uvicorn 與 HTTP 路由檢查 | base requirements，不載入模型 |
| `tools/browser_offline_smoke.py` | FakeEngine＋TestClient bridge 測試 UI | test dependencies、CPU torch、Playwright、Chromium；非瀏覽器 HTTP／真推論 |
| `tests/test_i18n.cjs` | 字典、插值、偏好及 DOM key | Node.js，不需 npm 套件 |

選配瀏覽器測試：

```bash
python -m pip install -r requirements-test.txt playwright
python -m playwright install chromium
python tools/browser_offline_smoke.py
```

預設使用 Playwright 已安裝的 Chromium；也可用 `CHROMIUM_PATH` 指定本地程式。工具產生本地報告，文件截圖只擷取明示的合成示範。請看報告中的 renderer，Canvas 不等於 WebGL GPU 驗證。涵蓋兩種語言、不因語言變動而推論、四模型替身切換、同來源匯出、合成操作與窄螢幕版面。

真推論入口是 `check_env.py --all --image camera.jpg`；成功須真正呼叫模型，不會回退假深度。

`tools/cache_video_detections.py` 會記錄類別、裝置、NMS、上限、權重及版本；`tools/validate_mot_tracking.py` 在獨立 NumPy 2 環境使用固定 TrackEval 做 MOT17 重複比較與可見度／換位診斷。[擴大驗收與重跑說明](../docs/zh-TW/tracking-expanded-acceptance.md)，原始工作資料只留本機。
