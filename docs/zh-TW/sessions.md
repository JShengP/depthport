# v0.3 研究版 — 手動 Session 儲存與離線回放
[English](../en/sessions.md) · [首頁](../../README.zh-TW.md)

**狀態：實驗性開發分支，尚未合併／發布，亦未完成真模型與硬體驗收。** v0.2 Spatial Analysis 保留不變；v0.3 新增**手動、選擇啟用、僅本機**的影格封存與回放工具。它**不會**自動錄製 RTSP 影片、以保存資料重新推論，或進行真正的像素追蹤／時序幾何融合。

## 啟用方式

1. 使用 v0.3 開發分支，依原安裝文件準備 DepthPort 環境。
2. 在**本機** `.env` 設定 `ENABLE_SESSION_STORAGE=1`，再重啟伺服器。預設 `0`（關閉）；不可在無登入的公開服務上啟用。
3. 執行 `bash RUN_UBUNTU.sh` 或 `RUN_WINDOWS.bat`，開啟 `http://127.0.0.1:8000/sessions`。建立 Session，並在主頁真模型產生影格後，手動點選 **儲存最新影格**。
4. 選取影格並點選**回放**，即讀回 RGB、深度預覽和抽樣的 XYZRGB 點雲，**不呼叫模型**。下載原本同影格 ZIP，仍可取得 `model_raw_depth.npy`、最終深度 NPY、PLY、相機內參、單位與選配分析報告。

## 資料與限制

- 儲存位置：`outputs/sessions/<UUID4>/session.json` 加上每次的 `frame-00001.zip` 等，**不在 Git、static 或 Pages**。
- 建立 Session 和保存每個影格均需明確操作；不設計背景計時錄影，也不保存原始 RTSP 帳密網址。
- `session.json` 紀錄時間、來源類型、frame ID、模型、原生深度單位、可用時的圖片 Hash、深度摘要與 ZIP SHA-256；不包含串流網址。
- 限制：**每 Session 120 影格／256 MiB**、最多 **20 Session**、單影格 ZIP 最多 **20 MiB**。空間不足時回報錯誤，**不會自動刪除舊資料**。
- 會驗證 ZIP Hash、格式與路徑。儲存檔案使用系統支援的私人檔案權限，應視作包含敏感影像的本機資料。
- 時序摘要只比較同引擎、同深度單位的影格深度中位數，**不是**物件軌跡、跨視角配準、世界座標或經驗證的公尺漂移。

## API（需由本機啟用）

| Method | Route | 功能 |
|---|---|---|
| GET | `/api/sessions/status` | 查詢是否啟用 |
| GET/POST | `/api/sessions` | 列出／建立工作階段 |
| GET | `/api/sessions/{sid}/frames` | 影格索引 |
| POST | `/api/sessions/{sid}/capture` | 手動儲存最後一個已完成影格 |
| GET | `/api/sessions/{sid}/frames/{index}/replay` | 讀回 RGB、深度和點雲供瀏覽 |
| GET | `/api/sessions/{sid}/frames/{index}/bundle.zip` | 原始完整 ZIP |
| GET | `/api/sessions/{sid}/temporal` | 各模型深度摘要曲線資料 |

API 限制本機 loopback 存取；目前沒有多租戶登入、自動保留期刪除、影片錄製器或完整資料庫交易機制。

## 自動測試

```bash
python -m pytest -q tests/test_sessions.py
node tests/test_sessions_i18n.cjs
python tools/check_release.py
```

測試只使用明示的合成固定深度與 FakeEngine。驗證資料完整性、單位、重播點雲格式、容量上限、預設關閉與非本機拒絕；**不能**取代真 AI、RTSP 實機或深度精度測試。
