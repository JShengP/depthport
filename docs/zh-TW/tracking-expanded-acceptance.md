# MOT17 擴大追蹤驗收 — 2026-10-19

[English](../en/tracking-expanded-acceptance.md) · [追蹤評估](tracking-evaluation.md)

**狀態：擴大研究實測，長遮擋恢復尚不能算驗收通過。** 本次新增三個場景；條件不同，不能與先前 MOT15 初測直接合併分數。v0.3 維持 Draft，未改變預設追蹤器。

![品質與情境覆蓋彙總](../assets/tracking-v03-mot17.png)

[完整來源雜湊、設定、逐序列分數與三次耗時紀錄](../validation/v0.3-mot17-expanded.json)。

## 資料與使用條款

使用官方 [MOT17 訓練資料](https://motchallenge.net/data/MOT17/)，依 [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) 進行本機非商業研究，並保留原始來源可能有額外條件的提醒。來源歸屬：MOTChallenge contributors，MOT17／MOT16 序列標註。影片、GT、逐格框與 ID、事件區間、權重及抽查影像均不散布；公開只有彙總數值、來源與設定識別。本程式的 AGPL 不會重新授權資料集。

- **MOT17-04-DPM：** 1,050 格、30 fps，夜間高處固定視角人群；固定背景已做視覺抽查。
- **MOT17-11-DPM：** 900 格、30 fps，商場前進中的移動相機。
- **MOT17-13-DPM：** 750 格、25 fps，行經路口的公車視角。

每個實體場景只計一份 DPM／FRCNN／SDP 版本。合計 **2,700 格官方壓縮預覽 MP4，960×540**，不是原始 Benchmark JPEG。GT 為 1920×1080；工具核對格數、FPS、原始 metadata 與雜湊，將預測框等比例 **2 倍還原**後，x／y 再 **+1** 轉為 MOT 座標。不接受長寬比不符或非整數縮放。最初的尺寸防護在評分前攔下這項差異。

## 固定比較條件

每段只跑一次 CPU YOLO26n：Ultralytics 8.4.115、imgsz 640、confidence 0.10、NMS IoU 0.70、人員 class 0、最多 64 個偵測；沒有影格碰到上限。三種追蹤器共用相同快取及完整連續影格，權重與快取 SHA-256 見 JSON。

Baseline 與 Roboflow 2.6.1 ByteTrack／BoT-SORT 使用獨立 NumPy 2.2.6 環境，深度模型環境維持 NumPy 1.26.4。除來源 FPS 外保留預設值，**未調參、未啟用 ReID**。本輪直接呼叫套件，不包含 worker IPC。每個方法／序列跑三次、輪替順序，OpenCV RNG seed 0、OpenCV 單執行緒。27 次執行的重複結果，重新編號後 ID／框／分數完全一致。

耗時保留首次 update，不排除暖機；不含偵測、解碼及啟動，採三次 P50／P95 的中位數，並非混合所有影格後的百分位。這是單機描述性耗時，不能視為即時效能驗收。

全序列分數使用固定版本 [TrackEval](https://github.com/JonathonLuiten/TrackEval/tree/12c8791b303e0a0b50f753af204249e622d0281a)：MOT17 pedestrian preprocessing（含 distractor／zero-marked 處理）、CLEAR IoU 0.5、Identity、HOTA；只在記憶體提供舊 NumPy 別名，未修改上游程式。跨序列由 TrackEval 的正式合併函式計算。

## 結果

以下依 **Baseline／ByteTrack／BoT-SORT** 排列：

- 三段合計 ID Switch：**1,910／69／29**；Fragmentation：**1,351／220／100**。
- Recall：**38.82%／22.70%／20.78%**；IDF1：**18.42%／29.76%／28.80%**。
- HOTA：**20.70%／30.02%／28.86%**。
- 兩段移動相機合計：ID Switch **1,130／51／21**，Recall **49.26%／33.69%／32.08%**，IDF1 **21.56%／37.11%／38.24%**。這不是只改 CMC 的因果對照實驗。

**不能只用較少換 ID 宣稱勝出。** BoT-SORT 的 ID Switch 較低，但保留觀測與 Recall 也較低；本輪整體 IDF1／HOTA 以 ByteTrack 較高，移動相機子集則是 BoT-SORT 較高。偵測覆蓋與啟用門檻仍是明顯問題，不能推出普遍最佳方法，因此不改應用預設值。

## 長遮擋與交會候選診斷

先用 GT 決定事件，**不參考追蹤結果選難例**：

- 長低可見度：visibility ≤0.30 持續至少 1 秒，前後 1 秒內有 visibility ≥0.60 的錨點，共 **11 事件／11 個物件出現次數**。
- 重疊換位：GT 框 IoU ≥0.10，重疊索引間隔最多合併 ceil(0.5×fps) 格，足夠可見的前後錨點中，水平中心左右次序交換，共 **62 事件／124 個物件出現次數**；同一 GT 可參與多次事件。

這些是標註／影像平面代理情境，不等於已確認的物理遮擋或 3D 交會。每段抽查最長的低可見度事件、依 GT ID 排序的第一個換位事件，共 **73 個候選中的 6 個、18 張前／中／後影格**。抽查與低可見度、影像換位相符；公車視角也說明投影換位不等於物理 3D 交會。這是輔助視覺抽查，不是完整獨立人工標註；抽查影像與原始細節留在本機。

診斷先使用 TrackEval preprocessing，再對完整影格做 Hungarian IoU≥0.5 一對一匹配，**不對選定物件重新配對**。比較前方最後匹配、後方首次匹配的合格可見錨點；漏配分開計算。這不是官方分情境 IDF1／HOTA／CLEAR。

- **長低可見度：** 三者都沒有任何事件保留原 ID（各 **0／11**）。前後皆匹配的事件是 **6／3／3**，全部換 ID；至少一端漏配的是 **5／8／8**。因此長遮擋恢復仍不能算驗收通過。
- **重疊換位：** 124 個物件出現次數中，保留同 ID 為 **12／21／19**；兩端皆匹配為 **76／32／27**，其中換 ID **64／11／8**。至少一端漏配 **48／92／97**。只公布兩端匹配者的保留率會掩蓋覆蓋率差異。

下一輪應先拆開偵測覆蓋與啟用／buffer 參數問題，固定條件後在不同序列驗證，再決定是否需要 ReID。實體 RTSP、Windows 真模型／worker、長時間穩定性、標定 3D 與獨立測試集仍屬後續門檻。

## 本機重跑

資料網址、權重及檔案雜湊見 JSON。影片與標註須依條款另取，放在公開清單之外。在既有深度環境產生每段快取：

```bash
.venv-depthport/bin/python tools/cache_video_detections.py \
  --video local/MOT17-04-DPM-raw.mp4 --model models/yolo26n.pt \
  --output outputs/mot17/04-detections.json --classes 0 --max-detections 64 \
  --confidence .1 --imgsz 640 --nms-iou .7 --device cpu
```

另外建立 Python 3.12 環境，安裝 `requirements-tracking-worker.txt`（本次 SciPy 1.18.1），並將 TrackEval 固定於上述 commit、保持無修改。建立本機 manifest：`checked_on`、`labels_archive`、`labels_archive_sha256`、`sequences`；每段提供 `name`、`video`、`detections`、`gt`、`seqinfo`、`video_sha256`、`gt_sha256`、官方 `video_url`、布林 `camera_motion` 與來源 `description`。工具會檢查 GT／metadata 與壓縮包一致，拒絕同一場景的重複 DPM／FRCNN／SDP 版本。

```bash
.venv-trackers/bin/python tools/validate_mot_tracking.py \
  --manifest local/mot17-manifest.json --trackeval-root local/TrackEval \
  --work-dir outputs/mot17-run --output outputs/mot17-summary.json --repeats 3
```

工具不下載或上傳；work-dir 內含本機評估資料。公開前檢視彙總輸出，已發布 JSON 的抽查／環境備註是補充證據，不代替機器計算分數。CI 只跑合成契約，不下載資料集或權重重做本輪實測。
