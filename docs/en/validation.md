# Validation record
[繁體中文](../zh-TW/validation.md) · [Home](../../README.md)

## v0.2 local GPU validation — 2026-10-17

This development-branch check supersedes the earlier environment limitations for the items below. The historical v0.1 record is preserved further down. [Machine-readable v0.2 summary](../validation/v0.2-summary.json) · [real-inference screenshot and attribution](../assets/README.md).

- **Environment:** fresh isolated Python 3.12.3 on Ubuntu 24.04; RTX 4090, driver 580.178.04, torch 2.10.0+cu128 / CUDA 12.8; NumPy 1.26.4 and OpenCV 4.11.0.86. The Ubuntu installation wrapper completed, with all four adapter imports passing.
- **Application tests:** 117 passed, 4 optional real-model cases skipped in the default suite. Those **same four real-model cases were then run separately: 4 passed, 0 skipped** using cached genuine checkpoints and a public image. These counts describe separate runs.
- **Real depth inference:** YOLO26 Depth, DA V2 Small, DA3 Small and DA3Metric Large all completed on CUDA. Same-input SHA-256, native units, finite depth arrays, retained raw depth and comparison PLY/NPY ZIP contents were checked.
- **Semantic fusion:** genuine YOLO26n Detect and Segment each returned five objects on the public sample; mask grids, positive-depth subsets and source-frame exports were checked. No model doubles were used in these calls.
- **Real browser / HTTP:** Chrome connected to Uvicorn over loopback HTTP, exercised pixel XYZ inspection, stale/invalid pixel responses, comparison results, ZIP download, semantic display and English/Traditional Chinese. Tested page errors: 0; 390px horizontal overflow: 0. WebGL used **SwiftShader software rendering**, not the NVIDIA display GPU.
- **Regression fixed:** comparison viewers fitted a detached zero-size canvas, shrinking clouds to a few pixels. Attaching cards before camera fitting fixes it; the browser regression failed before and passed after the change.
- **Other checks:** bilingual keys 170 / 82, release manifest/links, real HTTP smoke, static demo and source build passed. DA3's deliberately omitted `pre-commit` and `xformers` remain reported by `pip check`; required inference imports and actual calls passed.

The public input is an upstream example, not a physical IPCam frame. Model load/download times and one-image wall times are **not** an FPS benchmark. Windows, physical camera codec/authentication/reconnection, measured camera intrinsics, ground-truth distance accuracy, sustained VRAM/endurance and NVIDIA WebGL rendering remain unverified. No private runtime logs, credentials, model weights, calibration files or raw export bundles are published.

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
