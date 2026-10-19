# Documentation screenshots / 文件截圖

`preview.en.png` and `preview.zh-TW.png` show the original viewer's explicitly synthetic demonstration. They are not pretrained inference results.

`spatial-preview.en.png` and `spatial-preview.zh-TW.png` show DepthPort v0.2 with **real pretrained CUDA inference**: four sequential depth engines and YOLO26n instance segmentation on the same public example image. The screenshots were captured through a real local HTTP server on 2026-10-17. They are neither a physical IP-camera capture nor evidence of measured depth accuracy. The input is public, and no local credentials or workstation paths appear in these views.

原檢視器截圖使用明示的合成示範；空間分析截圖則是公開範例圖的真模型 GPU 推論。兩者不可混為同一種驗證證據；畫面不代表實體相機或測距精度已驗證。

## Upstream example attribution / 範例來源

- Image: Ultralytics Assets [`im/bus.jpg`](https://github.com/ultralytics/assets/blob/53d4e2a8fd15f473c29a148c317a8477be559327/im/bus.jpg), copyright retained by its upstream authors; image SHA-256 `c02019c4979c191eb739ddd944445ef408dad5679acab6fd520ef9d434bfbc63`.
- The upstream repository supplies [AGPL-3.0](https://github.com/ultralytics/assets/blob/53d4e2a8fd15f473c29a148c317a8477be559327/LICENSE). This project retains [its AGPL license](../../LICENSE) and [third-party notices](../../THIRD_PARTY_NOTICES.md). The input photo and its derived predictions are not claimed as an original photograph or a new depth model.
- Depth engines and semantic models remain separately attributed in the third-party notices; their weights are not distributed here.

## MOT17 aggregate plot

`tracking-v03-association.png` is an original aggregate-only plot of [association diagnosis](../validation/v0.3-association-diagnosis.json), built by `tools/plot_association_diagnosis.py`. Promotion/recovery outcomes, diagnostic subsets and frame×hypothesis opportunities are explicitly distinct; no source media, raw cost matrix, event window, individual ID or local path is embedded. [Terms, cost definitions and risks](../en/tracking-association-diagnosis.md). 本圖只呈現彙總；診斷子群組不是控制效果，原矩陣／ID 留本機。

`tracking-v03-admission.png` plots only aggregate FN/FP/IDSW from the [new-ID admission study](../validation/v0.3-mot17-admission.json), using `tools/plot_tracking_admission.py`. It contains no media, GT boxes, individual IDs, case windows or local paths. [Terms, paired comparisons and limitations](../en/tracking-admission-acceptance.md): previously studied training scenes, fresh 8.4.176 detections, no candidate accepted, defaults unchanged. 本圖只呈現彙總計數，不含來源影像或個別軌跡。

`tracking-v03-mot17.png` is an original Matplotlib plot of the numeric [expanded acceptance record](../validation/v0.3-mot17-expanded.json). It contains no source image, GT box, per-frame ID, private runtime data or model output image. The [validation method](../en/tracking-expanded-acceptance.md) identifies the dataset terms, cohorts, denominators and limitations.

`tracking-v03-parameters.png` plots only the numeric [09/10 parameter study](../validation/v0.3-mot17-parameters.json): Recall/IDF1 and all-subject endpoint-state counts for five fixed profiles per backend. No source image or per-frame GT/prediction is embedded. [Terms and interpretation](../en/tracking-parameter-acceptance.md).

`tracking-v03-errors.png` is an original aggregate-only Matplotlib plot of [activation-error diagnosis](../validation/v0.3-tracking-error-diagnosis.json): added/removed IDSW, FP geometry, switch contexts and reference-output status. It contains no input images, exact event locations, object IDs or per-frame traces. Contexts are observational, not causal labels; [method and limits](../en/tracking-error-diagnosis.md).


## Generated version schematics — 2026-10-19

`versions-overview.svg`, `v0.1-workflow.svg`, `v0.2-workflow.svg` and `v0.3-workflow.svg` are original code-generated SVG illustrations of the documented feature generations. They contain mathematical point patterns, colour swatches and generic object rectangles/IDs only. They are not UI screenshots, camera captures, model outputs, tracking traces or accuracy evidence; no source media, session, bookmark or personal data was read. Existing screenshots/plots above retain their separate provenance.

Rebuild using Python's standard library:

```bash
python tools/build_version_visuals.py
```

程式原生 SVG 僅使用數學點、色塊與通用框／ID，標示各版功能與流程；不含私人影像、Session 或備註，也不表示推論／追蹤驗收通過。來源產生器採專案的 AGPL-3.0-only 授權。


## Real v0.3 replay screenshots — 2026-10-19

`tracking-replay-start.zh-TW.jpg`, `tracking-replay-crossing.zh-TW.jpg` and `tracking-replay-later.zh-TW.jpg` are actual browser viewport crops from Alpha.2 code using genuine DA V2 CUDA depth, YOLO26n CPU Detect and the isolated Roboflow BoT-SORT worker. They show source frames 32, 43 and 55 from one 24-frame analysis. IDs and boxes were not edited. These are distinct from the generated version schematics and prior synthetic previews.

Underlying footage: **Lukas Kosc via Pexels**, [Urban Street Scene with People Crossing](https://www.pexels.com/video/urban-street-scene-with-people-crossing-34597902/), page ID 34597902. [Pexels License](https://www.pexels.com/license/) / [Terms §5–6](https://www.pexels.com/terms-of-service/), reviewed 2026-10-19. Selected frames are combined with application UI, real tracking overlays and explanatory documentation; this is not standalone redistribution of the original MP4. The footage retains its Pexels terms and is **not relicensed by the application's AGPL**. No endorsement or affiliation is implied. Trademarks, depicted content and other third-party rights retain their own protections; the media is not a blanket commercial clearance.

[Walkthrough, exact conditions and limits](../en/tracking-replay-example.md) · [繁體中文](../zh-TW/tracking-replay-example.md) · [Hashes and curated evidence](../validation/v0.3-public-replay-example.json). No original video, full Session archive, notes, model weights or raw tracking report is distributed. Missing/new observations are shown without claiming a confirmed ID switch, accuracy or long-occlusion recovery.

三張為公開影片的真實追蹤回放介面截圖，結合 UI／偵測框／說明後作文件展示；影片原權利與 Pexels 條款保留，不因程式 AGPL 改授權，不暗示人物／商家／作者背書。不散布原片、完整 Session、備註、權重或逐格報告；缺框／新 ID 不等於真值確認的換 ID。

## Recovery-deferral aggregate figure — 2026-10-19

`tracking-v03-recovery.png` is generated by `tools/plot_tracking_recovery.py` from the [reviewed numeric MOT20-01 record](../validation/v0.3-recovery-deferral.json). It contains no source image, GT boxes, event locations, identifiers or raw matrices. Source: MOTChallenge / Dendorfer et al., [MOT20](https://arxiv.org/abs/2003.09003), [official terms](https://motchallenge.net/data/MOT20/), [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/); retain attribution/license for this dataset-derived figure/record where applicable. Application AGPL does not relicense source data. [Method and limits](../en/tracking-recovery-acceptance.md).

圖僅顯示彙總計數與百分比分數；保留碎裂增加、低召回及長事件端點缺失，不將研究篩選通過畫成可靠性驗收。原片、GT、逐格 ID／診斷及本機路徑不公開。

## Unchanged moving-camera recovery replication — 2026-10-19

`tracking-v03-recovery-moving.png` is a numeric-only Matplotlib plot of the [MOT17-11/13 replication](../validation/v0.3-recovery-moving.json), generated by `tools/plot_tracking_recovery_replication.py`. No source imagery, GT boxes, event positions or raw IDs are embedded. Attribution: MOTChallenge / Milan, Leal-Taixé, Reid, Roth and Schindler, [MOT16](https://arxiv.org/abs/1603.00831); [official terms](https://motchallenge.net/data/MOT17/), [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/). Retain attribution/applicable dataset license for this derived figure/record; application AGPL does not relicense inputs. [Method and failure limits](../en/tracking-recovery-moving.md).

數值圖保留公車 HOTA 退步、零新增 FN／換 ID 與長事件未改善；不是原片、畫面或物理遮擋驗收，原始診斷留本機。

## Recovery state/association-history aggregates — 2026-10-19

`tracking-v03-recovery-history.png` is generated from the [reviewed history diagnosis](../validation/v0.3-recovery-history.json) by `tools/plot_tracking_recovery_history.py`. It contains only aggregate miss/state counts, HOTA threshold deltas and competitor occupancy; no source images, GT boxes, exact event locations, observation bridges or raw IDs. Source: MOTChallenge / [MOT16](https://arxiv.org/abs/1603.00831) and [MOT20](https://arxiv.org/abs/2003.09003), applicable [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/); retain attribution/data-license terms. Application AGPL does not relicense dataset inputs. [Method/limits](../en/tracking-recovery-history.md).

數值圖不是新驗收分數或物理因果證明；原始影像、GT、逐格 ID、矩陣與橋接留本機。

`tracking-v03-exclusive-competition.png` is generated by `tools/plot_tracking_exclusive.py` from [reviewed numeric results](../validation/v0.3-exclusive-competition.json). It contains only four-arm error/HOTA/veto aggregates, no source images, GT boxes or exact frame/ID locations. Source: MOTChallenge / [MOT16](https://arxiv.org/abs/1603.00831), [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/), local non-commercial research; retain attribution/data terms. Application AGPL does not relicense dataset inputs. [Method/limits](../en/tracking-exclusive-competition.md).

`tracking-v03-exposure-selection.png` is generated by `tools/plot_tracking_exposure.py` from the complete [discovery](../validation/v0.3-exposure-discovery.json) and [reserved confirmation](../validation/v0.3-exposure-confirmation.json) ledgers. Cells show reference candidate counts and own-history actual vetoes, including all zeros; no source images, GT, exact event frames or IDs. Source: MOTChallenge / [MOT16](https://arxiv.org/abs/1603.00831) and [MOT20](https://arxiv.org/abs/2003.09003), applicable [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/); local non-commercial inputs, retain attribution/terms. No accuracy or independent exposure acceptance. The earlier exclusive-control figure also corrects its new-scene wording to fresh-cache wording; underlying results unchanged. [Method/limits](../en/tracking-exposure-selection.md).

## Frozen KITTI past-support control figure — 2026-10-19

`tracking-v03-past-support.png` is generated by `tools/plot_tracking_past_support.py` from reviewed `docs/validation/v0.3-past-support.json`. It shows actual vetoes, reference qualification and per-scene count/score deltas; all zeros retained. Numeric aggregate only, no original KITTI pixels, GT identities, boxes, traces or private sessions. Four KITTI training sources 0000–0003 / 978 original frames, four arms × three repeats; zero exposure is not acceptance. Source: Geiger/Lenz/Urtasun, CVPR 2012, KITTI CC BY-NC-SA 3.0; [terms and full limitations](../en/tracking-past-support.md). Original media/raw results stay local; this chart is not an application screenshot or validated physical-identity example.

## Same-rule GT-free exposure figure — 2026-10-19

`tracking-v03-past-exposure.png` comes from `tools/plot_tracking_past_exposure.py` using the reviewed `docs/validation/v0.3-past-exposure-discovery.json` and `v0.3-past-exposure-confirmation.json`. It retains all 16 seen discovery sources and both new reserved sources, actual own-history vetoes and deterministic first-by-order choices. Numeric aggregates only; no frames, GT, IDs, per-frame locations or private sessions. Source attribution: MOTChallenge/MOT16/MOT20 and KITTI/Geiger-Lenz-Urtasun, CC BY-NC-SA 3.0, local noncommercial research. [Terms and limits](../en/tracking-past-exposure.md). Zero reserved exposure fails replication and is not quality/identity acceptance; this is not an application screenshot.

## Exposure-gap applicability partitions — 2026-10-19

`tracking-v03-exposure-gap.png` is generated by `tools/plot_tracking_exposure_gap.py` from reviewed `docs/validation/v0.3-exposure-gap.json`. Four reference-history conditional partitions distinguish weak-input missed rows, accepted opportunities, active competition, past unknown/ineligible evidence and protection outcomes. Zero denominators are marked not reached. Only numeric counts from all 18 existing sources; no image/GT/ID/row location/matrix or private data, no new tracking/inference. [Definitions, source terms and limits](../en/tracking-exposure-gap.md). This is not a screenshot or tracking-accuracy result; all four own-history results are retained in JSON.
