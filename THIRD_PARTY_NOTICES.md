# Third-party notices / 第三方聲明

This is a source-only application release. It does not ship model weights, CUDA libraries, fonts, or a vendored copy of an upstream model repository. Installed runtime packages retain their own notices and licenses. This file is a curated inventory, **not** a complete transitive SBOM or a legal clearance certificate.

本版只發布應用原始碼，不附模型權重、CUDA 函式庫、字型或上游模型 repo 複本。安裝套件保留各自授權。此處是人工整理的來源清單，**不是完整遞迴 SBOM 或法律合規證明**。

| Component / 組件 | Use / 用途 | License / 授權 | Primary reference / 原始來源 |
|---|---|---|---|
| Ultralytics / YOLO26 Depth | Optional Python inference adapter | AGPL-3.0; separate Enterprise option | [License](https://www.ultralytics.com/license), [Depth API](https://docs.ultralytics.com/tasks/depth/) |
| Depth Anything V2 Small HF | Relative-depth checkpoint | Apache-2.0 for the selected Small checkpoint | [Model card](https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf), [authors' repository](https://github.com/DepthAnything/Depth-Anything-V2) |
| Transformers / Hugging Face Hub | V2 runtime / model acquisition | Apache-2.0 | [Transformers](https://github.com/huggingface/transformers), [Hub](https://github.com/huggingface/huggingface_hub) |
| Depth Anything 3 code | Optional DA3 runtime | Apache-2.0 code | [Repository](https://github.com/ByteDance-Seed/Depth-Anything-3) |
| DA3-SMALL / DA3METRIC-LARGE | Selected DA3 weights | Apache-2.0 on these model cards | [Small](https://huggingface.co/depth-anything/DA3-SMALL), [Metric](https://huggingface.co/depth-anything/DA3METRIC-LARGE) |
| PyTorch / torchvision | Tensor runtime | BSD-style; preserve installed notices | [PyTorch license](https://github.com/pytorch/pytorch/blob/main/LICENSE), [torchvision](https://github.com/pytorch/vision/blob/main/LICENSE) |
| FastAPI / Starlette / Uvicorn | Web service | MIT / BSD-3-Clause / BSD-3-Clause | [FastAPI](https://github.com/fastapi/fastapi), [Starlette](https://github.com/encode/starlette), [Uvicorn](https://github.com/encode/uvicorn) |
| NumPy / OpenCV / Pillow | Geometry / decoding / image handling | BSD-3-Clause / Apache-2.0 for OpenCV 4.11 / HPND | [NumPy](https://github.com/numpy/numpy), [OpenCV](https://github.com/opencv/opencv), [Pillow](https://github.com/python-pillow/Pillow) |

## Adaptation provenance / 改寫來源

The DA3 adapter in `depthport/engines.py` follows the upstream `DepthAnything3` API flow and overrides its forward/autocast selection to allow explicit CPU FP32 or CUDA precision. It is an application-side adaptation of the [reference API](https://github.com/ByteDance-Seed/Depth-Anything-3/blob/3d835ec/src/depth_anything_3/api.py); upstream copyright remains with the original authors. A copy of Apache-2.0 is included in [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt). The model structure and weights are not rewritten or claimed as original work.

DA3 adapter 參考原廠 API，僅在應用側調整 forward／autocast 精度選擇；保留上游權利與來源聲明，不宣稱模型結構或權重為本專案原創。

V2 uses the official Transformers API. The virtual 1–5 mapping is DepthPort's demonstration policy, **not** an upstream promise of metric geometry. Selected model cards must not be generalized to other sizes: some other DA3 and V2 weights have non-commercial licenses.

V2 虛擬映射是本程式的展示策略，不是上游的公尺幾何保證。其他模型尺寸可能有非商用限制，不可直接套用本表。

## Distribution boundary / 散布範圍

The application's AGPL license does not remove third-party obligations, guarantee employer/IP clearance or grant model trademarks. Obtain permissions for your source contributions and images before publication. For binary/container/hosted distribution, inventory the actual installed versions, bundled libraries and their corresponding-source obligations. A source-download endpoint and this table are helpful mechanisms, not an automatic legal determination. No blanket “commercial use forbidden” claim is made about AGPL; consult the actual terms and the selected upstream licensing route.

AGPL 不會消除第三方義務，也不代表已取得雇主／智慧財產權核准或模型商標授權。發布前確認程式與圖片的權利。散布容器、二進位或提供服務時，需依實際套件與函式庫版本檢查 notices 與 corresponding-source 義務；原始碼下載入口與本表不會自動完成法律判斷。AGPL 不等於禁止商用，仍應閱讀實際條款與所選上游授權路線。

## Documentation image attribution / 文件圖像來源

Spatial Analysis screenshots use the public Ultralytics Assets bus example and real pretrained predictions. Source, image hash, upstream license and the synthetic/real distinction are recorded in [documentation screenshot provenance](docs/assets/README.md).

空間分析截圖使用上游公開範例及真模型輸出；來源、雜湊、授權與合成／真推論區別見上述紀錄。

## Optional tracking worker / 選配追蹤 worker

[Roboflow Trackers](https://github.com/roboflow/trackers) 2.6.1 and [Supervision](https://github.com/roboflow/supervision) 0.27.0 are installed separately under their Apache-2.0 terms, using public APIs without vendoring their code. NumPy 2.2.6 and OpenCV 4.11 follow the notices above. No package, model weight, video or annotation is included in the source archive. The public-sequence pilot and dataset conditions are recorded in [worker validation](docs/en/tracking-worker.md).

追蹤套件獨立安裝並保留各自 Apache-2.0 聲明；原始碼封裝不含套件、權重、影片或標註。公開序列來源、條件與驗證範圍見上述文件。

## Expanded MOT17 research evidence / MOT17 擴大研究證據

Attribution: MOTChallenge contributors, [MOT17/MOT16 annotations](https://motchallenge.net/data/MOT17/), [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) and applicable original-source conditions. The 04, 11 and 13 training-sequence compressed videos and GT are used for local non-commercial research, not redistributed. Only aggregate evaluation records and a chart of those aggregates are published. No image, per-frame box/ID, event window, weight or upstream package is bundled. [Method and limitations](docs/en/tracking-expanded-acceptance.md).

來源為 MOTChallenge MOT17／MOT16 標註；依條款本機非商用研究，未散布影片、GT、逐格結果或抽查影像，程式授權不會取代資料集條款。

The new-group parameter study additionally uses MOT17-09/10 under the same MOTChallenge CC BY-NC-SA 3.0 / original-source terms for local non-commercial research. Attribution and [method](docs/en/tracking-parameter-acceptance.md) are retained; only aggregate records and an aggregate chart are published, with no dataset media, GT or per-frame results.

另一組參數驗證使用 MOT17-09／10，同樣依上述條款本機非商用研究並保留來源，不散布資料集影像、GT 或逐格結果。

The [activation-error diagnosis](docs/en/tracking-error-diagnosis.md) reuses the same MOT17-09/10 local non-commercial inputs under the preceding terms. Its own diagnostic matching is checked against unmodified pinned TrackEval CLEAR; no upstream package/code archive or dataset imagery is bundled. Only aggregate counts and qualified semantic observations are published; raw traces and review images stay local.

啟用門檻錯誤診斷沿用相同資料條款與來源，官方評估器獨立核對，未封裝上游套件或資料集影像，原始逐格診斷及檢查影像留在本機。


## Public replay documentation footage / 公開回放文件素材

Three v0.3 screenshots use selected frames by **Lukas Kosc via Pexels**, [page 34597902](https://www.pexels.com/video/urban-street-scene-with-people-crossing-34597902/), combined with actual DepthPort UI, model overlays and explanation. The underlying footage retains the [Pexels License](https://www.pexels.com/license/) and [Terms](https://www.pexels.com/terms-of-service/), reviewed 2026-10-19; it is not relicensed as AGPL. Standalone redistribution and misleading endorsement restrictions remain applicable. No original MP4 is bundled, and no affiliation/endorsement is implied. [Provenance and exact scope](docs/assets/README.md) · [Example](docs/en/tracking-replay-example.md).

v0.3 回放文件使用 Lukas Kosc／Pexels 公開影片的選定影格，結合真實 UI、疊圖與說明；素材保留自身條款、不改授權 AGPL，不散布原片或暗示背書。此素材與僅發布彙總的 MOTChallenge 研究分開處理。


## Saved real AI Pages packs / 真實 AI Pages 資料包

The added four-engine arrays/point subsets and new 24-frame replay artworks are documented in [real AI Pages provenance](docs/en/real-ai-pages.md). Pexels terms were reviewed again on 2026-10-20; 24 short-sequence analytical documentation artworks combine actual annotations, legends and attribution. No original MP4 or standalone source-frame sequence is included. Pexels footage is not AGPL; no endorsement is implied. The three older screenshots and historical counts remain separate. All model weights and full local exports stay local.
