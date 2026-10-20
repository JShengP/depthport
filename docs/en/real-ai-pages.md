# Real saved AI results for Pages

[English](../en/real-ai-pages.md) · [繁體中文](../zh-TW/real-ai-pages.md)

## Scope / 範圍

The website reads **saved results**, without an API or inference runtime. The same bus pack serves v0.1/v0.2. Historical Alpha releases are unchanged; the bus results were validated after the v0.1 tag. Synthetic exercises remain separate, including `/v0.1/synthetic.html`.

網站僅讀取保存結果，不執行模型或連接後端；v0.1／v0.2 共用同一資料包，歷史 Alpha 不變，合成練習另行標示。

## Bus provenance / 公車來源

The original [Ultralytics bus.jpg](https://github.com/ultralytics/assets/blob/53d4e2a8fd15f473c29a148c317a8477be559327/im/bus.jpg) is reused byte-for-byte (SHA-256 `c02019c4979c191eb739ddd944445ef408dad5679acab6fd520ef9d434bfbc63`). Four original CUDA depth exports, aligned RGB and PLY are reused without inference. See the [original validation](../validation/v0.2-summary.json) and [machine-readable manifest](../../website/data/bus/manifest.json) for source, raw/final result and weight hashes. Full Float32 NPY/PLY stay local. Public JSON contains losslessly gzip/base64 encoded little-endian Float32 arrays and a uniform stride of the original exported PLY (at most 9,000 points). SHA-256 covers decompressed Float32 bytes. No values are recovered from preview colors.

Native outputs retain their meanings: YOLO26 estimated metres; V2 relative nearness, mapped per frame to virtual geometry Z 1–5; DA3 Small relative Z; DA3 Metric canonical focal-300 raw output, converted to estimated metres by the saved focal/300 scale. Depth map selection separates raw model output from final geometry Z. All K matrices use **65° HFOV estimates**, not measured calibration. Camera XYZ uses X right / Y down / Z forward; CloudViewer uses `(X, -Y, -Z)`. Source coordinates map by pixel centres to the nearest saved aligned sample, with no invented interpolation. Different native units cannot be directly compared. No metric accuracy acceptance is claimed.

舊比較匯出包含完整原生深度與 PLY，直接重用；語意匯出缺少遮罩，所以僅重跑 Detect／Segment（Ultralytics 8.4.115、YOLO26n、CPU、imgsz 640、conf 0.25、retina masks）。框、信心值及完整遮罩來源為真正預測，使用原始 720×960 網格的無損 run lengths；切換深度解析度時明確以像素中心近鄰重取樣。Detect 為框 ROI、可能包含背景，Segment 也非真值。物件點雲以同模型最終 Z 與 K 反投影；保留各模型單位，非實測物理尺度。

## Tracking provenance / 追蹤來源

The original 32–55 Session was not found locally (two retained Sessions contain a different interval). The existing three original screenshots remain unchanged; **their 7 IDs / 230 detections / 125 associated / 105 unassociated are historical counts**. The original MP4 was found with SHA-256 `9b77a4264bb59290335184b77c6300ba43aa6642cb65b594550c44359fd57d4b`. A new run reuses exactly source frames **32–55**, 960×540 INTER_AREA, DA V2 Small CUDA FP32 (Transformers 4.57.6), YOLO26n CPU (Ultralytics 8.4.115, conf .25, imgsz 640), Roboflow Trackers 2.6.1 BoT-SORT without ReID. The detector version differs from the old run's 8.4.176. No counts or IDs were forced to match.

New run: **9 IDs, 209 detections, 152 associated, 57 unassociated**. [Manifest](../../website/data/tracking/manifest.json), [frames](../../website/data/tracking/frames.json), [tracks](../../website/data/tracking/tracks.json) preserve every box, confidence, local ID, timestamp, observed frame and saved depth/XYZ statistic. Session index 1/12/24 maps to source 32/43/55. All unassociated detections retain `object_id: null`. No gaps are interpolated or IDs reassigned. `obj-0003` is absent at #9–10, `obj-0005` at #7–19; these are observation gaps, not proven occlusion recovery or identity correctness. XYZ history is uncompensated camera-frame geometry, **not world trajectory or speed**. V2 per-frame normalization prevents interpreting depth trends as physical motion. The sequence is only 0.959s; no long-occlusion, identity GT, IDSW, HOTA or accuracy acceptance follows. Source FPS (23.976), tracker step (30 Hz) and UI replay (5 saved frames/s at 1×) differ.

## Rights and publication boundary / 授權與公開邊界

Bus source: [Ultralytics Assets license at the pinned revision](https://github.com/ultralytics/assets/blob/53d4e2a8fd15f473c29a148c317a8477be559327/LICENSE), AGPL-3.0; model/source notices in [third-party notices](../../THIRD_PARTY_NOTICES.md). Weights are not distributed.

Footage: **Lukas Kosc via Pexels**, [Urban Street Scene with People Crossing #34597902](https://www.pexels.com/video/urban-street-scene-with-people-crossing-34597902/). [Pexels License](https://www.pexels.com/license/) and [Terms of Service](https://www.pexels.com/terms-of-service/) reviewed 2026-10-20 (terms dated 2024-11-15). Section 5 permits adaptation and distinguishes combined creative works from prohibited standalone distribution; section 6 addresses attribution and section 8 prohibits systematic copying. The public scope is **24 analytical documentation artworks**, each combining a short selected frame, actual model annotations, explanatory legend, attribution and limits. This is our application of those terms to this documentation use, not a blanket license for redistributing frames. No original MP4, standalone complete RGB sequence or full Session archive is published. No endorsement, real identity inference or tracking of visitors. Underlying footage remains subject to Pexels terms and other applicable third-party rights, **not relicensed under AGPL**. No model is trained on this clip.

本次公開 24 張組合分析展示畫面，不提供原影片或獨立 RGB 影格序列；每張附真實框／ID、圖例、限制與來源。素材仍受 Pexels／第三方條款約束，不因程式 AGPL 而改授權，也不暗示人物／品牌背書。

Only explicitly reviewed paths in `PUBLIC_FILES.txt` are copied. Native arrays/PLY, raw detector masks, tracking reports, runtime logs, private Sessions, notes/drafts, calibration files, internal paths and weights remain local. The exporter accepts local paths as command arguments but does not embed them in published metadata. Public data contains no camera URLs or credentials. See the [asset catalog](../../website/data/catalog.json) for exact bytes and SHA-256 of every curated public file.

## Reproduce and verify / 重建與驗證

`tools/export_pages_results.py --help` documents explicit local inputs. It verifies both source hashes before reading images and reruns only the missing semantic/replay data. The site builder does not call this tool or import model packages. Browser requires gzip DecompressionStream for exact arrays; unsupported browsers show an explicit error instead of substitute geometry. CloudViewer falls back to software Canvas when WebGL is unavailable. Full test details are recorded in [acceptance](../validation/real-ai-pages.json).

## Browser compatibility / 瀏覽器相容性

[Historical in-app protocol/results / 原內建瀏覽器紀錄](pages-browser-compatibility.md) · [Independent headless follow-up / 獨立無頭補驗](pages-standalone-browsers.md): exact Linux Chrome155 / Edge155 / Firefox157 builds pass B01–B07, including Shift-pan; B08 remains not_run. Combined matrix33 pass /31 not_run; Safari, physical phones, headed/other OS and natural unsupported/fallback paths remain open. 原失敗／工具更正保留，無頭與視窗尺寸結果不代替實機／精度驗收。
