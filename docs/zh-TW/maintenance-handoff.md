# 維護階段交接摘要

狀態日期：**2026-10-22** · [主 README](../../README.zh-TW.md) · [ROADMAP](../../ROADMAP.md) · [Results Index](https://jshengp.github.io/depthport/results/?lang=zh-TW)

此文件保存本輪收尾狀態，供日後接續；不是持續更新的 CI 或 Issue 狀態頁。重新開始前，先核對最新 `main`、ROADMAP 與 Issue。本次只補交接文件，不另發新版，也不改寫歷史 Tag 或下載包。

**後續維護補記：** [2026-11 依賴、CI 與里程碑結案（2026-11-05 補記）](#maintenance-2026-11)。原始 2026-10-22 快照與研究限制保留；補記中的 CI 對應列明的提交，不代表日後所有 main 提交都已驗證。

## 版本與專案階段

- 發布版本：**[v0.3.0-alpha.2](https://github.com/JShengP/depthport/releases/tag/v0.3.0-alpha.2)**，維持實驗性 Alpha。
- 交接基準：[`2f232d0`](https://github.com/JShengP/depthport/commit/2f232d0583dabeb0b5055e4184fd08ff474060d9)，已在中英文 README 與 ROADMAP 註明進入維護階段。
- 基準提交的 [Application contracts CI](https://github.com/JShengP/depthport/actions/runs/39730312020)：Ubuntu／Windows × Python 3.11／3.12，四項均在首輪通過；不含預訓練權重或真模型推論，不能替代實機與精度驗證。
- 收尾時沒有待合併 PR；[Issue #6](https://github.com/JShengP/depthport/issues/6) 保持開啟作選用驗證，[Issue #8](https://github.com/JShengP/depthport/issues/8) 保持開啟作後續研究。

定位是供探索、可重現實驗與結果檢查的**開源本機工作台**。目前開發階段依已記錄範圍告一段落，後續以已確認問題修正、安全／依賴更新與文件維護為主。研究及選用驗證不必全部結案才能維護 Alpha；多人服務部署不在目前目標內。

## 已完成的功能與公開整理

- **[v0.1：深度與點雲檢視器](../versions/v0.1/README.md)**：四種深度引擎、圖片／RTSP 流程、互動點雲與同影格匯出。
- **[v0.2：空間分析](../versions/v0.2/README.md)**：深度／XYZ 查詢、模型比較、語意遮罩與點雲融合、標定／誤差工具。
- **[v0.3：Session 與追蹤回放](../versions/v0.3/README.md)**：選用本機封存、追蹤框／Object ID、回放與 A/B 區間、書籤／備註／JSON 備份、快捷鍵及輸入／中文選字防誤觸；選配 BoT-SORT worker 隔離 NumPy 相容性。
- **公開展示與結果索引**：真實保存結果的互動頁、各版展示分工、Results Index、同場景組與逐序列 HOTA／IDSW／FN／FP 比較、網址還原及複製比較連結。
- **文件與驗證紀錄**：中英文 README、各版架構／差異／限制、ROADMAP、來源授權、限定瀏覽器證據、CI 與追蹤研究紀錄已整理。

以上是功能或文件完成，不能直接解讀為所有目標環境、追蹤品質或物理距離精度已通過。Pages 只讀審查過的保存結果，不提供線上模型推論；v0.1／v0.2 的公車資料共用來源，v0.3 新舊執行的 ID 與數量分開呈現。[來源、單位與展示限制](real-ai-pages.md)

## 有需求時接續：後續研究（Issue #8）

[研究清單與原證據](https://github.com/JShengP/depthport/issues/8) 保留開啟；目前沒有新的介入或預設升級獲得驗證支持。應用預設仍為簡易關聯，ByteTrack 為離線研究後端，不是 Session 的另一個選項。

1. 下一個已記錄方向是只讀的決策前時序幾何／競爭診斷：沿已接受觀測，分析 **192 筆符合列資格的空閒出生邊、3 組有過去支援的交接組合**，分清預測／觀測幾何、競爭置換與分數差持續性。192 筆仍未過當格 gate；3 組仍未過當格 margin，沒有形成操作提案。[可達性稽核與完整紀錄](tracking-handoff-reachability.md)
2. 有具體控制規則後，才選擇使用條款明確、具有實際處置曝光的未見連續序列，分開發現組與獨立確認。已檢查的 MOT／KITTI 來源不能重新標成未見來源；完整保留所有檢查、零值與失敗。
3. 身分／定位／涵蓋品質的 FN／FP／IDSW／Frag／IDF1／HOTA 評估，須另訂凍結的 GT 計分計畫。GT-free 代理條件、短片、較少出生或零曝光，不代表品質通過。
4. 任何演算法、參數或預設變更，都另需逐場景傷害／效益與足夠獨立證據；目前保留原預設。

接續只讀診斷時，先凍結方法與決策前可用證據，不讀 GT、不調參、不用當格／未來錨點補過去支援。保留弱偵測延續、原生參考與原封存；原失敗、false／null 及缺失證據不得改判通過。新實驗與計分計畫須另行明訂，原始診斷留本機。

## 依用途選做：選用驗證（Issue #6）

[選用驗證清單](https://github.com/JShengP/depthport/issues/6) 不作開源發布阻擋項；只有選定用途或要宣稱對應能力時才安排，未做的繼續標為未驗證。

- 全新 Windows CPU／GPU 的真深度／語意模型、實際 worker 與 Session 整合。
- 授權實體 RTSP 的啟停、認證、H.264／H.265、重連、舊影格處理與長時間穩定性。
- 實測內參、獨立近／中／遠距離參考、平面與時間穩定性；目前 HFOV 是估計，相對／虛擬深度不是公尺。
- 本機完整流程與匯出、目標硬體 WebGL、端到端延遲／吞吐量及持續 RAM／VRAM。
- Safari／macOS、實體 Android／iOS、原生觸控及尚未覆蓋的自然備援路徑；窄視窗不能代替實體手機。

執行前先訂可量測標準，分別記錄版本、環境、合法輸入、命令、結果與失敗。CI、真模型執行、瀏覽器呈現與物理精度是不同證據，不互相替代。

## 下次接續順序與公開界線

1. 先從 GitHub 取得最新狀態，檢查本機未提交變更，再同步工作副本；核對 main CI、Release、[ROADMAP](../../ROADMAP.md) 與 #6／#8。
2. 選定一項實際問題、研究或用途驗證；已有紀錄先讀完整條件與原失敗，避免重做或把已見來源當新資料。
3. 研究先凍結規則／選取／傷害標準，驗證先訂通過條件；軟體維護依變更執行相應檢查，不因整理文件而重跑或改寫研究結果。
4. 公開內容只限經審查的彙總、文件及條款允許且註明來源的範例。新資料先確認使用條款，repo 的 AGPL 不替資料或模型重新授權。

私人相機 URL／帳密、影像、Session、書籤備註／備份、標定資料、權重、GT、完整快取、逐格追蹤及原始診斷留在本機。接續時不要將這些資料加入提交。[安全政策](../../SECURITY.md) · [第三方聲明](../../THIRD_PARTY_NOTICES.md)

<a id="maintenance-2026-11"></a>

## 2026-11 依賴維護與里程碑結案（2026-11-05 補記）

本節記錄 **2026-11-04 已完成的維護批次**，交接基準為 [`1220dc8`](https://github.com/JShengP/depthport/commit/1220dc8d124cfa380cb99086193c2b57e85ec975)。以下是固定的批次收據；本文件後續提交及下次接續時，仍須另查最新 main CI。

### 已整合的依賴與文件

- [PR #45](https://github.com/JShengP/depthport/pull/45)：五個 workflow 的 setup-python 更新為 **7.1.0**，繼續固定官方提交 SHA。
- [PR #46](https://github.com/JShengP/depthport/pull/46)：pytest 最低版本 **9.2.0**，保留 `<10`。
- [PR #47](https://github.com/JShengP/depthport/pull/47)：FastAPI 最低版本 **0.162.0**，保留 `<1`。
- [PR #48](https://github.com/JShengP/depthport/pull/48)：Torch／torchvision 最低版本 **2.15.0／0.29.2**，分別保留 `<3`／`<1`；模型 API CI 先從官方 CPU index 明確安裝 `torch==2.15.0 torchvision==0.29.2`，再安裝模型需求，避免先裝舊 CPU 配對再由解析器升級。
- [PR #49](https://github.com/JShengP/depthport/pull/49)：README／ROADMAP／CHANGELOG 補齊已發布版本、單次維護、後續研究與選用驗證的里程碑分工。上述五筆 PR 均已合併，本次維護分支已整理。

NumPy 1 應用／選配 NumPy 2 worker 的隔離、追蹤預設、弱偵測延續與原研究結果不變。發布版本仍是 **v0.3.0-alpha.2**；本輪未另發 Release，既有 Tag／下載包及原失敗、零值、false／null 均保留。

### 已通過的限定 CI

- **依賴整合 main `6763778`：** [Application contracts](https://github.com/JShengP/depthport/actions/runs/41841147945) **4／4**、[Model API compatibility](https://github.com/JShengP/depthport/actions/runs/41841147998) **4／4** 通過；各覆蓋 Ubuntu／Windows × Python 3.11／3.12。
- **文件 PR `d7c6407`：** [Application contracts](https://github.com/JShengP/depthport/actions/runs/41841620558) **4／4** 通過。
- **本批最終 main `1220dc8`：** [Application contracts](https://github.com/JShengP/depthport/actions/runs/41842179372) **4／4** 首輪通過。最後一批只改 Markdown，模型 API workflow 沒有重新觸發；其模型驗證收據仍是上方程式／依賴相同的 `6763778`，不能另算一次模型驗證。
- **setup-python 整合 main `a144cc8`：** [Pages 建置／部署](https://github.com/JShengP/depthport/actions/runs/41839753178) 與 [Windows Node stability](https://github.com/JShengP/depthport/actions/runs/41839753419) 亦通過，範圍依各自 workflow 與既有協定。

以上是軟體契約、真模型 API 安裝／匯入與部署流程證據；沒有下載預訓練權重或執行模型推論，不新增實機、瀏覽器矩陣、效能、追蹤品質或物理距離精度驗收。原驗證 JSON、保存結果、研究程式與日期紀錄未因依賴更新改寫。

### 里程碑與下次接續

- **已結案 4 項：** [v0.1 功能／發布範圍](https://github.com/JShengP/depthport/milestone/4)、[v0.2 功能／發布範圍](https://github.com/JShengP/depthport/milestone/5)、[v0.3 實驗性 Alpha 範圍](https://github.com/JShengP/depthport/milestone/6)，以及 [2026-11 維護批次](https://github.com/JShengP/depthport/milestone/3)。本次維護里程碑內五筆 PR 均已關閉且合併；版本里程碑結案不代表所有品質／實機門檻通過。
- **持續開啟 2 項：** [Tracking reliability research](https://github.com/JShengP/depthport/milestone/1) 對應 [Issue #8](https://github.com/JShengP/depthport/issues/8)；[Optional local-use validation](https://github.com/JShengP/depthport/milestone/2) 對應 [Issue #6](https://github.com/JShengP/depthport/issues/6)。兩者無到期日，Issue 原內容與限制保留，不阻擋開源維護。
- 下次先同步最新 main 並核對 [ROADMAP 里程碑](../../ROADMAP.md#milestones--里程碑)、PR 與 CI；這五筆維護 PR 已完成，不必重做。研究仍可從上方 **192 筆空閒出生邊／3 組交接組合**的決策前只讀稽核接續，或依用途選做 #6；本輪沒有執行新研究、調參或升級追蹤預設。

維持開源本機工作台與維護階段定位，不把多人服務部署列為必要門檻。原始診斷、私人影像／Session／備註、帳密、權重及完整快取繼續保留本機，公開交接僅列經確認的版本、彙總與 GitHub 收據連結。
