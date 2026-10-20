# 多版本 GitHub Pages 靜態展示網站

[English](../en/pages-showcase.md) · [專案首頁](../../README.zh-TW.md)

此功能使用**同一個 GitHub Pages 網站**展示三代 DepthPort 技術能力；**不是雲端 AI 推論服務**。

| 網站路徑 | 可操作功能 | 不支援的功能 |
| --- | --- | --- |
| `/` | 版本入口、已審核展示圖片與說明 | 不執行 AI、不登入 |
| `/v0.1/` | 原始公車 bus.jpg、後續 v0.2 真 CUDA 推論截圖，以及保留的合成 3D Viewer | 非 bus 的真實點雲；不提供 API 或 RTSP |
| `/v0.2/` | 原始 bus.jpg 和 RTX 4090 四模型／語意分析真截圖；另保留合成幾何操作練習 | 截圖無原始數值 Depth／XYZ，不會執行即時 YOLO／DA3 或宣稱測距準確 |
| `/v0.3/` | 同一組 24 格真實分析中的三張原始 Session 畫面（保存 #1／#12／#24）；另保留合成回放練習 | 未提供真實全部 24 格／逐格 JSON；沒有線上 YOLO／BoT-SORT 或世界軌跡 |

網站的**主要範例**使用真正的 Ultralytics bus.jpg 原圖與已保存真 CUDA 推論截圖，以及來自 Lukas Kosc／Pexels 的三張實際 Session 回放截圖。真實影像有來源與授權說明；額外的互動幾何與合成 24 格回放仍由瀏覽器 JavaScript 生成，與原始真值資料分開，絕不從截圖造出深度數值或物件 ID。詳見[圖像來源說明](../assets/README.md)。真正的四套深度模型、Session 及追蹤仍必須[在本機啟動 DepthPort](installation.md)。

## 本機建置與檢查

建置不需要下載 AI 權重；使用 Python 3.11 或 3.12：

```bash
python tools/check_release.py
python tools/build_site.py
python -m http.server 8765 --directory _site --bind 127.0.0.1
```

瀏覽 `http://127.0.0.1:8765/`，再開啟 `/v0.1/`、`/v0.2/`、`/v0.3/`。靜態連結使用相對路徑，可安全置於 GitHub Pages 的 `/depthport/` 子目錄。原始 v0.1 合成檢視器維持原操作，部署版本入口後改由 `/v0.1/` 進入。

```bash
python -m pytest -q tests/test_pages_showcase.py tests/test_recorded_examples.py
node --check website/showcase.js
node --check website/recorded-examples.js
```

## GitHub Pages 部署流程

[Pages workflow](../../.github/workflows/pages.yml) 會為相關 PR **建置與檢查**，但 PR 不會自動部署。仍需先審核、合併至 `main`，合併至 `main` 後**自動部署**；也可從 `main` 手動執行 workflow_dispatch。此功能不會修改既有 Release／Tag。

部署後應逐頁驗收連結、中英文切換、互動畫布、Session 控制、手機排版，以及不產生任何遠端模型 API 請求。

GitHub Repository **About → Website** 欄位，可由首頁 About 旁的編輯齒輪輸入 `https://jshengp.github.io/depthport/`。不用附加 `?utm_source=chatgpt.com`。建置腳本並不會更改此 Repository 設定欄位。

**範圍控制：** 不上傳客戶錄影、金鑰、非公開資料、模型權重、實際標定與私人 Session；所有部署檔案使用明確白名單，不遞迴複製工作目錄。各版本名稱代表「能力展示」，不是原歷史 Tag 的完整執行快照。本次**不包含 Benchmark Results Dashboard**。
