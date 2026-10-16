# 模型契約與幾何
[English](../en/models-and-geometry.md)・[首頁](../../README.zh-TW.md)

## 統一介面

Adapter 回傳對齊 BGR、`depth: float32[H,W]`、`raw_depth`、單位、內參、metadata 與可選 confidence／sky，不捏造缺少的輸出。型號或 shape 不符時報錯。來源與模型 generation ID 避免切換後發布舊請求結果。

| 預設 | 反投影使用的數據 | 重要界線 |
|---|---|---|
| YOLO26 | `result.depth.data` | 保留 API 尺度，不再取倒數、exponentiate 或映射至 1～5 |
| V2 Small | `1 + (1-clip((raw-p5)/(p95-p5),0,1))*4` | raw 較大代表較近；**僅展示映射**，非公尺或物理反演 |
| DA3-Small | 正的原始相對深度 | 不正規化幾何；逐影格百分位只用於上色 |
| DA3Metric | `raw * ((fx_processed+fy_processed)/2) / 300` | 使用處理後網格的像素焦距；拒絕已換算 metric 輸出，避免重複換算 |

V2 近乎等值的輸出會成為虛擬 Z=3 平面，不會憑空生成場景；NaN／Inf 保持無效。p5/p95 飽和與逐影格變化可能造成變形，不能用於跨影格融合或直接與公尺數據比較。ZIP 保留原始、已對齊的分數。

## 內參與對齊

以提供的 pinhole／Brown-Conrady JSON，或明確標記的 HFOV 假設，建立相機射線。標定需對應相同鏡頭、zoom、視野與串流模式。縮放調整 fx／fy／cx／cy；DA3 將完整視野預先 resize 至 14 倍數並核對輸出尺寸，不默默接受意外裁切。DA3 預測 K 若存在，只存為未使用的額外 metadata，不取代共用相機模型。

V2 使用 DPT processor，把深度還原至輸入網格。`DA2_INPUT_SIZE=518` 是參考尺寸，不保證 tensor 為 518×518；請記錄 `network_input_hw`。三系列預設解析度與精度不同，顯示的 wall time 不會自動成為公平 benchmark。

觀看用相機座標：

```text
X = (u - cx) * Z / fx
Y = -(v - cy) * Z / fy
Z_view = -Z
```

不是世界座標或沿視線距離。內參標定決定射線幾何，深度尺度校正處理另一個問題，兩者都不保證距離準確。未實作 fisheye、同長寬比裁切自動辨識，以及去畸變黑邊的有效區域遮罩。

## 過濾與顯示

公尺範圍只作用於估計公尺，相對單位使用另一組範圍。超範圍刪點，不壓到同一平面。信心百分位不是可信機率；只有實際回傳 sky mask 才移除天空。過濾不覆寫原始模型深度。

檢視器自動取景與拉伸不修改 PLY／NPY。匯出記錄單位，同影格 ZIP 擷取伺服器單一完成影格；它可能比瀏覽器目前看到的畫面更新。

原始來源：[YOLO Depth](https://docs.ultralytics.com/tasks/depth/)、[V2 checkpoint](https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf)、[DA3 與 Metric 換算](https://github.com/ByteDance-Seed/Depth-Anything-3)、[DA3-Small](https://huggingface.co/depth-anything/DA3-SMALL)、[DA3Metric-Large](https://huggingface.co/depth-anything/DA3METRIC-LARGE)。
