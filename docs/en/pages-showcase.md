# Multi-version static Pages showcase

[繁體中文](../zh-TW/pages-showcase.md) · [Project README](../../README.md)

This source produces a **single GitHub Pages site** with three capability demos; it is **not** a public inference service.

| URL within the Pages project | What the browser actually runs | What it does **not** run |
| --- | --- | --- |
| `/` | Version hub with reviewed screenshots and links | No inference or accounts |
| `/v0.1/` | Existing original WebGL/Canvas2D viewer with built-in synthetic cloud | No image upload, API or RTSP processing |
| `/v0.2/` | Generated RGB/depth pixels, synthetic camera-space XYZ, optional mask outline, orbitable point cloud and histogram | No YOLO/DA3, actual model comparison or calibrated measurements |
| `/v0.3/` | 24 generated tracking frames with playable Object IDs and simulated virtual-depth history | No YOLO/BoT-SORT, identity recognition, saved private Session or real trajectories |

All synthetic computations are deterministic browser JavaScript. The screenshots on the homepage and explanatory lower panels are **separate original documentation images**, and their true provenance and original-source rights are recorded in [Screenshot sources](../assets/README.md). In particular, the real v0.3 example image includes a credited Lukas Kosc / Pexels source; it is not the input to the generated 24-frame interactive scene. The four depth engines and real Session tracking remain available only after [running DepthPort locally](installation.md).

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
python -m pytest -q tests/test_pages_showcase.py
node --check website/showcase.js
```

## GitHub Pages rollout

The [Pages workflow](../../.github/workflows/pages.yml) builds and uploads the static site for affected PRs **without deployment**. Deployment still requires a manual **workflow_dispatch on reviewed main**. Published releases/tags are not changed by the website builder. If a newer `main` has been updated concurrently, review and integrate the PR before manual deployment.

After deployment, open `https://jshengp.github.io/depthport/` and check all links, language changes, canvas interaction, replay controls, mobile layouts and that no API/network inference requests occur. To populate GitHub **About → Website**, click the repository's About edit gear and enter `https://jshengp.github.io/depthport/` (without tracking query parameters). This repository-setting field is not modified by the site build workflow.

### Scope and boundaries

- Do not check in any customer/other non-redistributable recordings, credentials, weights, calibration files or saved Session archives.
- Build assets are explicitly allowlisted; no recursive copying of the project, private outputs, or runtime data.
- Static demo pages label their synthetic data and never pretend to have real model metrics, calibration accuracy, real tracking IDs or physical camera input.
- The version labels denote **capability demonstrations**, not runnable clones or frozen binary mirrors of the historical v0.1/v0.2/v0.3 tags.
- Benchmark Results Dashboard is not included in this site change.
