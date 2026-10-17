# 驗證紀錄
[English](../en/validation.md)・[首頁](../../README.zh-TW.md)

## v0.2 本機 GPU 驗證 — 2026-10-17

以下是 v0.2 Alpha 的實測；較下方保留歷史 v0.1 紀錄，不應把舊環境限制當成目前 v0.2 結果。[v0.2 機器可讀摘要](../validation/v0.2-summary.json) · [真推論截圖及來源](../assets/README.md)。

- **環境：** Ubuntu 24.04 的全新 Python 3.12.3 獨立環境；RTX 4090、驅動 580.178.04、torch 2.10.0+cu128／CUDA 12.8、NumPy 1.26.4、OpenCV 4.11.0.86。Ubuntu 安裝腳本及四套 adapter 匯入皆通過。
- **應用測試：** 預設測試 117 通過、4 個選配真模型案例跳過；之後以快取的真權重與公開圖片，**另跑同四個真模型案例：4 通過、0 跳過**。這是兩次不同的執行。
- **真深度推論：** YOLO26 Depth、DA V2 Small、DA3 Small、DA3Metric Large 皆在 CUDA 完成；驗證相同輸入 SHA-256、原生單位、有效深度、原始輸出保留，以及比較 ZIP 中的 PLY／NPY。
- **語意融合：** 真 YOLO26n Detect／Segment 在範例各產生五個物件；檢查遮罩對齊、有效深度點集合及同影格匯出，沒有使用模型替身。
- **真正瀏覽器 HTTP：** Chrome 透過 loopback HTTP 連到 Uvicorn，完成像素 XYZ、過期／非法像素回應、比較結果、ZIP 下載、語意顯示與雙語操作。已測 JavaScript 錯誤 0，390px 水平溢出 0。WebGL 採 **SwiftShader 軟體繪圖**，未驗證 NVIDIA 顯示 GPU 繪圖。
- **已修正回歸：** 比較卡片尚未加入頁面便以零寬高計算視角，導致點雲縮成幾個像素；改為先加入卡片再 fit。新增瀏覽器檢查在修正前失敗、修正後通過。
- **其他：** 170／82 組雙語 key、公開清單／連結、真 HTTP smoke、靜態示範及原始碼封裝通過。`pip check` 仍回報 DA3 配方刻意省略的 `pre-commit`／`xformers`；必要匯入與實際推論成功。

輸入是上游公開範例，並非實體 IPCam；模型載入／下載及單圖耗時不是 FPS benchmark。Windows 完整模型安裝、實體相機 codec／認證／重連、實測相機內參、真值距離精度、長時 VRAM／穩定性及 NVIDIA WebGL 繪圖仍未驗證。公開資料不包含私人 runtime log、帳密、權重、標定檔或原始匯出包。

## 歷史 v0.1 驗證 — 2026-10-16

以下是初版原始碼與先前環境的歷史紀錄，不代表目前 v0.2 硬體驗證狀態。

檢查日期 **2026-10-16**，DepthPort **0.1.0-alpha.1**。此紀錄是應用整合檢查，不是模型精度或正式產品驗收。[機器可讀摘要](../validation/summary.json)

## 本次實際執行

| 項目 | 結果 | 實際範圍 |
|---|---|---|
| Python 測試 | **102 通過、4 跳過** | 幾何、API、adapter 契約、生命週期、原始碼封裝與防護；模型使用明示替身 |
| 四模型切換 | 替身測試通過 | 同圖雜湊、卸載／載入順序、generation、單位與匯出 |
| 英文／繁體中文 | **每種語言 169 個一致的 key** | 插值、DOM 對應、偏好／儲存邏輯及無法存取 storage 的回退 |
| UI 操作 | 明示 TestClient bridge 通過 | 雙語、不因語言切換而推論、保留結果、四模型替身、同影格匯出、旋轉／縮放／復原 |
| 窄螢幕 | 兩語言通過 | 390px 已測版面無水平溢出 |
| JavaScript page errors | 已測路徑為 0 | 實際 renderer：**CANVAS 3D FALLBACK** |
| 真 HTTP 服務 | 通過 | Uvicorn＋Python client 檢查 status／models／about／license／首頁與靜態檔；不載入模型 |
| 靜態示範建置 | `python -S` 通過 | 僅 Python 標準函式庫，建置器不啟動 AI 或服務 |
| 公開原始碼檢查 | 通過 | 明列清單、Markdown 相對連結、常見帳密與私人路徑模式 |
| 語法 | 通過 | Python compile、JS parse、Bash parse 與 workflow YAML parse |

未下載新的預訓練權重。測試環境為 **Linux／Python 3.13.5／torch 2.10.0+cpu／NumPy 2.3.5／OpenCV 4.13.0.92**，**不是**目標乾淨安裝配方。`docs/assets/` 截圖來自真實 UI 的明示合成資料。

## 尚未驗證

**真模型推論：** 四個選配 pytest integration case 跳過；真實執行 `check_env.py --all` 因缺少 `ultralytics`、`transformers`、`depth_anything_3` 而匯入失敗。假 API／CPU tensor 測試不能代替模型本身。

**目標安裝：** 未執行 Windows 批次檔、全新 Python 3.10～3.12 安裝或完整四 runtime 相依解析。YAML 可解析不是 GitHub Actions 已執行，CI matrix 尚未在遠端跑過。

**GPU、RTSP 與量測：** CUDA、MPS、WebGL GPU shader、VRAM、實測 FPS、相機 codec／認證／重連、長時穩定性及真值精度皆未驗證。

**瀏覽器 HTTP 端到端：** 嘗試真正的靜態 localhost 網頁連線，Chromium 回傳 `ERR_BLOCKED_BY_ADMINISTRATOR`；沒有修改或繞過環境政策。UI 另外以 inline 資產及明示 TestClient bridge 測試，不代表 browser→HTTP→AI 端到端成功，也未證明經網路 reload 的瀏覽器持久設定。

**公開與權利：** 尚未建立 GitHub repo、推送程式、發布 pre-release 或部署 Pages。清單檢查不是完整 secret／歷史掃描、著作權核准或安全稽核。

## 下一道驗證門檻

依安裝指南建立目標設備新環境，以有權使用的 `camera.jpg` 執行 `check_env.py --all --image camera.jpg`，逐一記錄真模型結果。再驗證真正瀏覽器連線、GPU、RTSP 重連與長時操作；宣稱公尺精度前需實測真值。
