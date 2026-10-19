# 驗證紀錄
[English](../en/validation.md)・[首頁](../../README.zh-TW.md)


## v0.3.0-alpha.2 封裝 — 2026-10-19

Alpha.2 封裝下列已驗證的依賴／Pages 更新與各版流程圖。[本版範圍與未驗證項目](../releases/0.3.0-alpha.2.md)。整合提交 `09c1f8a` 已通過[應用 4 項](https://github.com/JShengP/depthport/actions/runs/39211080641)、[真模型 API 匯入 4 項（無權重）](https://github.com/JShengP/depthport/actions/runs/39211203960)與 [Pages 建置／部署](https://github.com/JShengP/depthport/actions/runs/39211229203)。封裝提交的實際 CI 與下載校驗檔由 Release 提供；本次沒有新增真權重推論、實體相機或追蹤品質驗收。

## Alpha 發布後的依賴與視覺導覽 — 2026-10-19

[依賴彙總紀錄](../validation/v0.3-dependency-followup.json)記錄依序處理 #10／#13／#17／#18、Pages 實際設定／部署、最低版本本機檢查與精確提交 CI。修正後 NumPy 1 配方暫緩 SciPy 1.18.x／plyfile 1.1.4，worker 維持隔離；真 API 安裝／匯入不執行權重推論，也不代表追蹤／實機／精度驗收。

新增的[版本比較圖](../assets/versions-overview.svg)與各版 SVG 均為程式生成的功能示意，不是截圖或模型結果，來源另有說明。已發布 Alpha Tag／附件不變，main 包含後續文件與依賴更新。

## v0.3 Alpha 整合驗證 — 2026-10-19

v0.3 維持 **Alpha 預發行版／實驗性開發預覽**。[本版範圍與未驗證項目](../releases/0.3.0-alpha.1.md) · [路線圖](../../ROADMAP.md)

- PR #7 已合併為 `b9b95d4`；[main 應用 CI 4／4](https://github.com/JShengP/depthport/actions/runs/39204293374)及[真模型 API 相容性 4／4](https://github.com/JShengP/depthport/actions/runs/39204293354)通過 Ubuntu／Windows × Python 3.11／3.12。API CI 安裝明列 CPU 配方並匯入四套實際 API，不載權重、不推論；只在這個範圍內更新歷史安裝限制。
- 前次整合檢查：Python 306 通過／6 個選配跳過；回放控制器 11、疊圖／Session 檢查 606 通過，Session 雙語 key 264 一致。版本與文件封裝驗證另見 Actions 與 GitHub Release。
- [初測／worker](tracking-worker.md)、[2,700 格擴大研究](tracking-expanded-acceptance.md)、[1,179 格參數研究](tracking-parameter-acceptance.md)與[新增換 ID 診斷](tracking-error-diagnosis.md)保留原條件；固定快取為 Ultralytics 8.4.115，目前依賴 8.4.176，舊分數不是新版偵測器驗收。
- 長遮擋／泛化、實體 RTSP、Windows 真權重／真 worker、長時穩定性、NVIDIA WebGL 與標定測距仍待驗證。此次封裝沒有新增真權重推論或實體相機測試；下方 GPU 紀錄保留原日期。只散布公開原始碼及彙總，本機 Session／備註／原始序列不公開。

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
