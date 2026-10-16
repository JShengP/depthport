# 架構與 API
[English](../en/architecture.md)・[首頁](../../README.zh-TW.md)

`app.py` 是 source checkout 啟動入口；`depthport/api.py` 管理 FastAPI 與共用服務，`capture.py` 保留最新解碼影格；`engines.py`、`v2_engine.py`、`yolo_engine.py` 是模型 adapter；`cloud.py` 處理相機幾何及匯出。`static/` 是無外部 JS 依賴的瀏覽器程式，`i18n.js` 是本地雙語字典。

單一 worker 序列化模型呼叫與卸載／載入，所有瀏覽器共用一個來源與模型。HTTP 只排隊，不在請求 handler 下載權重。來源／模型 generation token 使切換前的結果失效，但不強制中止底層解碼、模型呼叫或網路下載。

| 方法 | 路徑 | 契約 |
|---|---|---|
| GET | `/api/about` | 版本、授權、共用狀態與原始碼入口 |
| GET | `/api/models` | 四預設；偵測到套件不代表真推論成功 |
| POST | `/api/model` | JSON `{"engine":"da2-small"}`；202 表示已排隊 |
| POST | `/api/image` | multipart `file`；JPG／PNG／WEBP，12 MB 上限；202 |
| POST | `/api/reprocess` | 保留圖片重新排隊；202 |
| POST | `/api/source` | JSON `{"url":"rtsp://camera.example.invalid/stream"}`；202 |
| POST | `/api/source/stop` | 清除來源／結果，使舊工作失效 |
| GET | `/api/status` | 模型／來源狀態、錯誤、generation、session |
| GET | `/api/latest?after=N` | 最新完成影格；沒有更新時 204 |
| GET | `/api/export.ply` | 最新 XYZRGB 點雲 |
| GET | `/api/depth.npy` | 幾何實際使用的最終深度 |
| GET | `/api/frame.json` | 不含大型 payload 的 metadata |
| GET | `/api/export.zip` | 同影格原子分析快照 |
| GET | `/api/source-code.zip` | 僅公開清單中的程式，不含 runtime 私人資料 |

點雲每點 16 bytes：XYZ 為 little-endian float32，RGBA 為 uint8，再包成 Base64 JSON 與對齊的 RGB／深度預覽。Polling／Base64 是 PoC 取捨，不是高 FPS 多客戶端協定。

`pipeline_ms` 不含模型載入、RTSP 解碼與網路／瀏覽器傳送；載入另記為 `last_model_load_ms`。YOLO 階段時間、V2 predict wall time 與 DA3 API wall time 範圍不同。`received_to_publish_ms` 自主機完成解碼起算，**不是感光元件曝光起算**。請參考 benchmark 說明。

預設 Host 允許清單、同源寫入檢查與帳密遮蔽只能降低意外暴露，不能辨識使用者。原始碼 ZIP 僅依 `PUBLIC_FILES.txt` 打包，不自動加入 runtime 私人資料；修改程式時需一併維護清單，讓提供的原始碼對應目前執行版本。
