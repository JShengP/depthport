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
