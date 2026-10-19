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

`tools/validate_mot_tracking.py --parameter-sweep` 對另一組序列執行兩個直接後端的五組啟用／高信心分流／保留參數，核對實際門檻及時間預算，並輸出相同事件的改善／退步。[方式、計畫與結果](../docs/zh-TW/tracking-parameter-acceptance.md)；與 worker 設定分開，未變更應用程式預設值。

`tools/diagnose_tracking_errors.py` 重分析預設／降低啟用的保存結果，精確核對官方 CLEAR、依固定偵測配對 FP，原始案例／ID 對照只寫入本機工作目錄，彙總為情境訊號而非因果判定。[方式、公開範圍與改善決定](../docs/zh-TW/tracking-error-diagnosis.md)。

`tools/validate_mot_tracking.py --admission-study` 分開測確認與出生時競爭閘門，保留上游弱偵測關聯；錯誤位置留本機，只公開配對彙總。`tools/plot_tracking_admission.py` 在獨立追蹤環境以 Matplotlib 從彙總 JSON 畫 FN／FP／IDSW，不讀影片。[凍結配置、結果與限制](../docs/zh-TW/tracking-admission-acceptance.md)。


## 版本功能示意圖

`python tools/build_version_visuals.py` 以標準函式庫重建 `docs/assets/` 中四份 SVG；只產生合成圖形，不讀相機、模型、Session 或書籤。圖像來源與界線見[資產說明](../docs/assets/README.md)。
