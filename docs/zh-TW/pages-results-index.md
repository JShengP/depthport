# Results Index 與載入恢復 — 2026-10-20

[Results Index](https://jshengp.github.io/depthport/results/?lang=zh-TW) · [展示首頁](https://jshengp.github.io/depthport/?lang=zh-TW) · [ROADMAP](../../ROADMAP.md#current-pages--目前互動展示)

## 統一結果入口

新增 26 筆有日期的結果條目，涵蓋四深度模型、YOLO 偵測／分割、Baseline／ByteTrack／BoT-SORT、控制實驗與只讀診斷、瀏覽器、安裝與未驗證實機項目。可依分類、模型、追蹤器、平台、結果狀態及關鍵字交集篩選；中英切換保留篩選與搜尋，完整報告連結跟隨語言。下方另列全部公開追蹤研究／診斷報告，保留未通過、零曝光與原始限制。

- `website/results-index.json` 只維護來源路徑、JSON pointer、日期、分組與雙語摘要。建置時從明列於 `PUBLIC_FILES.txt` 的公開檔案讀取指標，產生 HTML；不是重新推論、追蹤或讀取原始診斷。
- 指標不手抄進前端；HOTA／IDF1 由來源 0–1 比例轉為百分比，FN／FP／IDSW 保留原計數，並附來源檔 SHA-256 短識別及完整證據連結。
- MOT17 擴大組的三個追蹤器共用輸入；後續參數組、MOT15 worker 整合與 GT-free 控制另外分組。條目數不等於獨立樣本數，未量測不當成零，不做跨資料組排行榜。
- CUDA 模型實際執行、無權重 CI、保存結果網站相容性、未驗收實機分開標示。歷史紀錄不是即時 CI 狀態；瀏覽器模式不重複累加，原凍結矩陣仍為 33 通過／31 未測。
- 所有條目由建置產生，第一次開頁不需等待結果 API 或大型資料包；停用 JavaScript 仍可閱讀全部結果，只有篩選需要 JavaScript。

主 README、各版 README、首頁與三版展示頁都有入口。未改寫既有驗證 JSON、原始資料、歷史 Tag、預設追蹤器或研究門檻。

## 首頁與載入

首頁僅保留易讀的追蹤摘要；完整套件版本、兩次執行數量、原 Session 未找回與來源／限制移入預設收合的「資料來源與驗證限制」。原結果與差異沒有刪除。

v0.1／v0.2 原本需下載完整 Float32 JSON 才顯示點雲。預設 V2 JSON 是 5,824,697 bytes（公開伺服器也提供 gzip；此處是未傳輸壓縮的檔案大小），沒有逾時或重試。這能解釋慢連線上的等待，但沒有重現使用者所見長時間停滯的確切連線原因。

目前改為先讀取小型點雲包，再接著載入完整數值。小型包由已審查原檔在建置時衍生，保留原 `cloud.packed`、點數、顏色範圍與 RGB 路徑，**不減少原點數、不降低 Float32 精度**。V2 小型 JSON 為 147,793 bytes（gzip 約 102,885 bytes），四模型小型包均低於各原 JSON 的 17%。這減少先看到點雲所需的資料量，不宣稱完整深度下載也縮短相同比例。

載入提示改為「正在載入深度與點雲資料…」，顯示目前階段與已讀取 MB。完整數值未就緒時，查詢保持空白、相關控制停用；點雲可先旋轉／縮放。整次載入 45 秒逾時會中止並顯示重試；小型包無法讀取時可回到原完整包。已載入的模型留在當頁記憶體，切回不重下載；更新載入器的 URL 帶版本識別，避免沿用舊 JavaScript 快取。

## 軟體驗證與限制

- 聚焦離線測試：15 通過。包含衍生點雲與原資料完全一致、結果來源指標、Unicode／條件交集篩選，以及真本機 HTTP 的回應標頭／本文停滯、HTTP／JSON 失敗、逾時與重試。
- Linux 無頭 Chrome 155.0.8059.84／Edge 155.0.4283.62／Firefox 157.0：四模型中心 Float32 查詢與物件遮罩、v0.1／v0.2 載入、當頁模型快取、v0.3 觀測缺口／回放速度回歸通過，各正常執行無頁面 JavaScript 錯誤。
- Chrome 人為故障測試：503 後重試、回應本文停滯 45 秒後重試、小型包 404 回退均通過。停滯時約 0.67 秒先顯示點雲，約 45.48 秒顯示逾時；這只是本機受控故障案例，**不是網際網路速度承諾**。第一輪故障測試未隔離快取，完整數值提前就緒，故不作停滯證據；原失敗保留本機。第二輪以 no-store 測試伺服器隔離後完成。
- Results Index 另檢查三套瀏覽器的中英桌面／390px CSS 窄版、篩選交集、無結果／重設、未通過／未驗證可見性、語言保留與來源指標。初輪 Chrome／Edge 發現原生表單 reset 與 microtask 執行順序造成清除後未重畫，Firefox 沒有該現象；已改為明確重設條件後同步更新，再重驗三套，原失敗留本機。這是本次軟體回歸，沒有擴充或改判歷史凍結驗收矩陣。
- 公開清單、文件連結、靜態建置與差異檢查通過。原始瀏覽器診斷、故障伺服器、截圖與環境都只留本機；公開只有程式、索引與彙總。

Safari、實體手機／原生觸控、其他 OS／build、完整新版全新安裝、實體 RTSP、長時資源與校正測距仍未驗證。未執行模型／追蹤器新效能或品質測試；弱偵測延續、參數與研究接受條件保持原樣。

## English summary

The bilingual Results Index renders 26 dated, source-linked records at build time. Numeric metrics come from allowlisted evidence through JSON pointers; no browser API, raw diagnostic data or inference is used. Cohorts, failed gates, CI without weights and unverified platforms stay separate. This is an evidence index, not a global leaderboard or live CI status.

Homepage tracking details now sit in a closed disclosure. v0.1/v0.2 show the unchanged saved point cloud through a small derived pack before loading exact Float32 queries. Loads show progress, have a 45-second deadline and retry, and cache completed models for the current page. Local three-browser regression and controlled Chrome network-failure tests are scoped software evidence, not new hardware, accuracy or full frozen-matrix acceptance. Raw captures and diagnostics remain local.
