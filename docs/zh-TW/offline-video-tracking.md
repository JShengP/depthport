# Offline Video Tracking Benchmark — 連續影片追蹤器比較（實驗性）

[English](../en/offline-video-tracking.md) · [首頁](../../README.zh-TW.md)

此功能在**離線影片**上比較 DepthPort 既有的 2D IoU／中心距離追蹤器、[Roboflow Trackers](https://github.com/roboflow/trackers) 的 **ByteTrack／BoT-SORT**。三種方法**讀取同一份預先保存的 YOLO 偵測結果**，而不是各自重新跑模型。既有 DepthPort Session／Depth／RTSP 不受影響；本功能不會持續錄影、不會自動連接相機，也不會計算真實世界 3D 軌跡。

## 必須使用獨立環境

上游 `trackers==2.6.1` 採 **Apache-2.0**，需要 NumPy >=2；目前 DepthPort／DA3 安裝配方固定 NumPy 1.26.4。**不要在同一個 `.venv-depthport` 直接安裝 trackers。** 使用兩個虛擬環境，透過 JSON 交換偵測結果；Ultralytics 與權重本身仍有獨立授權。

```bash
# 1. 在已可使用 Ultralytics 的 DepthPort 環境產生偵測快取
.venv-depthport/bin/python tools/cache_video_detections.py \
  --video samples/clip.mp4 --model yolo26n.pt --confidence 0.10 \
  --output outputs/benchmark/detections.json

# 2. 建立只用於 Benchmark 的 Python 3.11/3.12 環境
python3.11 -m venv .venv-trackers
.venv-trackers/bin/python -m pip install -r requirements-tracking-benchmark.txt

# 3. 同一部影片與 Detection Cache 比較三種追蹤器
.venv-trackers/bin/python tools/benchmark_video_tracking.py \
  --video samples/clip.mp4 --detections outputs/benchmark/detections.json \
  --output outputs/benchmark/comparison.json
```

Windows 請改用 `.venv-depthport\\Scripts\\python.exe` 與 `.venv-trackers\\Scripts\\python.exe`。輸入影片必須是合法使用且連續的離線測試片段，最多 1,800 張、每影格 64 個偵測物件，且必須涵蓋完整影片。程式會驗證影片 SHA-256，不允許影片與偵測快取不一致。ByteTrack 需要低信心框，建議先用 `--confidence 0.10` 保留第二階段配對所需的資料。

## 加入人工標註 GT

若要評估 Recall、ID Switch、Fragmentation、分場景的遮擋／交會結果，需要額外提供人工標註的 `depthport.tracking-ground-truth.v1` JSON：

```bash
.venv-trackers/bin/python tools/benchmark_video_tracking.py \
  --video samples/clip.mp4 --detections outputs/benchmark/detections.json \
  --gt samples/clip.gt.json --output outputs/benchmark/scored.json
```

GT 中的 `session_id` 必須為 `video-` 加上 `detections.json` 的 `video_sha256` **前 24 位**；`sampling` 設定為 `dense_video`，影格索引由 **1** 開始。可用 `crossing`、`occlusion`、`fast_motion`、`camera_motion` 標註情境；無法判定的影格用 `evaluated=false`。GT 不完整不能宣稱是整段影片的總體表現。

### 比較原則與限制

- 固定同一影片 SHA-256、解析度、FPS、偵測權重／信心門檻、Detection Cache、GT 與 IoU 評分門檻。
- 追蹤器 `update()` 的 P50／P95 與影片解碼時間分開計算。**不包含前置 YOLO 推論耗時**；BoT-SORT 的 CMC 因使用原始 BGR 影格，其耗時包含在追蹤時間內。
- 上游追蹤器若回傳 `tracker_id=-1`，代表尚未確認的物件；不能編造 Object ID，需列入未確認統計。
- DepthPort 評分器是**自定義 Class-aware IoU 驗收指標**，不冒稱官方 HOTA、IDF1、MOTA；真實影片沒有獨立 GT 時不能聲稱哪個追蹤器比較準。
- 目前不支援 ReID、完整遮擋恢復保證、視覺里程計或世界座標的移動速度估計。

**CI 只有合成影片與假 Roboflow API 的契約測試。實際 Roboflow 套件與模型、GPU、真實影片追蹤精度仍須另外驗證。**

整合的獨立程序請見 [BoT-SORT worker 安裝](tracking-worker.md)。設定 `TRACKING_WORKER_PYTHON` 後，可在現有 NumPy 1 應用環境以 `--methods baseline botsort-worker` 跑比較。worker 限邊長 4096、4 Mi 像素，採 cache 的 FPS（Session 固定 30）。worker 單步延遲包含 PNG、IPC、解碼與關聯，不含啟動與偵測推論。直接 `botsort` 仍保留為另一環境的參考呼叫。
