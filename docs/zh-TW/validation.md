# 驗證紀錄
[English](../en/validation.md)・[首頁](../../README.zh-TW.md)

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
