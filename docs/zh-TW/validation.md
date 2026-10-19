# 驗證紀錄
[English](../en/validation.md)・[首頁](../../README.zh-TW.md)

## 同一規則的 GT-free 曝光發現與保留確認 — 2026-10-19

[完整規則／清單／決定](tracking-past-exposure.md) · [凍結](../validation/v0.3-past-exposure-protocol.json) · [發現](../validation/v0.3-past-exposure-discovery.json) · [確認](../validation/v0.3-past-exposure-confirmation.json)。既有16段MOT全列發現、17,984格，過去／保護／同時符合實際veto40／8／2、曝光11／6／2段，依原順序選09／10／MOT20-06。完整發現與選取先封存，才在未見KITTI0004／0005做偵測／追蹤（611原格逐像素核對）；兩段各控制均零觸發，沒有控制獨立重現曝光。18段／216次因子對照加18次未掛參考都完成，三次canonical／完整trace／計數一致，零值／失敗規則保留，本輪無失敗。不讀GT／分數、不調參，弱延續／預設不變，原診斷留本機。應用408通過／33選配略過、固定相關契約98通過。下一步先診斷固定規則適用曝光落差，不調門檻；新來源搜尋須另凍結發現／未見確認，品質／傷害仍待驗證。

## 決策前觀測支援／更新置換保護控制 — 2026-10-19

[規則、全清單與決定](tracking-past-support.md) · [原凍結協定](../validation/v0.3-past-support-protocol.json) · [彙總](../validation/v0.3-past-support.json) · [報表修補附註](../validation/v0.3-past-support-report-amendment.json)。新授權 KITTI 0000–0003，全部978格原圖逐像素核對；四組因子對照×三次重複與四次未掛控制參考一致，全部預測先封存才讀GT。各景／各組均零活躍替代、零veto，canonical預測及官方分數不變：305筆可評分行人GT，FN174／FP169／IDSW0／Frag1；0003可評分行人GT零。逐景傷害無新增FN／IDSW，但零有效曝光使所有控制未通過品質門檻，不是可靠性驗收。空階段／空檔報表修補於讀GT後公開附註，直接使用原封存預測，不重跑追蹤、不調參或升預設。應用401通過／29選配略過，固定相關契約87通過。下一步另凍結同規則不看GT的曝光選取與未見保留確認，原始資料留本機。

## 凍結有效更新風險分組與跨格支援 — 2026-10-19

[定義、全清單與決定](tracking-temporal-support.md) · [抽取前協定](../validation/v0.3-temporal-support-protocol.json) · [彙總](../validation/v0.3-temporal-support.json)。完整 197 個參考替代／17,984 格，八個占用×更新變化組、197 個非空已記錄歷史錨點，120,360 次年齡／連續計數核對。不追蹤、不讀 GT、不調參；出生未索引。下一格過門檻支援 114／有號差 19，69 個因原列未更新而未知；有號差前綴只有 1 個達兩格，沒有更長。不新增時間 veto 或挑 N，下一步另凍結只用過去接受觀測的資格、活躍／保留角色與更新保護，再談介入與 GT 傷害分數。全來源零值／未知及原階段保留，原始歷史本機，兩次抽取逐位元相同。

## 凍結替代關聯的成本與競爭結構 — 2026-10-19

[方法、全序列清單與決定](tracking-competition-structure.md) · [彙總](../validation/v0.3-competition-structure.json)。不追蹤、不讀 GT、不調參，分析 197 個參考替代（發現 192／原保留確認 5），兩次完整診斷逐位元相同。完整成本全正，但 188 個競爭者已有合格更新、165 個同欄更高分；目標分量 183 個環／14 個路徑。56 個替代讓原漏格列失去更新，含 12 個數目不變但置換更新列，39 個成本含門檻下貢獻。等價值尚非身分歧義代理，下一點為有效更新置換風險組與跨格穩定性，不挑容差、不動弱延續／預設；原矩陣／ID 留本機。應用測試 363 通過／20 選配略過，固定 NumPy 2 契約 46 通過。

## GT-free 曝光選取與保留確認 — 2026-10-19

[凍結規則、結果與全序列](tracking-exposure-selection.md) · [協議](../validation/v0.3-exposure-selection-protocol.json) · [發現](../validation/v0.3-exposure-discovery.json) · [確認](../validation/v0.3-exposure-confirmation.json)。固定完整 14 段發現／2 段保留、17,984 格／144 次。未配對控制在發現 6 段共觸發 8 次，依序選 MOT17-10；兩段保留皆零觸發。等價控制在全組都未觸發；選取不靠 GT／品質分數，兩者皆未獨立重現曝光或通過可靠性。完整揭露零值與失敗、弱偵測／配置保留、原始資料留本機。事後摘要的 197 個參考替代全有正目標成本。另更正 MOT17-04 早已出現在一般比較，前輪新增的是快取；原凍結紀錄保留。

## 競爭者占用／一對一替代獨立控制 — 2026-10-19

[方法與結果](tracking-exclusive-competition.md) · [凍結配置](../validation/v0.3-exclusive-competition-protocol.json) · [彙總](../validation/v0.3-exclusive-competition.json)。先前研究過的固定相機 MOT17-04 換新快取，完整 1,050 格／四組各三次，重複雜湊一致。原對照／未配對競爭者／等價替代：FN 38,587、FP 703、IDSW 7、HOTA 29.7320%；舊控制 FN +6、FP 不變、IDSW −1、HOTA 30.3467%。新控制都零觸發、輸出精確等同對照，是有效曝光不足，不是接受的修復；舊組未通過漏追／FP 篩選。凍結值與弱偵測延續保留，原矩陣／ID／案例留本機；下一步凍結 GT-free 曝光選取與獨立確認，前輪公車及實機／長遮擋未驗收仍保留。

## 延後接回的狀態／關聯歷史診斷 — 2026-10-19

[方法與發現](tracking-recovery-history.md) · [彙總](../validation/v0.3-recovery-history.json)。不追蹤／推論／調參，原分數及 HOTA solver 全欄位精確重現，重複完整診斷雜湊一致。12 筆未輸出有仍保留但低於閘門的假說，8 筆保留偵測被 CLEAR 配給其他 GT，新增換 ID 位置為同前綴轉換延後一格；公車損失為 .05–.35 的 5 個低定位 GT×影格。10 次觸發的競爭者均已配其他框，強制替代成本 TP／FP 重疊；下一點為有效排他競爭與實際曝光，不直接選新閘門／升預設。原矩陣／橋接／案例留本機。

## 延後接回控制的移動相機重驗 — 2026-10-19

[方法、結果與錯誤補析](tracking-recovery-moving.md) · [凍結配置／修正紀錄](../validation/v0.3-recovery-moving-protocol.json) · [彙總](../validation/v0.3-recovery-moving.json)。MOT17-11／13 共 1,650 格／12 次，控制與版本不變、重建共用偵測，重複／未加探針對照均一致。FP 543→535、FN 13,695／換 ID 21 不變，新增 FN／換 ID 均 0；公車 HOTA 24.9588→24.9473% 退步，整組未通過逐場景篩選，長事件無改善。前輪 22 筆新增 FN 拆為直接延後 2／未匹配 12／仍輸出 8，新增換 ID 當格無延後且輸入相同。報表缺匯入僅作匯入修正，保留原凍結檔；不調參、預設／發布不變，原始診斷留本機。

## 競爭時延後接回控制實驗 — 2026-10-19

[方法與結果](tracking-recovery-acceptance.md) · [凍結配置](../validation/v0.3-recovery-deferral-protocol.json) · [彙總](../validation/v0.3-recovery-deferral.json)。新 MOT20-01 共 429 格，兩組各重跑三次、完整診斷與輸出一致，另核對未加探針的對照。延後 4 筆：FP 55→52、FN 17,194→17,092、換 ID 21→13、IDF1／HOTA 改善，通過凍結研究篩選；但碎裂 46→48、新增 22 筆 FN／1 次換 ID、召回僅 13.98%、長事件無完整端點，仍未驗收／不升預設。保留一般弱偵測延續，原始診斷留本機；下一步換更多授權場景／移動相機重現，框品質另做控制。

## 未確認升格／恢復關聯成本診斷 — 2026-10-19

[方法與結果](tracking-association-diagnosis.md) · [凍結擷取配置](../validation/v0.3-association-diagnosis-protocol.json) · [彙總紀錄](../validation/v0.3-association-diagnosis.json)。同一組 1,179 格／8.4.176 快取的 16 次觀察重跑，精確重現原預測、完整重複診斷雜湊與官方 CLEAR／Identity／HOTA。升格成本重疊；下一個控制點為 ByteTrack 漏格假設弱階段與活躍假設的低差距競爭（24 FP、5 筆不同先前 GT 的 TP、5 筆同 GT 的 TP）。此為診斷子群組，不是安全閘門或分數改善；保留弱延續與原預設，矩陣／ID／原始案例留本機。獨立控制、長遮擋及實機驗收仍未完成。

## 新 ID 確認／競爭控制實驗 — 2026-10-19

[方法與結果](tracking-admission-acceptance.md) · [凍結配置](../validation/v0.3-tracking-admission-protocol.json) · [彙總紀錄](../validation/v0.3-mot17-admission.json)。已研究的 MOT17-09／10 場景以 YOLO26n CPU 8.4.176 重建共同快取：1,179 格、18,164 筆行人觀測，兩後端各六配置、三次重複，共 72 次。確認 3／5 減少 FP 卻增加 FN、降低整體 IDF1／HOTA；出生時 IoU .5 競爭閘門阻擋零次，標準化預測完全相同。重複輸出一致，24 份場景／配置診斷與官方 CLEAR 精確核對。沒有候選通過事前研究篩選，不改預設，不宣稱獨立序列／長遮擋通過；來源條款與環境限制保留，原始輸入／案例留本機，歷史紀錄及發布包不變。



## 公開影片真實回放文件範例 — 2026-10-19

[實際截圖與執行條件](tracking-replay-example.md)／[彙總紀錄](../validation/v0.3-public-replay-example.json)：24 格 Pexels 連續影格經真 V2 深度、實際 24 格 Session API／獨立 worker，擷取 3 張未修 ID 的介面畫面並標示來源授權。約 0.959 秒的部分遮擋／交會示例，無身分 GT，不是新追蹤分數或長遮擋驗收；沿用 CUDA 環境不等於完整新版 requirements 全新安裝，worker 步長與回放速度也不同於來源 FPS。歷史研究與發布證據不變。

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
