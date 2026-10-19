# Validation record
[繁體中文](../zh-TW/validation.md) · [Home](../../README.md)

## Promotion/recovery association-cost diagnosis — 2026-10-19

[Method/results](tracking-association-diagnosis.md) · [Frozen capture protocol](../validation/v0.3-association-diagnosis-protocol.json) · [Aggregate record](../validation/v0.3-association-diagnosis.json). Sixteen observed reruns on the same 1,179-frame 8.4.176 caches reproduce exact original predictions, full repeated probe traces and official CLEAR/Identity/HOTA. Promotion costs overlap; the next research target is ByteTrack missed-hypothesis weak-stage low-margin active competition (24 FP, 5 different-prior-GT TP, 5 same-GT TP). This is a diagnostic cohort, not a safe veto or score gain. Preserve weak continuation/defaults; raw matrices/IDs/events remain local. Independent control, long-occlusion and hardware acceptance remain open.

## Controlled new-ID admission study — 2026-10-19

[Method/results](tracking-admission-acceptance.md) · [Frozen protocol](../validation/v0.3-tracking-admission-protocol.json) · [Aggregate record](../validation/v0.3-mot17-admission.json). Rebuilt shared YOLO26n CPU 8.4.176 caches on the previously studied MOT17-09/10 scenes: 1,179 frames, 18,164 pedestrian observations, six profiles per backend, three repeats, 72 runs. Confirmation 3/5 trades fewer FP for more FN and lower combined IDF1/HOTA. Birth-only IoU .5 competition vetoes zero candidates and yields identical canonical predictions. All repeated predictions agree and all 24 sequence/profile traces reconcile official CLEAR counts. No candidate passes the frozen research screen; no default change or independent/long-occlusion acceptance. Source terms and runtime limits are recorded; raw inputs/cases stay local, historical records/releases remain unchanged.



## Public replay documentation example — 2026-10-19

[Actual screenshots and conditions](tracking-replay-example.md) / [curated record](../validation/v0.3-public-replay-example.json): 24 consecutive Pexels frames through genuine V2 depth and the real 24-frame Session tracking API/isolated worker; 3 unretouched UI viewport crops, source/license attributed. This is a 0.959-second illustrative partial-occlusion/crossing example without identity GT, not a new tracking score or long-occlusion acceptance. Reused CUDA runtime differs from the full current requirements; worker timing and replay speed differ from source FPS. Older benchmark and release evidence remains unchanged.

## v0.3.0-alpha.2 packaging — 2026-10-19

Alpha.2 packages the reviewed dependency/Pages changes and version illustrations described below. [Release scope and remaining gates](../releases/0.3.0-alpha.2.md). The reviewed integration commit `09c1f8a` passed [4 application jobs](https://github.com/JShengP/depthport/actions/runs/39211080641), [4 real model API import jobs without weights](https://github.com/JShengP/depthport/actions/runs/39211203960), and [Pages build/deployment](https://github.com/JShengP/depthport/actions/runs/39211229203). Exact packaging-commit checks and download checksums are linked from the Release. No new pretrained inference, physical-camera or tracking-quality acceptance was performed.

## Post-Alpha dependency and visual follow-up — 2026-10-19

[Curated dependency record](../validation/v0.3-dependency-followup.json) records sequential PR #10/#13/#17/#18 validation, actual Pages metadata/deployment, minimum-version local checks and exact-head CI links. The repaired NumPy 1 profile defers SciPy 1.18.x and plyfile 1.1.4; the worker remains isolated. Checks install/import actual APIs without pretrained inference and do not close tracking/hardware/accuracy acceptance.

The new [version overview](../assets/versions-overview.svg) and per-version workflow SVGs are generated schematics with documented provenance, not screenshots or model results. Published Alpha tags/assets remain unchanged; main includes these later documentation/dependency updates.

## v0.3 Alpha integration — 2026-10-19

v0.3 is an **experimental development preview / Alpha pre-release**. [Release scope and remaining gates](../releases/0.3.0-alpha.1.md) · [Roadmap](../../ROADMAP.md)

- PR #7 merged as `b9b95d4`; [main application CI, 4/4](https://github.com/JShengP/depthport/actions/runs/39204293374) and [actual model API compatibility, 4/4](https://github.com/JShengP/depthport/actions/runs/39204293354) passed on Ubuntu/Windows × Python 3.11/3.12. API checks install the explicit CPU model recipe and import all four actual APIs, without weights or inference. This supersedes historical installation limitations only for this CI import scope.
- Prior integration checks: 306 Python tests passed / 6 opt-in skipped; 11 replay-controller and 606 overlay/Session-review tests passed; 264 matched Session keys. Version/documentation packaging checks are recorded separately in Actions and the GitHub Release.
- [Pilot/worker evidence](tracking-worker.md), [2,700-frame expanded study](tracking-expanded-acceptance.md), [1,179-frame parameter study](tracking-parameter-acceptance.md) and [activation-error diagnosis](tracking-error-diagnosis.md) retain their recorded conditions. Fixed caches used Ultralytics 8.4.115; current requirements use 8.4.176, so old tracking scores are not fresh acceptance of the newer detector.
- Long-occlusion/generalisation, physical RTSP, Windows pretrained inference/real worker integration, endurance, NVIDIA WebGL and calibrated measurement remain open. No new pretrained inference or physical-camera run was performed for packaging. Historical GPU results below remain dated evidence. Only public source and curated aggregates are distributed; raw sessions/notes/sequence data stay local.

## v0.2 local GPU validation — 2026-10-17

These v0.2 alpha checks supersede the earlier environment limitations for the items below. The historical v0.1 record is preserved further down. [Machine-readable v0.2 summary](../validation/v0.2-summary.json) · [real-inference screenshot and attribution](../assets/README.md).

- **Environment:** fresh isolated Python 3.12.3 on Ubuntu 24.04; RTX 4090, driver 580.178.04, torch 2.10.0+cu128 / CUDA 12.8; NumPy 1.26.4 and OpenCV 4.11.0.86. The Ubuntu installation wrapper completed, with all four adapter imports passing.
- **Application tests:** 117 passed, 4 optional real-model cases skipped in the default suite. Those **same four real-model cases were then run separately: 4 passed, 0 skipped** using cached genuine checkpoints and a public image. These counts describe separate runs.
- **Real depth inference:** YOLO26 Depth, DA V2 Small, DA3 Small and DA3Metric Large all completed on CUDA. Same-input SHA-256, native units, finite depth arrays, retained raw depth and comparison PLY/NPY ZIP contents were checked.
- **Semantic fusion:** genuine YOLO26n Detect and Segment each returned five objects on the public sample; mask grids, positive-depth subsets and source-frame exports were checked. No model doubles were used in these calls.
- **Real browser / HTTP:** Chrome connected to Uvicorn over loopback HTTP, exercised pixel XYZ inspection, stale/invalid pixel responses, comparison results, ZIP download, semantic display and English/Traditional Chinese. Tested page errors: 0; 390px horizontal overflow: 0. WebGL used **SwiftShader software rendering**, not the NVIDIA display GPU.
- **Regression fixed:** comparison viewers fitted a detached zero-size canvas, shrinking clouds to a few pixels. Attaching cards before camera fitting fixes it; the browser regression failed before and passed after the change.
- **Other checks:** bilingual keys 170 / 82, release manifest/links, real HTTP smoke, static demo and source build passed. DA3's deliberately omitted `pre-commit` and `xformers` remain reported by `pip check`; required inference imports and actual calls passed.

The public input is an upstream example, not a physical IPCam frame. Model load/download times and one-image wall times are **not** an FPS benchmark. Full Windows model installation, physical camera codec/authentication/reconnection, measured camera intrinsics, ground-truth distance accuracy, sustained VRAM/endurance and NVIDIA WebGL rendering remain unverified. No private runtime logs, credentials, model weights, calibration files or raw export bundles are published.

## Historical v0.1 validation — 2026-10-16

The following describes the original v0.1 source snapshot and its earlier test environment; it is not the current v0.2 hardware status.

Checked **2026-10-16**, DepthPort **0.1.0-alpha.1**. This record describes application integration, not model accuracy or production readiness. [Machine-readable summary](../validation/summary.json)

## Executed here

| Check | Observed result | What was actually exercised |
|---|---|---|
| Python test suite | **102 passed, 4 skipped** | Geometry, API, adapter contracts, lifecycle, source archive and security guards; explicit model doubles |
| Four backend switches | PASS with doubles | Same retained image hash, unload/load order, generations, unit metadata, export |
| English / Traditional Chinese | **169 matched keys per language** | Placeholder parity, DOM references, language-priority/storage logic and blocked-storage fallback |
| UI interaction | PASS with explicit TestClient bridge | Both languages, switch without re-inference, retained results, four mock engines, same-frame exports, orbit/zoom/reset |
| Narrow viewport | PASS for both languages | 390px width, no horizontal overflow in the exercised layout |
| JavaScript page errors | 0 in tested paths | Actual renderer: **CANVAS 3D FALLBACK** |
| Real local HTTP server | PASS | Uvicorn + Python client: status/models/about/license/index/static files; no model inference |
| Static-demo build | PASS with `python -S` | Python standard library only; no AI or web service started by builder |
| Public source checks | PASS | Explicit manifest, local Markdown links, common credential/path patterns |
| Syntax | PASS | Python compile, JS parse, Bash parse and workflow YAML parse |

No new pretrained weights were downloaded. The current environment is **Linux / Python 3.13.5 / torch 2.10.0+cpu / NumPy 2.3.5 / OpenCV 4.13.0.92**. It is **not** the requested clean target profile. Screenshots in `docs/assets/` show the actual UI with explicitly synthetic data.

## Not validated

**Real model inference:** all four optional pytest integration cases were skipped. A real `check_env.py --all` failed imports because `ultralytics`, `transformers` and `depth_anything_3` are absent. Fake API/tensor tests are not replacements for these models.

**Target installation:** Windows batch execution, fresh Python 3.10–3.12 installation and the complete four-runtime dependency resolution were not run. YAML parsing is not a GitHub Actions run. The configured matrix has not executed remotely.

**GPU, RTSP and measurement:** CUDA, MPS, WebGL GPU shaders, VRAM, actual FPS, physical camera codecs/authentication/reconnection, long-running operation and ground-truth accuracy remain untested.

**Browser HTTP end-to-end:** an actual static localhost navigation was attempted, but Chromium returned `ERR_BLOCKED_BY_ADMINISTRATOR`. The environment policy was not changed or bypassed. The UI was tested separately with inline assets and an explicit TestClient bridge. This does not establish browser→HTTP→AI end-to-end success or live browser persistence across a network reload.

**Publishing and rights:** no GitHub repository was created, no source pushed, no pre-release published and no Pages deployment performed. Manifest checks are not a full secret/history scan, copyright clearance or a security audit.

## Next validation gate

Follow the installation guide in a new target environment; run `check_env.py --all --image camera.jpg` on authorized data. Record each real backend result separately. Then test the actual browser connection, GPU, RTSP reconnection and long-run behavior. Use measured truth before claiming metric distance accuracy.
