# Documentation screenshots / 文件截圖

`preview.en.png` and `preview.zh-TW.png` show the original viewer's explicitly synthetic demonstration. They are not pretrained inference results.

`spatial-preview.en.png` and `spatial-preview.zh-TW.png` show DepthPort v0.2 with **real pretrained CUDA inference**: four sequential depth engines and YOLO26n instance segmentation on the same public example image. The screenshots were captured through a real local HTTP server on 2026-10-17. They are neither a physical IP-camera capture nor evidence of measured depth accuracy. The input is public, and no local credentials or workstation paths appear in these views.

原檢視器截圖使用明示的合成示範；空間分析截圖則是公開範例圖的真模型 GPU 推論。兩者不可混為同一種驗證證據；畫面不代表實體相機或測距精度已驗證。

## Upstream example attribution / 範例來源

- Image: Ultralytics Assets [`im/bus.jpg`](https://github.com/ultralytics/assets/blob/53d4e2a8fd15f473c29a148c317a8477be559327/im/bus.jpg), copyright retained by its upstream authors; image SHA-256 `c02019c4979c191eb739ddd944445ef408dad5679acab6fd520ef9d434bfbc63`.
- The upstream repository supplies [AGPL-3.0](https://github.com/ultralytics/assets/blob/53d4e2a8fd15f473c29a148c317a8477be559327/LICENSE). This project retains [its AGPL license](../../LICENSE) and [third-party notices](../../THIRD_PARTY_NOTICES.md). The input photo and its derived predictions are not claimed as an original photograph or a new depth model.
- Depth engines and semantic models remain separately attributed in the third-party notices; their weights are not distributed here.
