# 維護階段交接摘要

狀態日期：**2026-10-22** · [主 README](../../README.zh-TW.md) · [ROADMAP](../../ROADMAP.md) · [Results Index](https://jshengp.github.io/depthport/results/?lang=zh-TW)

此文件保存本輪收尾狀態，供日後接續；不是持續更新的 CI 或 Issue 狀態頁。重新開始前，先核對最新 `main`、ROADMAP 與 Issue。本次只補交接文件，不另發新版，也不改寫歷史 Tag 或下載包。

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
