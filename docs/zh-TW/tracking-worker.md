# v0.3 選配 Roboflow BoT-SORT worker


**2026-10-19 擴大證據：** [三場景 MOT17 比較](tracking-expanded-acceptance.md) 另測直接呼叫 Baseline／ByteTrack／BoT-SORT，與本 worker 初測分開；不代表已通過擴大 worker／RTSP 或長遮擋恢復驗收。
[English](../en/tracking-worker.md) · [工作階段](sessions.md) · [離線比較](offline-video-tracking.md)

目前只在開發分支，v0.3 尚未發布。工作階段預設仍使用「簡易關聯」；可改選 **Roboflow BoT-SORT**，手動離線分析已保存影格中的真實 YOLO Detect／Segment 偵測。兩種後端都不會自動錄影。

## 獨立環境安裝

Roboflow Trackers 2.6.1 需要 NumPy >=2.0.2，現有 DA3 環境需要 NumPy <2。請保留深度模型環境，使用 Python 3.11 或 3.12 另外建立 worker：

```bash
python3 -m venv .venv-tracking
.venv-tracking/bin/python -m pip install -r requirements-tracking-worker.txt
.venv-tracking/bin/python -m pip check
export TRACKING_WORKER_PYTHON="$PWD/.venv-tracking/bin/python"
export ENABLE_SESSION_STORAGE=1
bash RUN_UBUNTU.sh
```

Windows PowerShell：

```powershell
py -3.12 -m venv .venv-tracking
.\.venv-tracking\Scripts\python.exe -m pip install -r requirements-tracking-worker.txt
.\.venv-tracking\Scripts\python.exe -m pip check
$env:TRACKING_WORKER_PYTHON = (Resolve-Path .\.venv-tracking\Scripts\python.exe).Path
$env:ENABLE_SESSION_STORAGE = '1'
.\RUN_WINDOWS.bat
```

也可將 Python 的絕對路徑寫入本機忽略的 `.env`，然後重新啟動。worker 嚴格檢查 trackers 2.6.1、supervision 0.27.0、NumPy 2.2.6 與 opencv-python 4.11.0.86。基本安裝與基本 CI 不會安裝這些選配套件。Trackers、Supervision 保留上游 Apache-2.0 授權；偵測器與模型權重仍適用各自條款。

開啟 `/sessions`，保存至少兩個已完成影格，選 Detect 或 Segment，再選 BoT-SORT 執行分析。未設定 worker 時選項停用；環境已設定但不相容時，工作會明確失敗，不會悄悄改用其他後端。API 沿用追蹤端點，傳入 `{"mode":"segment","backend":"roboflow-botsort","max_frames":12}`；HTTP JSON 不接受執行檔路徑，只能由維護者在本機環境設定。

## 關聯與幾何資料契約

- 主程序使用 CPU 執行真 YOLO，保留原始方框／遮罩、已對齊的保存深度與相機 XYZ。worker 只在 CPU 執行 BoT-SORT，取得完整 BGR 畫面進行 CMC，不載入深度模型，也不含 ReID。
- 每個分析工作建立一個獨立 stdio 子程序，透過 `-I` 啟動，不經 shell，只繼承少量必要 OS 環境值。有限大小 JSONL 傳送 PNG/base64 與類別、分數、方框。子程序不設上傳或監聽端點，也不保存影格檔案。
- 回覆只含**原始偵測索引與 ID**；主程序從原始量測選取結果，不以 Kalman 預測框替代量測，也不在預測位置取深度。尚未確認或被濾除的偵測不會補造 ID。報告包含原始偵測數與 `unassociated_detections` 總數，後者也包含信心值篩選，不只 `tracker_id=-1`。
- 每個類別使用自己的追蹤器；某類消失仍傳空偵測以推進失聯狀態。已保存的來源類型、深度模型、內參、單位或格點改變時重設關聯；同一次分析不重用 ID。ID 只屬於一次分析，不表示人的身份。相同 metadata 下更換相機無法自動識別，應另建 Session。
- Session 每個保存影格固定推進 **1/30 秒**，不模擬手動快照之間的實際時間間隔。CMC 不會讓稀疏快照變成連續影片或世界座標軌跡。追蹤品質應用連續序列驗證，不能解讀成速度或公尺級 3D 精度。
- 限制：Session 每次 2–24 影格、每格最多 20 個偵測；worker 協定最多 64 個偵測、邊長 4096、4 Mi 像素、PNG 12 MiB、請求 20 MiB、回覆 64 KiB。單次交換逾時 30 秒；異常回覆、缺套件、程序死亡或卡住都以固定訊息回報失敗。stderr 捨棄，避免回傳私有路徑或影格資訊。工作完成、失敗、應用關閉與解譯器結束時終止並回收程序。

## 公開序列驗證 — 2026-10-18

[公開彙總紀錄](../validation/v0.3-botsort-worker.json) 保存來源、雜湊、環境版本與結果。本機非商用研究使用官方壓縮 **MOT15 train／TUD-Stadtmitte** MP4 與獨立 GT，依照[資料集 CC-BY-NC-SA-3.0 與原始來源條件](https://motchallenge.net/data/MOT15/)使用；不散布影像、標註、逐格結果、模型權重或本機紀錄。

完整 **179 格、25 fps** 使用同一份真 YOLO26n person 偵測與預設參數，worker 與直接呼叫 Roboflow 2.6.1 產生相同 **982 次觀測**，ID 可一對一對應。TrackEval 結果：**ID switch 7 次、召回率 81.57%、IDF1 81.01%、HOTA 58.11%**。這只是一段短訓練片，且採壓縮 MP4，不是完整原始影格 benchmark，也不是獨立測試集精度。相較簡易關聯，ID 中斷較少但召回較低，不能宣稱普遍優勝。

另以 24 個已保存、真 CUDA DA V2 深度影格跑完整 Detect／Segment Session；每個保留觀測的原始方框、遮罩取深度與 XYZ 必須完全一致。Session 使用另外的實驗診斷，不是官方 TrackEval。實體 RTSP、多場景長遮擋／交會／相機移動人工稽核、Windows 真模型加 worker、長時穩定性、標定公尺 3D 與即時效能仍未驗證。CI 只測合成資料與子程序異常契約，不代表真影片追蹤精度。
