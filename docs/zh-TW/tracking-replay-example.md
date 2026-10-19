# v0.3 真實追蹤回放範例
[English](../en/tracking-replay-example.md) · [首頁](../../README.zh-TW.md) · [Session 操作](sessions.md)

這三張是 **2026-10-19 透過實際瀏覽器擷取、使用真模型結果的回放畫面**，程式為 `28d7b8f`／v0.3.0-alpha.2；不是版本流程示意圖或合成資料。文件在 Alpha.2 之後補入 main，沒有覆寫已發布的 Tag 或下載包。

## 來源與公開展示範圍

作者 **Lukas Kosc**，來源為 Pexels [Urban Street Scene with People Crossing／Busy city street with people crossing at sunset](https://www.pexels.com/video/urban-street-scene-with-people-crossing-34597902/)，頁面 ID **34597902**，發布日 2025-11-04。原始下載 1920×1080、228 格、24000/1001 fps，約 9.51 秒；影片 SHA-256：`9b77a4264bb59290335184b77c6300ba43aa6642cb65b594550c44359fd57d4b`。

2026-10-19 已查閱 [Pexels License](https://www.pexels.com/license/) 與[使用條款第 5–6 節](https://www.pexels.com/terms-of-service/)（條款頁日期 2024-11-15）。條款允許使用與改作、結合其他媒體／文字成為新作品，並限制未改作素材的獨立散布與暗示背書。本頁只發布將選定影格與本程式的實際介面、追蹤框／ID、說明結合的三張文件截圖，**不重新散布原 MP4**。影片權利保留給原作者、沿用 Pexels 條款，不因本程式 AGPL 而改成 AGPL 素材；畫中人物、商家、作者與 Pexels 均不代表認可或參與本專案。

## 畫面怎麼看

三張均來自**同一次分析**，沒有重編 ID、補框或手動修正追蹤。事先選取來源第 **32–55 格**，共 24 格連續影格、不跳格，來源時間 1.293–2.252 秒。畫面下方 `#編號` 是 **Session 儲存順序**，不是原影片影格；本次偵測所有類別，不只人。

### 起始：Session #1 → 來源第 32 格，1.293 秒

![來源第32格的真實回放，顯示4個已關聯偵測](../assets/tracking-replay-start.zh-TW.jpg)

畫面顯示 4 個已關聯偵測；仍有可見行人沒有框，不是完整真值標註。

### 交會與部分遮擋：Session #12 → 來源第 43 格，1.752 秒

![來源第43格的真實回放，行人在推車與車輛旁交會並部分遮擋](../assets/tracking-replay-crossing.zh-TW.jpg)

中央推車／車輛旁有反向行人交會與身體重疊，顯示 5 個已關聯偵測及實際 Object ID。不補畫被遮住的身體，也不對漏掉的偵測虛構框。

### 後段：Session #24 → 來源第 55 格，2.252 秒

![來源第55格的真實回放，顯示新的ID及不再回傳的舊ID](../assets/tracking-replay-later.zh-TW.jpg)

這格顯示 6 個已關聯偵測；先前的 `obj-0004` 不再回傳，出現 `obj-0007`。整段分析共 **7 個本次局部 ID、230 次偵測、125 次已關聯觀測、105 次未關聯偵測**。**未關聯數不是與真值比較的漏檢數。** 新舊 ID 變動是需要重看的線索；來源沒有身分真值，不能直接宣稱確認換 ID，信心門檻與關聯都可能使觀測消失。

## 真實執行條件與重現

- 程式為 [v0.3.0-alpha.2 的 28d7b8f](https://github.com/JShengP/depthport/tree/28d7b8f1038872735195acc68272162050226026)，使用只含此公開範例的乾淨本機副本，不讀取既有私人 Session。
- 以 OpenCV `INTER_AREA` 縮至 **960×540**。本機離線 harness 對選定影格呼叫既有 `V2Adapter.predict`、`prepare_cloud`、`bundle_bytes`、`SessionStore.capture`，保留來源編號、來源相對時間及真實深度；不是假深度、假偵測，也不是新增影片匯入按鈕或自動相機錄影功能。
- 深度為真實 **Depth Anything V2 Small HF**，revision `5426e4f0f36572d16453bbda7a8389317b1bef99`、CUDA FP32、輸入尺寸 518、HFOV 初估 65°。V2 保留相對輸出並映射成展示用虛擬幾何，**不是公尺或標定測量**。
- 本機應用實際版本：Linux、PyTorch `2.10.0+cu128`、torchvision `0.25.0+cu128`、NumPy `1.26.4`、OpenCV `4.11.0.86`、Transformers `4.57.6`、Ultralytics **8.4.176**、FastAPI `0.143.3`、Uvicorn `0.54.0`。沿用既有 CUDA 環境，**不是 Alpha.2 完整 requirements 的全新安裝驗收**；目前 requirements 要求更新的 torch／torchvision，另有 API CI，兩種證據不可混用。
- 語意追蹤是真實快取 **YOLO26n Detect**，CPU、輸入 640、信心 0.25、每格最多 20 個、所有類別。權重 SHA-256：`9b09cc8bf347f0fc8a5f7657480587f25db09b34bf33b0652110fb03a8ad4fef`。
- 實際執行中的應用 API 收到 `{"mode":"detect","backend":"roboflow-botsort","confidence":0.25,"max_frames":24}`，以獨立 **Trackers 2.6.1／Supervision 0.27.0／NumPy 2.2.6／OpenCV 4.11.0.86** worker 及原始偵測做預設 BoT-SORT，不使用 ReID。UI「分析已存影格」目前固定取最後 **12 格**；這次 24 格使用 API，沒有改動 UI 預設。
- 實際瀏覽器開啟 `/sessions?lang=zh-TW`，按「回放已分析影格」，分別選 Session #1／#12／#24 回放，核對疊圖頁尾與報告的影格身分後截圖。另已操作播放，確認由 #1 經後續影格至 #24 自動停止。截圖保留真實 A/B 控制與疊圖狀態，未修 ID。[worker 安裝](tracking-worker.md) · [Session 操作／API](sessions.md)。

重現時先從來源頁下載並核對影片雜湊，使用上述程式與版本、在本機快取深度／偵測權重；透過上述既有 helpers 將來源 32–55 格準備到**新的本機 Session**，啟用儲存及獨立 worker，再呼叫 24 格追蹤 API，從介面開啟該報告。變更編碼、影格、解析度、套件、權重或追蹤設定，結果都可能不同。[彙總紀錄](../validation/v0.3-public-replay-example.json)保存來源／截圖雜湊、設定與彙總數；完整 Session、逐格報告與權重不散布。

## 限制

這是 **24 格、23 個間隔、約 0.959 秒的部分遮擋／交會操作示例**，不是長遮擋 benchmark 或 ID 保留驗收；穩定數字也不保證對到同一個人。Object ID 是局部關聯，不是人臉／身分辨識。沒有真值就不宣稱 IDSW、IDF1、HOTA 或準確率；信心過濾、未確認軌跡與關聯都會省略可見物件。

來源為 23.976 fps，既有 Session worker 每個保存影格仍走**固定 30 Hz 步長**；介面 **1× 目標為每秒 5 個保存影格**，都不是原影片即時播放速度。不宣稱即時性、速度、3D 精度或世界軌跡；短片包含些微相機移動，也不表示相機運動魯棒性驗收通過。實體 RTSP、Windows 真推論／worker、長遮擋、長時穩定性、硬體 WebGL 與標定精度仍待驗證，原預設及歷史追蹤分數不變。
