# v0.3 研究版 — 手動 Session 儲存與離線回放
[English](../en/sessions.md) · [首頁](../../README.zh-TW.md)

**狀態：實驗性開發分支，尚未合併／發布，實體相機驗收仍待完成。** v0.2 Spatial Analysis 保留不變；v0.3 新增**手動、選擇啟用、僅本機**的影格封存與回放工具。它**不會**自動錄製 RTSP 影片或進行位姿補償的像素／3D 追蹤。單純回放不會重新執行深度估計；只有使用者另外按下離線追蹤分析時，才會對已保存的 RGB 影格執行 YOLO Detect／Segment。

**2026-10-17 初步驗證：** 公開影片的 24 影格 Session 流程已通過真 CUDA 深度、CPU YOLO 偵測／分割、完整性與回放；另完成含 Roboflow Trackers 的 179 影格比較。見[條件、結果與限制](tracking-evaluation.md)。這些不代表實體相機或公尺精度驗收。


**2026-10-18：** Session 已支援選配 [Roboflow BoT-SORT worker](tracking-worker.md)，以獨立 NumPy 2 環境執行；預設仍為簡易關聯。

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
| GET | `/api/sessions/{sid}/consistency` | 離線相容影格的像素差分析 |
| GET | `/api/sessions/{sid}/consistency/report.json` | 下載時間深度分析 JSON |

API 限制本機 loopback 存取；目前沒有多租戶登入、自動保留期刪除、影片錄製器或完整資料庫交易機制。

## 自動測試

```bash
python -m pytest -q tests/test_sessions.py
node tests/test_sessions_i18n.cjs
python tools/check_release.py
```

測試只使用明示的合成固定深度與 FakeEngine。驗證資料完整性、單位、重播點雲格式、容量上限、預設關閉與非本機拒絕；**不能**取代真 AI、RTSP 實機或深度精度測試。

## 語意物件追蹤（離線開發功能）

在 `ENABLE_SESSION_STORAGE=1` 的本機模式下，先手動儲存同一 Session 的 2～24 張影格，再於 `/sessions` 選擇 **實例分割**或**方框區域**，按下「分析已存影格」。此功能明確由使用者啟動，**僅在 CPU 上執行 YOLO Detect／Segment**，避免與現有 GPU 深度工作執行緒同時載入另一個模型；第一次執行可能下載 YOLO 權重。原本保存的深度直接讀回，**不會重新執行深度估計、不會自動錄製 RTSP 或上傳資料**。

分析每張 ZIP 都會重新核對 SHA-256，確認 RGB／Depth 大小及相機內參，再把 YOLO 的遮罩或框對應到原本的深度數值。使用同類別、2D IoU 與有限的中心像素位移關聯物件；連續出現者取得 `obj-0001` 等 ID。若來源類型、深度模型、單位、相機幾何或影像解析度改變，ID 將重新分配。遮擋、交錯、漏檢都可能讓 ID 斷裂或切換。**這不是人員身份辨識或 ReID。**

每筆物件紀錄包含 Session 影格索引、原始 Frame ID／時間、2D Bounding Box、Pixel Centroid、類別／信心、原生深度中位數、由相機內參反投影的 **Camera XYZ 中位數**。單純 Detect 的方框會包含背景，不能當成完整物件輪廓。相對深度仍非公尺，估計公尺也**未經真值驗證**。不同影格 Camera XYZ 的變化**不是世界座標軌跡、速度或安全距離**，也沒有相機位姿補償。

工作完成後，只在本地 Session 目錄寫入 `tracking.json`，可於網頁查看及匯出。新增影格後原報告會標記過期，需要重新手動執行。每次最多取最近 24 張已存影格、每張最多 20 個物件；同一時間只執行一項追蹤分析，不會自動刪除既有 Session。

### API（限本機、儲存功能需主動開啟）

| 方法 | 路徑 | 功能 |
|---|---|---|
| POST | `/api/sessions/{sid}/tracking` | 手動開始：`{ "mode": "segment", "confidence": 0.25, "max_frames": 12 }` |
| GET | `/api/sessions/{sid}/tracking/status` | `idle`、`running`、`completed`、`error` |
| GET | `/api/sessions/{sid}/tracking/report.json` | 讀取已存報告，`?download=true` 下載 JSON |

這項功能不強迫安裝新套件，但需要已有的 Ultralytics 套件及額外 YOLO Detect／Segment 權重。缺模型時會明確報錯，不使用假偵測作為成功結果。自動測試使用**明確的假偵測器**，不等於已在實際相機驗證跨影格追蹤。

### Tracking 驗收／Benchmark

用[離線 Tracking 驗收工具](tracking-evaluation.md)將本地 `tracking.json` 與人工 Ground Truth 配對，依遮擋、交會、漏檢等情境統計 Object ID Switch、TP／FP／FN 與 Fragmentation。合成 CI 結果不代表真實影片測試；本功能不會錄影、上傳或重新執行模型。

## 在回放影像檢查追蹤 ID

追蹤完成後，按「**回放已分析影格**」開啟該報告的第一格。對齊 RGB 影像會疊加原始偵測框與「**Object ID · 類別**」標籤；同一個 ID 使用固定顏色，標籤避讓其他標籤時以連線指回原框。可用「**上一格／下一格**」，或直接選擇保存影格回放。目前介面預設分析最後 12 格，因此較早的影格可能尚未分析。

「**疊加追蹤框與 Object ID**」可切換顯示。沒有已確認追蹤偵測的格子不畫框；未分析、缺報告、快照不符或報告過期時只顯示提示，不借用其他影格的 ID。疊圖必須符合 Session、保存序號、Session 總格數與快照 SHA-256，以及模型／單位資訊；即使來源 frame_id 重複，也不會混淆保存影格。切換 Session、重新回放或重跑追蹤時會清除舊疊圖，只有目前選取影格的最新回覆可以顯示。

疊圖使用保存影像的原始像素座標，縮放後仍與影像對齊。回放不重新推論，也不修改 RGB／深度、追蹤報告、原始下載包或幾何資料。遮擋／交會前後的 ID 只能作目視診斷，不代表人的身份或世界座標連續性。瀏覽器驗證使用本機公開序列；截圖、真實影像與逐格標註不放進公開原始碼封裝。

## 連續播放保存影格

先回放一格，或按「**回放已分析影格**」，再使用 RGB 影像上方的「**播放／暫停**」。速度提供 **0.25×、0.5×、1×、2×**，預設 **1× 目標為每秒 5 個保存影格**；這是固定預覽節奏，不是原始影片 FPS，也不代表手動快照之間的實際時間。載入較慢時會放慢，不會為了追上速度而跳格或插補。

自動回放一次只執行一份影格讀取／解碼。下一格尚未就緒時保留上一份完整 RGB／深度／ID，解碼完成後一併更新影像、對應疊圖與點雲。按暫停會停在目前已顯示影格，尚未完成的自動載入不能再切換畫面。調速只影響後續排程，不改變追蹤 ID 或來源時間戳。

手動選格、逐格切換、更換 Session、重新整理、保存影格、建立 Session、重跑追蹤、切到背景分頁或離開頁面都會暫停。播至最後一格會停止；此時再按播放，會從第一個保存影格重播。播放範圍依保存列表，包含追蹤報告以外的影格；那些影格只顯示尚未分析／缺報告提示，不借用其他格子的 ID。回放不會錄影、重新推論或上傳資料。

## 拖曳回放進度條

「**回放進度**」會顯示目前保存影格位置／總格數，並隨播放、暫停、上一格／下一格及影格選單同步。拖曳時先暫停播放，同時顯示目標位置與目前仍在看的影格；放開後才讀取目標，待 RGB／深度解碼完成，再一起更新對應追蹤框、ID 與點雲。載入中或跳轉失敗時，不會把舊影像標成目標影格。

進度依保存順序計算，不是原始影片時間，也不是來源 `frame_id`。範圍涵蓋整個 Session；追蹤報告以外的影格仍顯示未分析／缺報告提示。可用方向鍵與 Home／End 精確移動。沒有影格或只有一格時停用；拖回目前已顯示影格則不重新讀取。

移動滑桿本身不發出回放請求；快速多次放開只會讓最後目標生效。更換 Session、隱藏頁面會取消舊預覽與待顯示結果。跳轉失敗時保留上一份影像、ID 與已完成進度，並回報錯誤。可見讀數與無障礙文字皆提供中英文；回放資料不會上傳或加入公開原始碼封裝。
