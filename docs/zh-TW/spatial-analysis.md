# Spatial Analysis v0.2 — 空間分析實作與驗證

[English](../en/spatial-analysis.md) · [首頁](../../README.zh-TW.md)

**2026-10-17 更新：** 已在單台 Ubuntu／RTX 4090 完成四套真深度模型 CUDA 推論、YOLO 偵測／分割及真正瀏覽器 HTTP smoke test。FakeEngine 確定性測試仍是另一層證據；實體 RTSP、Windows 與真值測距精度尚待驗證。見[驗證紀錄](validation.md)。

**狀態：實驗性 `v0.2.0-alpha.1` 開發分支，非正式測距系統。** 自動測試採明示 FakeEngine，不等於已驗證真實預訓練模型、CUDA、IP Camera 或深度精度。

啟動 DepthPort 後進入 `/spatial`。此頁與原本的 `/` 共用單一來源與模型，不會取代四模型、RTSP、英文／繁體中文或原本的資料匯出。

## 架構與資料流

```text
RGB／RTSP 最新影格 → 原本單一模型工作執行緒 → DepthResult
                               ├→ Pixel Inspector（像素、RGB、Depth、XYZ）
                               ├→ 候選平面／尺度參考／誤差驗證
                               ├→ 四模型依序執行 → 深度圖、點雲、直方圖、延遲
                               └→ 另載入 YOLO Detect／Segment → Mask／ROI → 3D 物件點
                                                   ↓
                                    同影格 spatial_analysis.json
```

比較功能只接受**已保留的單張圖片**，用同一份影像 SHA-256 依序執行最多四模型；語意融合對當下最後一張已推論影格執行一次。工作佇列共用原本的單一 worker，分析時先卸載深度模型、完成後再載入；**RTSP 更新可能暫停**。來源或模型改變會清除過時分析結果。這不是四 GPU 同步 Benchmark。

## 1. Depth / Point Inspector

點擊已對齊的 RGB／Depth 圖，由 `/api/spatial/inspect?u=...&v=...&frame_id=N` 取得原始深度、實際用於點雲的深度、RGB、**相機座標 X 向右、Y 向下、Z 向前**及顯示用 **Y 向上、Z 為負**、相機內參、模型、單位、frame ID。影格過期回傳 **409**，不合法像素回傳 **422**；RTSP 快速更新時需要重新選點。沒有補捏造的深度。

## 2. Multi-Model Comparison

`POST /api/spatial/compare` 啟動；`GET /api/spatial/compare/status` 查詢進度與每個模型的實際錯誤；`GET /api/spatial/compare/results` 查詢縮圖與精簡點雲；`GET /api/spatial/compare/export.zip` 輸出各模型 `depth.npy`、`raw_depth.npy`、`pointcloud.ply`、RGB、metadata 與整體比較紀錄。

直方圖各自以第 2～98 百分位正規化，**只做分布形狀展示，不改真實匯出值，也不能拿不同深度單位做絕對距離比較**。時間分開列出模型載入與 adapter＋點雲流程，不包含相機解碼、傳輸或瀏覽器繪製，也不能直接當公平 FPS 排名。模型沒有安裝時顯示錯誤，絕不使用假深度冒充成功。

## 3. 2D-to-3D Semantic Fusion

`POST /api/spatial/semantic` 支援 `mode=segment|detect`、`confidence`，再查詢 status/result。額外使用 **Ultralytics YOLO26n Segment (`yolo26n-seg.pt`) 或 Detect (`yolo26n.pt`)**，不是 YOLO26 Depth 自動兼有辨識。首次可能下載權重。實例分割以對齊遮罩提取點集合；偵測模式以方框 ROI 提取，會包含背景，明確標示近似。分割模式若遮罩尺寸與深度不符、或缺 Mask，**直接報錯，不回退成方框**。保留深度來源原本的單位；沒有補出遮蔽物背面、跨影格追蹤或已驗證的 3D 盒子。

此版**由使用者手動觸發單影格**語意融合，不是 RTSP 每影格同時執行 YOLO；避免多模型持續佔用 GPU。

## 4. 相機標定、候選平面與誤差量測

1. 使用同一 IP Camera／鏡頭／焦段／原始解析度，拍攝至少八張不同角度的真實棋盤格圖片（例如橫向 9、直向 6 個**內角點**）。

   ```bash
   python tools/calibrate_camera.py --images 'calib/*.jpg' --corners-x 9 --corners-y 6 --square-mm 25 --output camera_intrinsics.json
   ```

2. 在**本地** `.env` 設定 `CAMERA_INTRINSICS_FILE=camera_intrinsics.json` 後重啟。OpenCV 重投影 RMS（像素）不是深度模型的測距精度；魚眼鏡頭不支援，校正黑邊需另行處理。
3. 在同一張圖點 A、B 並輸入現場真實距離，使用 `/api/spatial/calibration/scale`。只有**估計公尺模型＋實測相機內參**才接受尺度參考；僅適用於目前 frame，不會偷偷改變原始 PLY／NPY。V2 虛擬 1～5 與 DA3-Small 相對深度不能靠任意單組參考點直接變成公尺。
4. 另選**不同的**參考點對進行 `/api/spatial/calibration/validate`，記錄估計距離與真值的 signed／absolute／relative error，多次驗證可計算樣本 MAE。`uncertainty_m` 仍為 `null`，因為少量校正點無法推論普遍信賴區間或安全規格。
5. 在可能是地板的 ROI 使用 `/api/spatial/calibration/plane`。RANSAC＋SVD 取得**候選**平面及模型單位下的殘差，必須人工確認為地面；不能單靠平面擬合殘差宣稱實際距離精度。

`/api/spatial/report.json` 提供目前影格分析紀錄；原本 `/api/export.zip` 也加入同影格的 `spatial_analysis.json`。保留原始深度、處理後深度、PLY、RGB 與模型 metadata。標定資料不跨影格永久有效。

## 驗收

```bash
python -m pytest -q
node --check static/spatial.js
node tests/test_spatial_i18n.cjs
python tools/check_release.py
python tools/http_smoke.py
# 可選：明示假模型的 Chromium UI 測試（需 Playwright／瀏覽器）
python tools/spatial_browser_smoke.py
```

新增測試涵蓋 XYZ 計算、無效或過期點、原始深度保留、直方圖展示正規化、Mask 對齊及 Detect 背景警示、平面 RANSAC、尺度參考與不同點對驗證、四模型來源 SHA-256、比較匯出、語意模型失敗不替代假結果，以及 API。一切 FakeEngine PASS 不等於真模型驗證。

**正式部署前**仍須在乾淨 Windows／Ubuntu 執行四套真模型與 YOLO 語意模型，記錄模型權重 SHA-256、驅動／CUDA／Runtime、推論／端到端延遲與 VRAM，並利用真實測距設備於近、中、遠距離進行獨立驗證。RTSP 需測認證、H.264／H.265、長時穩定、斷線恢復；正式網路服務仍需加上登入與授權，不能直接開放匿名外網存取。

上游參考：[Ultralytics Segmentation](https://docs.ultralytics.com/tasks/segment)、[Detection](https://docs.ultralytics.com/tasks/detect)、[Depth](https://docs.ultralytics.com/tasks/depth)。另參考[深度模型與座標](models-and-geometry.md)及[效能量測](benchmarking.md)。
