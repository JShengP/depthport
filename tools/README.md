# Developer tools
[繁體中文](README.zh-TW.md)

All commands run from the project root. None of these tools publishes to an external repository by itself.

| Tool | Purpose | Dependencies / boundary |
|---|---|---|
| `tools/check_release.py` | Check public manifest, local Markdown links and obvious secrets | Standard library; not a complete security/history scan |
| `tools/build_release.py` | Build manifest-only source ZIP and SHA-256 | Standard library; no model download |
| `tools/stage_public.py` | Stage only manifest files | Git; does not commit or push |
| `tools/build_site.py` | Build static synthetic demo in `_site` | Standard library; AI/RTSP inputs disabled |
| `tools/http_smoke.py` | Start actual Uvicorn and test routes via HTTP | Base app requirements; no model loaded |
| `tools/browser_offline_smoke.py` | Test UI with explicit FakeEngine and TestClient bridge | Test dependencies, CPU torch, Playwright and Chromium; not browser-to-HTTP or pretrained inference |
| `tests/test_i18n.cjs` | Translation keys, placeholders, preferences and DOM references | Node.js; no npm dependencies |

Optional browser setup:

```bash
python -m pip install -r requirements-test.txt playwright
python -m playwright install chromium
python tools/browser_offline_smoke.py
```

The tool uses Playwright's installed Chromium unless `CHROMIUM_PATH` names a local executable. It creates local reports and captures only the explicitly labeled synthetic viewer for documentation screenshots. Read the reported renderer: Canvas fallback is not a WebGL GPU test. UI tests cover both languages, no inference triggered by language changes, all four mock-backed model switches, same-source exports, synthetic interaction and narrow layout.

`check_env.py --all --image camera.jpg` is the separate **real** inference path. Its success requires actual model calls; no fake fallback exists.

`tools/cache_video_detections.py` now freezes class/device/NMS/cap/weight/runtime metadata; `tools/validate_mot_tracking.py` runs offline repeated MOT17 comparisons against a clean pinned TrackEval checkout, with visibility/order-exchange diagnostics. Use the separate NumPy 2 environment; [expanded acceptance and reproduction](../docs/en/tracking-expanded-acceptance.md). Raw work files stay local.

`tools/validate_mot_tracking.py --parameter-sweep` runs five fixed activation/high-confidence-split/lost-buffer profiles for both direct backends on a new sequence group, verifies effective thresholds/time budgets and reports paired scenario gains/losses. [Method, protocol and results](../docs/en/tracking-parameter-acceptance.md). This is separate from worker configuration; no app default is changed.

`tools/diagnose_tracking_errors.py` reanalyses saved default/activation-only results with exact official CLEAR reconciliation, pairs FP by immutable cache detection and writes raw cases/ID maps only to the local work directory. It publishes aggregate context counts, not causal labels. [Method, privacy boundary and decisions](../docs/en/tracking-error-diagnosis.md).

`tools/validate_mot_tracking.py --admission-study` separately tests bounded confirmation and a birth-only competition veto while preserving upstream weak association; writes only aggregate comparisons publicly and keeps error locations local. `tools/plot_tracking_admission.py` renders FN/FP/IDSW from the aggregate JSON with Matplotlib in the isolated tracker environment. [Frozen protocol, results and limits](../docs/en/tracking-admission-acceptance.md).


## Version workflow schematics

`python tools/build_version_visuals.py` rebuilds the four SVG illustrations in `docs/assets/` with the standard library. It reads no camera, model, Session or bookmark data. See [asset provenance and limits](../docs/assets/README.md).
