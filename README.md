<div align="center">

# DepthPort
### Monocular depth & point cloud workbench

**One camera. Four depth engines. A new perspective.**

English · [繁體中文](README.zh-TW.md)

**v0.3 Alpha** · **Experimental development preview** · **Local-first** · **English / 繁體中文** · **AGPL-3.0-only**

</div>

**Download v0.3.0-alpha.2:** [Release notes & downloads](https://github.com/JShengP/depthport/releases/tag/v0.3.0-alpha.2) · [Source ZIP](https://github.com/JShengP/depthport/releases/download/v0.3.0-alpha.2/depthport-0.3.0-alpha.2-source.zip) · [SHA-256 checksums](https://github.com/JShengP/depthport/releases/download/v0.3.0-alpha.2/SHA256SUMS.txt)

Previous v0.3 package: [v0.3.0-alpha.1](https://github.com/JShengP/depthport/releases/tag/v0.3.0-alpha.1). Earlier generation: [v0.2 Alpha — Spatial Analysis](https://github.com/JShengP/depthport/releases/tag/v0.2.0-alpha.1). See the [Changelog](CHANGELOG.md) and [remaining acceptance roadmap](ROADMAP.md).

The download contains public source only; Python dependencies and pretrained model weights must be installed separately.

Alpha.2 includes the reviewed Pages/FastAPI/Hub/DA3 compatibility updates and version workflow illustrations. It adds no new inference or hardware acceptance; published packages stay fixed at their version tags and release checksums.

## Version guide / 版本導覽

![v0.1, v0.2 and v0.3 capabilities using generated schematic data](docs/assets/versions-overview.svg)

*Illustrative workflows, not UI screenshots, inference results or benchmark evidence. Version READMEs below describe exact contents, architecture and validation boundaries.*

Each generation retains the previous foundation. Read the version-specific README for its changes, architecture, contents and validation limits:

- **[v0.1 — Viewer](docs/versions/v0.1/README.md):** image/RTSP → four depth engines → single-view point cloud and exports.
- **[v0.2 — Spatial Analysis](docs/versions/v0.2/README.md):** adds pixel XYZ, engine comparison, semantic fusion and calibration/error tools.
- **[v0.3 — Sessions & Tracking](docs/versions/v0.3/README.md):** adds manual local archives, replay, Object IDs, isolated BoT-SORT and bookmark review; experimental Alpha.

Historical v0.1/v0.2 source and original READMEs remain fixed at their tags. These maintained guides explain the differences without changing old releases.

Turn RGB images and RTSP camera frames into interactive, **single-view point clouds**. Switch depth engines, inspect visible-surface geometry, and export the data behind the visualization—all in one local web interface.

DepthPort integrates existing pretrained models; it does **not** introduce a new depth network. Its contribution is the model lifecycle, stream handling, explicit depth semantics, aligned geometry, browser interaction and inspectable exports.

![DepthPort English interface with explicitly synthetic viewer data; not an AI inference result](docs/assets/preview.en.png)

*Screenshot: the actual UI showing synthetic test data. No camera or AI model produced this point cloud.*

> **Status:** `v0.3.0-alpha.2` is an **Alpha pre-release / experimental development preview**. Session storage defaults off and requires explicit local enablement. Application/model API installation CI is not pretrained inference or hardware acceptance. Long-occlusion recovery, physical RTSP, Windows pretrained inference/worker integration, endurance and calibrated distance accuracy remain open. Read the [validation record](docs/en/validation.md) and [release notes](docs/releases/0.3.0-alpha.2.md).

## v0.3 — Sessions, Replay & Offline Tracking

- **Manual local Sessions:** preserve same-frame RGB/depth/PLY/raw NPY and integrity-check replay with SHA-256. No automatic recording or model inference on replay.
- **Tracking review:** boxes/Object IDs, playback and speed, timeline seeking, A/B loops, bookmark notes, search/filtering, JSON backup and keyboard help. Notes and exports remain local.
- **Optional Roboflow BoT-SORT:** a separate NumPy 2 worker preserves the NumPy 1 application environment. Simple association remains the default. Object IDs are not identities or world trajectories.

Follow the [Session guide](docs/en/sessions.md): set `ENABLE_SESSION_STORAGE=1` locally, restart, and open `/sessions`. [Worker setup](docs/en/tracking-worker.md) · [Tracking acceptance & evaluation](docs/en/tracking-evaluation.md)

### Tracking evidence and next work

Completed studies cover [2,700 frames / 27 runs across three scenes](docs/en/tracking-expanded-acceptance.md), [1,179 new frames / 60 parameter runs](docs/en/tracking-parameter-acceptance.md), and [added ID-switch/false-positive diagnosis](docs/en/tracking-error-diagnosis.md). Lower activation trades coverage for more ID switches/FP; long-occlusion recovery remains unaccepted. Next tests separate new-track confirmation/competition, detector localisation and recovery. **Defaults stay unchanged.**

Results apply to the named public sequences, fixed detection caches and recorded versions; they do not establish performance with newer dependencies or other scenes. Only aggregates are published, without raw frames, GT, per-frame tracks or user bookmarks.

## Retained from v0.2 — Spatial Analysis Lab

Open **Spatial Analysis** (`/spatial`) on a running local server (`http://127.0.0.1:8000/spatial`): clickable camera-space XYZ / raw depth inspector, sequential four-engine still-image comparison with native-unit histograms and 3D previews, optional YOLO26 Detect/Segment instance-to-point fusion, and pinhole checkerboard calibration / candidate plane fitting / independent metric-error checks. The original viewer, four depth engines, image/RTSP input, exports and bilingual UI remain available. Analysis is a single-worker experimental feature. Real single-image CUDA inference is verified on the recorded Ubuntu host; physical RTSP and distance accuracy remain unverified.

[English implementation & acceptance](docs/en/spatial-analysis.md) · [繁體中文實作與驗收](docs/zh-TW/spatial-analysis.md)

<details>
<summary>View full v0.2 screenshot (real pretrained inference)</summary>

![Spatial Analysis with real pretrained depth comparison and YOLO segmentation](docs/assets/spatial-preview.en.png)

*Real pretrained inference on the public [Ultralytics bus example](https://github.com/ultralytics/assets/blob/53d4e2a8fd15f473c29a148c317a8477be559327/im/bus.jpg); not an IP-camera capture or accuracy benchmark. [Screenshot provenance](docs/assets/README.md).*

</details>

## What you can explore

- **Four selectable engines:** YOLO26 Depth, Depth Anything V2 Small, DA3-Small and DA3Metric-Large. One loaded engine at a time; no backend restart to switch.
- **Images and RTSP:** retain an uploaded image for sequential comparisons, or process the latest camera frame without a growing application queue.
- **Interactive 3D:** orbit, zoom, pan, recolor, adjust point size, and change display-only depth stretch. WebGL with a Canvas2D fallback.
- **Traceable data:** PLY, float32 NPY, raw model output, aligned RGB, model identifiers and unit metadata in a same-frame ZIP.

English and Traditional Chinese are available in the top-right language menu. The choice persists in the browser; `?lang=en` or `?lang=zh-TW` explicitly selects a language. It does not affect model state, numeric output or API field names. Upstream diagnostic messages remain in their original language.

## Depth is not one interchangeable unit

| Engine key | Default checkpoint | Geometry in this app |
|---|---|---|
| `yolo26` | `yolo26n-depth.pt` | API-provided estimated meters; field scale is unverified |
| `da2-small` | `depth-anything/Depth-Anything-V2-Small-hf` | **Virtual 1–5 display depth**, derived from relative scores; not meters |
| `da3-small` | `depth-anything/DA3-SMALL` | Raw positive relative depth; not meters |
| `da3-metric` | `depth-anything/DA3METRIC-LARGE` | Estimated meters using processed focal length / 300 |

The app preserves model raw output separately. V2's display mapping is **not physical inversion** and may alter shape/scale between frames. Do not compare its XYZ numerically with metric-model output. [Model and geometry guide](docs/en/models-and-geometry.md) · [Upstream sources and licenses](THIRD_PARTY_NOTICES.md)

## Start locally

Use a **fresh Python 3.11 or 3.12 environment**. Python 3.10 is accepted by the installer, but availability of all optional dependencies must be checked. Do not reuse another project's virtual environment. Weights and Python packages are **not** included in this source repository.

**Windows** — from the extracted/cloned repository:

```bat
RUN_WINDOWS.bat
```

**Ubuntu**:

```bash
bash RUN_UBUNTU.sh
```

Open **http://127.0.0.1:8000/**. First setup creates `.venv-depthport`; first use of each model may download its weights. GPU users should install a compatible CUDA PyTorch/torchvision pair in that environment **before** installing the remaining dependencies.

Upload an image → wait for a real result → choose another engine → **Apply / retry model**. The retained image is automatically reprocessed. For RTSP, enter the camera's actual stream URL; the **Python host**, not the browser, must reach that camera.

[Installation, GPU, partial setup and offline mode](docs/en/installation.md) · [Usage and troubleshooting](docs/en/usage.md)

### Try the viewer without any AI dependency

Only Python's standard library is needed to build and serve the **synthetic static demo**:

```bash
python tools/build_site.py
python -m http.server 8765 --directory _site --bind 127.0.0.1
```

Open **http://127.0.0.1:8765/**. Image inference and RTSP controls are intentionally disabled. The same files can be published to GitHub Pages using the included, manually triggered workflow. This is not a hosted AI service.

## Verify real inference separately

After installation, stop the running app and use your own shareable image:

```powershell
# Windows
.\.venv-depthport\Scripts\python.exe check_env.py --all --image camera.jpg
```

```bash
# Ubuntu
.venv-depthport/bin/python check_env.py --all --image camera.jpg
```

Only a real successful model call prints `REAL_INFERENCE: PASS`. Failure is an error, never synthetic replacement data. PASS means the pipeline ran—not that its distance estimates are accurate. Use `--engine da2-small` to check just V2. Without `--image`, this command checks API imports only.

## Architecture

```mermaid
flowchart LR
    A[RGB image] --> S[Shared source]
    B[RTSP camera] --> C[Latest-frame reader]
    C --> S
    S --> W[Single model worker]
    W --> D[Depth + units + aligned RGB / intrinsics]
    D --> G[Filter and back-project]
    G --> API[FastAPI]
    API --> UI[Local bilingual Web UI]
    API --> E[Same-frame PLY / NPY / ZIP]
```

[Architecture and API contract](docs/en/architecture.md)

## Scope and limitations

This is visible-surface **2.5D**, not 360° scanning, hidden-surface reconstruction, SLAM, temporal fusion or a safety-distance sensor. Fixed-camera frames do not provide a new geometric viewpoint. No tested FPS, VRAM budget or distance accuracy is claimed. [How to record a fair benchmark](docs/en/benchmarking.md)

The app has **one shared source and model**, not per-browser sessions. Default binding is localhost; there is no login, tenant isolation or production security boundary. Do not expose this backend to the Internet. Do not commit credentials, camera images, exports, weights or private calibration. [Security policy](SECURITY.md)

## Develop and contribute

```bash
python -m pip install -r requirements-base.txt -r requirements-test.txt
# Install a suitable torch separately; some adapter-contract tests use real CPU tensors.
python -m pytest -q
node tests/test_i18n.cjs
python tools/check_release.py
```

[Application CI](https://github.com/JShengP/depthport/actions/workflows/ci.yml) runs deterministic model-double/CPU tensor contracts. [Model compatibility CI](https://github.com/JShengP/depthport/actions/workflows/model-compatibility.yml) installs the explicit dependency recipe and imports all four actual APIs. Neither downloads pretrained weights nor runs inference; passing CI is **not hardware or accuracy acceptance**.

[Tracking Acceptance & Evaluation](docs/en/tracking-evaluation.md) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [Release checklist](docs/en/publishing.md)

## License and acknowledgments

DepthPort application code is provided under **AGPL-3.0-only**; see [LICENSE](LICENSE) and [NOTICE](NOTICE). External code and weights retain their own licenses; this project cannot relicense them. Ultralytics offers AGPL and a separate Enterprise route. The selected V2 Small / DA3 Small / DA3Metric checkpoints have Apache-2.0 model cards; other sizes may differ.

Credit belongs to the [Ultralytics](https://docs.ultralytics.com/tasks/depth/), [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) and [Depth Anything 3](https://github.com/ByteDance-Seed/Depth-Anything-3) authors for their models and research. DepthPort is independent and is not endorsed by these projects. See the [third-party notices](THIRD_PARTY_NOTICES.md) before redistribution or commercial integration.
