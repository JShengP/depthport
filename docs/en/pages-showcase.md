# Multi-version static Pages showcase

[繁體中文](../zh-TW/pages-showcase.md) · [Project README](../../README.md)

This source produces a **single GitHub Pages site** with three capability demos; it is **not** a public inference service.

| URL within the Pages project | What the browser actually runs | What it does **not** run |
| --- | --- | --- |
| `/` | Version hub with reviewed screenshots and links | No inference or accounts |
| `/v0.1/` | Genuine original `bus.jpg` with a later validated CUDA screenshot; original WebGL viewer remains a clearly synthetic 3D exercise | No native bus depth/XYZ arrays, API, image upload or RTSP |
| `/v0.2/` | Real original `bus.jpg` and verified RTX 4090 four-model/semantic screenshot; optional separate generated geometry lab | No numeric native depth/XYZ from screenshot, no live YOLO/DA3 inference or metric accuracy |
| `/v0.3/` | Three unchanged recorded Session UI screenshots (saved #1/#12/#24; source #32/#43/#55) with real YOLO/BoT-SORT IDs; a separate synthetic replay exercise remains | The full 24 real frames / per-frame JSON, real-time online tracking, identity recognition and world trajectories are not provided |

The **main** examples are genuine, attributed public inputs/recorded inference screenshots. The original Ultralytics `bus.jpg` file is copied byte-for-byte from a fixed revision and verified against the original experiment SHA-256. The v0.2 CUDA result is a saved screen, not a native depth matrix. v0.3 reuses three existing unretouched screenshots of one 24-frame analysis on a Lukas Kosc / Pexels source, not all 24 frames or native tracking JSON. The separately labeled synthetic exercises still run entirely in browser JavaScript. See [Screenshot sources](../assets/README.md) for rights and experiment limits. The four depth engines and real Session tracking remain available only after [running DepthPort locally](installation.md).

## Build and preview locally

No Python AI dependencies are required to **build** the static pages. The builder imports only the standard-library-compatible source-archive module and uses a strict copy list. Use Python 3.11 or 3.12:

```bash
python tools/check_release.py
python tools/build_site.py
python -m http.server 8765 --directory _site --bind 127.0.0.1
```

Browse `http://127.0.0.1:8765/` and test `/v0.1/`, `/v0.2/`, and `/v0.3/`. The resulting paths are also safe when hosted under `https://jshengp.github.io/depthport/` because links and assets are relative, rather than absolute `/static/` URLs. The original viewer is kept, but becomes `/v0.1/` when a version-hub homepage is enabled.

Run smoke checks:

```bash
python -m pytest -q tests/test_pages_showcase.py tests/test_recorded_examples.py
node --check website/showcase.js
node --check website/recorded-examples.js
```

## GitHub Pages rollout

The [Pages workflow](../../.github/workflows/pages.yml) builds and uploads the static site for affected PRs **without deployment**. Deployment runs after a reviewed **push/merge to `main`**, or can also be launched manually with **workflow_dispatch** from `main`. Published releases/tags are not changed by the website builder. If a newer `main` has been updated concurrently, review and integrate the PR before manual deployment.

After deployment, open `https://jshengp.github.io/depthport/` and check all links, language changes, canvas interaction, replay controls, mobile layouts and that no API/network inference requests occur. To populate GitHub **About → Website**, click the repository's About edit gear and enter `https://jshengp.github.io/depthport/` (without tracking query parameters). This repository-setting field is not modified by the site build workflow.

### Scope and boundaries

- Do not check in any customer/other non-redistributable recordings, credentials, weights, calibration files or saved Session archives.
- Build assets are explicitly allowlisted; no recursive copying of the project, private outputs, or runtime data.
- Static demo pages label their synthetic data and never pretend to have real model metrics, calibration accuracy, real tracking IDs or physical camera input.
- The version labels denote **capability demonstrations**, not runnable clones or frozen binary mirrors of the historical v0.1/v0.2/v0.3 tags.
- Benchmark Results Dashboard is not included in this site change.
