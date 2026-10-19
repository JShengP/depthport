# Semantic Tracking 實機驗收 — ID Switch／遮擋評估

後續[啟用門檻錯誤診斷](tracking-error-diagnosis.md)核對新增／消失 CLEAR 錯誤、檢查本機案例，並決定改善實驗順序。

新增另一組序列的[參數驗收](tracking-parameter-acceptance.md)，比較啟用門檻與遺失追蹤保留時間，逐一記錄事件改善及退步。


**2026-10-19 更新：** [MOT17 擴大驗收](tracking-expanded-acceptance.md) 新增三場景 2,700 格、可見度／換位情境及三次重複比較；較少換 ID 同時伴隨較低 Recall，長遮擋恢復尚未通過。
[English](../en/tracking-evaluation.md) · [Sessions](sessions.md) · [首頁](../../README.zh-TW.md)

**狀態：v0.3 實驗性離線評估工具。不是正式 MOT Benchmark，也不是實體相機即時速度或 3D 測距驗證。** 本工具將 Session 產生的 `tracking.json` 與人工標註 `ground_truth.json` 比較。執行時**不會重新推論 AI、錄影、上傳或改動原 Session**。內附範例是合成資料，不是真實 YOLO 結果。

## 真實影片初步驗證 — 2026-10-17

本機研究使用官方壓縮版 [MOT15 TUD-Stadtmitte](https://motchallenge.net/data/MOT15/) 的 **179 個連續影格**與 1,156 個 GT 框。先在 CPU 執行一次真 YOLO26n 人員偵測（confidence 0.1、NMS IoU 0.7、每影格最多 20 個），所有候選都使用同一份偵測快取與影格順序。[彙總結果、雜湊、完整配置與八組方法分數](../validation/v0.3-tracking-pilot.json)。

以固定版本 [TrackEval](https://github.com/JonathonLuiten/TrackEval/tree/12c8791b303e0a0b50f753af204249e622d0281a) 評估現有方法、Ultralytics ByteTrack／BoT-SORT，以及五種輕量 [Roboflow Trackers](https://github.com/roboflow/trackers) 實作。部分觀察如下：

- DepthPort 現有匹配：**34 次 ID Switch**、IDF1 **50.16%**、Recall **86.33%**。
- Roboflow ByteTrack：**23 次 ID Switch**、IDF1 **69.19%**、Recall **81.40%**。
- Roboflow BoT-SORT：**7 次 ID Switch**、IDF1 **81.01%**、Recall **81.57%**。

這支持將 Roboflow BoT-SORT 列為下一個優先候選，但不能只看 ID Switch：Recall 同時降低。各實作使用各自預設閾值，Roboflow 僅將 frame rate 設為 25；沒有調參或 ReID。單一短訓練片段與 MP4 壓縮影格**不是完整 MOT Benchmark，也不能推出普遍最佳方法**。原 GT 可能包含遮擋框，本次未另做逐情境或僅可見物件的人工標註審核。

另外以 **24 個連續影格（78–101）**完成實際 Session 流程：真 DA V2 Small CUDA 深度、封存完整性、RGB／深度／點雲回放、時間一致性，以及 CPU YOLO26n 偵測／分割追蹤。Detect 共 172 筆觀測、19 個 ID；Segment 共 159 筆、16 個 ID。深度保留相對／虛擬單位，相機 XYZ 為有效有限值；使用估計內參，沒有公尺真值。JSON 裡的 Session 診斷分數使用原本實驗性評估器，不能與 179 影格的 TrackEval 分數混用。

Roboflow `trackers==2.6.1` 使用 `supervision.Detections` 接口，程式碼採 Apache-2.0。它要求 NumPy >=2.0.2，而目前 DA3 配方要求 NumPy <2，因此本次以**獨立 NumPy 2.2.6／supervision 0.27.0 環境**比較，四模型環境保留 NumPy 1.26.4。整合需先驗證依賴遷移或獨立 worker；本次未安裝或測試 McByte 的選配遮罩模型。

MOT15 僅供本機非商業研究，遵循[官方 CC-BY-NC-SA-3.0 與原始來源條件](https://motchallenge.net/data/MOT15/)。此 Repo 不包含影片、GT、逐影格框／ID、Session 包或執行日誌。v0.3 Alpha 維持實驗性開發預覽，繼續補充更多場景與實體相機驗收。

## 應測情境

- **進出畫面：** 人員或物體進入及離開鏡頭範圍。
- **漏檢：** 可見物件沒有取得有效偵測／關聯。
- **遮擋與再出現：** 物件部分遮擋或完全消失後重新出現。
- **交會／重疊：** 同類別多個物件交換左右順序，容易發生 ID Switch。
- **快速移動、光線變化、移動相機：** 分情境記錄與比較。

完全被遮擋、無法可靠標框時，可以把整張影格標註為 `"evaluated": false` **不納入評分**；部分遮擋但仍可見的物體應保留真值框並標記 `occlusion`。不要任意排除難例提高分數。

## 取得追蹤結果

在本機啟用 `ENABLE_SESSION_STORAGE=1`，完成真實深度推論後到 `/sessions`，**手動保存 2～24 張**影格，執行 YOLO Detect／Segment「分析已存影格」，下載 `tracking.json`。報告內的 `index` 是已保存的 Session 影格編號，**不是原始影片的逐幀 Frame Number**。

**關鍵限制：** v0.3 的手動儲存影格可能相隔數秒，不能以此聲稱「連續影片 30 FPS 下的追蹤性能」，也不能推論完整遮擋期間的 ID 持續能力。若未來要正式比較 ByteTrack／BoT-SORT，應另外使用經授權的**連續、逐幀標註影片**，固定同一套 YOLO 權重、輸入影格順序、解析度及追蹤參數，再轉成相同評分格式或用標準 MOT Benchmark 工具。

## Ground Truth JSON 格式

```json
{
  "format": "depthport.tracking-ground-truth.v1",
  "session_id": "<與 tracking.json 相同的 Session UUID>",
  "frames": [
    {"index": 1, "tags": ["normal"],
     "objects": [
       {"gt_id": "object-A", "class_id": 0, "bbox": [10, 20, 100, 180]}
     ]},
    {"index": 2, "tags": ["occlusion"],
     "evaluated": false, "objects": []}
  ]
}
```

`sampling` 可填 `manual_sparse`（手動稀疏）、`dense_video`（完整影片影格）、`synthetic_example_not_real_video` 或 `unspecified`。這只是人工填寫的流程說明，不代表工具已驗證取樣頻率。

`gt_id` 是**人工指定的物件標註 ID**，不是人物真實身分。`bbox` 是與儲存的 `rgb_aligned.png` **相同像素網格**的 `[xmin,ymin,xmax,ymax]`，`class_id` 需遵守 YOLO 類別編碼。

可用情境標籤：`normal`、`entry_exit`、`occlusion`、`crossing`、`fast_motion`、`low_confidence`、`lighting_change`、`camera_motion`。每個影格最多 64 個人工真值與 64 個預測物件；一次最多 24 個標註影格。`evaluated=false` 為整張影格跳過；若評估影格的 `objects=[]`，表示確認畫面中沒有要追的可見物件，該影格上的預測可能計入 FP。人工未標註到的物件也會影響評分。

## 執行評估

```bash
python tools/evaluate_tracking.py \
  --tracking outputs/sessions/<session-id>/tracking.json \
  --ground-truth /path/to/ground_truth.json \
  --iou 0.5 \
  --output outputs/tracking-evaluation.json
```

採用**同類別限制、最佳 IoU 的 Hungarian 一對一匹配**，並輸出總計與分情境的 TP／FP／FN、Precision／Recall／F1、ID Switch、Fragmentation、逐影格指標及診斷事件。

- **ID Switch（本工具定義）：** 相同人工 GT ID 原本配對到某 Object ID，重新出現時卻匹配到另一個 Object ID。
- **Fragmentation（本工具定義）：** 可見 GT 在已評估影格中失去配對，之後重新配對；連續漏配序列算一次。
- **FN：** 可見真值物件沒有成功配對；可能由偵測漏失或追蹤關聯失敗造成，不能直接判定是哪一方。
- **FP：** 預測物件沒有配對到已標註的可見真值；人工漏標也會增加 FP。

**不是官方 CLEAR MOT、MOTA、IDF1 或 HOTA。** 若需發表可直接與研究論文比較的 MOT 數據，應使用 [TrackEval](https://github.com/JonathonLuiten/TrackEval) 等標準評估工具及一致的標註規範。

### 可直接跑的合成範例

```bash
python tools/evaluate_tracking.py \
  --tracking examples/tracking/tracking.synthetic.json \
  --ground-truth examples/tracking/ground_truth.synthetic.json \
  --output outputs/example-tracking-evaluation.json
```

## ByteTrack／BoT-SORT 導入決策

| 實驗觀察 | 建議先測試 | 判斷原因 |
|---|---|---|
| 大量可見目標 FN，已偵測時 ID 相對穩定 | 改善偵測模型、資料與 Confidence 設定 | Tracker 不能補出所有缺失的偵測證據 |
| 短暫遮擋導致追蹤碎片化 | **ByteTrack**、低信心二階段配對、`track_buffer` | ByteTrack 可用低分框協助短期恢復 |
| 同類別物件交會、遮擋再出現時頻繁換 ID | **BoT-SORT**，視情況比較是否啟用 ReID | 外觀與運動資訊可能改善，但增加資源成本 |
| 相機會移動 | 評估 BoT-SORT 的 Global Motion Compensation | 2D IoU 關聯不具移動相機補償 |
| 2D ID 穩定，但 Camera XYZ 抖動 | 先檢查深度、內參及時間一致性 | Tracker 無法修復不可信的深度尺度 |

參考：[Ultralytics Tracking](https://docs.ultralytics.com/modes/track) 與 [TrackEval](https://github.com/JonathonLuiten/TrackEval)。不同 Ultralytics 版本的內建 Tracker 清單可能不同，使用前需實際檢查。

**驗收原則：** 將同一批人工標註影片交給候選方法，固定模型、硬體、Frame Sampling 和置信門檻，並同時測品質與速度。尚未取得足夠真實標註資料前，不應任意訂出代表產品可靠度的 IDSW／Recall 門檻。相關真實資料驗收通過前，維持實驗性定位與原有預設。
