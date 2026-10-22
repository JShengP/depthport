# Multi-version static Pages showcase

[繁體中文](../zh-TW/pages-showcase.md) · [Project README](../../README.md)

This source produces a **single GitHub Pages site** with three capability demos; it is **not** a public inference service.

Primary demos now use actual saved four-model depth/XYZRGB and a new complete 24-frame tracking replay. See [data provenance, rights and limitations](real-ai-pages.md). Original screenshots and clearly marked synthetic exercises remain.

## Build and preview locally

No Python AI dependencies are required to **build** the static pages. The builder imports only the standard-library-compatible source-archive module and uses a strict copy list. Use Python 3.11 or 3.12:

```bash
python tools/check_release.py
python tools/build_site.py
python -m http.server 8765 --directory _site --bind 127.0.0.1
```

Browse `http://127.0.0.1:8765/` and test `/v0.1/`, `/v0.2/`, and `/v0.3/`. The resulting paths are also safe when hosted under `https://jshengp.github.io/depthport/` because links and assets are relative, rather than absolute `/static/` URLs. The original synthetic viewer is retained at `/v0.1/synthetic.html`; the primary `/v0.1/` uses CloudViewer with actual saved clouds.

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
- Static pages distinguish saved model results from synthetic practice and unverified physical accuracy.
- The version labels denote **capability demonstrations**, not runnable clones or frozen binary mirrors of the historical v0.1/v0.2/v0.3 tags.
- Benchmark Results Dashboard is not included in this site change.

## v0.2 synthetic cloud initialization — 2026-10-22

A deployed-page screenshot exposed an empty synthetic cloud with a misleading browser-support message. Reproduced on deployed v0.2: deferred `showcase.js` ran before `viewer.js`, so constructing `window.CloudViewer` failed before the renderer was available. The real saved bus viewer runs later and is a separate widget; this was not evidence that the browser lacked WebGL/Canvas or inference data had failed.

Load the existing renderer before the spatial initializer. Initialization failures now say “Point cloud could not initialize. Refresh the page to try again.” in both languages, with a status role and language updates. The synthetic section/histogram/limitations remain separate from real saved results above; no model/data/geometry/point count or research gate changed.

The regression executes the built page's deferred scripts in actual HTML order with the original software renderer: supported Canvas2D must draw the cloud, pointer controls remain bound and pixel/mask interaction works. A forced no-context fixture verifies bilingual initialization failure without blaming browser support. The old build fails the supported-renderer assertion; the repaired build passes. Pages/build contracts:13 passed; existing real-results contracts:9 passed. Local IAB visibly renders the previously blank synthetic canvas. These generated/forced checks and scoped UI verification do not rerun/expand the historical frozen browser matrix or establish hardware/model quality acceptance. CI and deployment follow-up are tracked with the repair PR.

## v0.2 real results first, optional practice collapsed — 2026-10-22

The real saved bus depth/Float32 XYZ/Detect-Segment mask inspector stays visible above the recorded gallery. All generated RGB/depth, virtual readouts, synthetic mask, cloud and histogram now sit inside one native disclosure, closed on every fresh load and explicitly labelled “Synthetic geometry practice (optional; separate from real bus results)”. Keyboard activation and the label work in both languages. Local-app documentation remains outside the disclosure.

The first open initializes the exercise only after visible canvas dimensions are available; later toggles reuse its pixel/mask/cloud view state. A language switch while closed is honored on first open. No real data pack, model result, screenshot, unit, research gate or historical browser-matrix result changes. Build regressions check closed containment and the original renderer's first-open/reopen/failure paths; scoped browser checks cover disclosure and unchanged real-result controls, not a new full browser/hardware acceptance run.
