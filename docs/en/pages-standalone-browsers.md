# Independent headless Pages browsers — 2026-10-20

[繁體中文](../zh-TW/pages-standalone-browsers.md) · [Original study](pages-browser-compatibility.md) · [Roadmap](../../ROADMAP.md#current-pages--目前互動展示) · [PR #27](https://github.com/JShengP/depthport/pull/27)

> Historical headless scope is preserved below. The subsequent [native headed study](pages-headed-browsers.md) records its own target, evidence and remaining gates; execution modes do not add browser rows.

## Frozen scope

This follows the unchanged [eight-case/eight-environment protocol](../validation/pages-browser-protocol.json), SHA256 `fd0851f025d7b1e3bf6cced37c8553a074ce29e33db64e06e8eccaf3d316d38d`. The [standalone execution plan](../validation/pages-standalone-plan.json) was publicly sealed in **`8e94f78` before actual Pages UI tests**, targeting deployed **`6498451`**. The user explicitly authorized WebDriver headless testing after independent browsers were unavailable through the in-app control surface. It does not revise the earlier in-app ledger, amendment or failures.

Three actual vendor browser executables run sequentially in fresh disposable profiles on Linux x86_64. No daily browser profile, private Session, notes, RTSP feed or credentials are used. No inference, tracker rerun, GT access, parameter tuning or saved-data change occurs.

## Environments and limits

- **CHROME-D:** Google Chrome **155.0.8059.84**, ChromeDriver **155.0.8059.84**.
- **EDGE-D:** Microsoft Edge **155.0.4283.62**, EdgeDriver **155.0.4283.62**.
- **FIREFOX-D:** Mozilla Firefox **157.0**, GeckoDriver **0.37.1**.

Selenium **4.51.0** and Pillow **13.0.0** live in a separate environment; application dependencies stay unchanged. Desktop viewport **1280×900**, DPR1; a supplemental **390×844** B06 responsive check is not a new matrix row, mobile OS or physical touch test. Chrome and Edge report **ANGLE/Vulkan SwiftShader software rendering**. Firefox reports `NVIDIA GeForce GTX 980, or similar`; this generic renderer string does not identify or certify physical hardware. Headless browser results establish neither headed desktop behavior, GPU performance nor full local-app rendering/installation acceptance.

Browser/driver sources and verified archive digests are in the sealed plan. Edge came from the [Microsoft repository](https://packages.microsoft.com/repos/edge/dists/stable/main/binary-amd64/Packages.gz), checked against its SHA256; Firefox came from the [Mozilla archive](https://archive.mozilla.org/pub/firefox/releases/157.0/), checked against official SHA512SUMS. Driver sources are [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/155.0.8059.84.json), [Microsoft Edge WebDriver](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/) and [Mozilla GeckoDriver](https://github.com/mozilla/geckodriver/releases/tag/v0.37.1). Archives were extracted locally, without replacing system browsers.

## Results and case provenance

[Aggregate ledger, per-case origins, all attempts and hashes](../validation/pages-standalone-acceptance.json) records **21 pass / 0 fail / 3 not_run** across these three rows: **B01–B07 pass for each**, **B08 not_run for each**. The combined historical in-app plus headless matrix is **33 pass / 0 fail / 31 not_run** out of64 cells; **full matrix acceptance remains open**. These are distinct dated studies, not a single all-environment run. Chrome/Edge share Chromium; Firefox uses Gecko. No product repair was required in this follow-up.

- **B01:** home/three versions load; 53 public files match pinned repository bytes, separately from UI checks. Passive page console/JavaScript-error subscriptions observed no errors in accepted attempts.
- **B02:** **24 model/layout checks**: four models × v0.1/v0.2 × three browsers. Every cloud renders, and native orbit, wheel zoom, **Shift-pan**, size, RGB/depth and reset change/restore actual point pixels. All24 baseline screenshots and representative operation states were visually inspected. Native right-button and touch gestures are not claimed.
- **B03:** **48 centre/edge RGB/depth samples**, each checking raw/final Z and camera XYZ; native/final map switches preserve values. Maximum displayed query error **4.8547515e-7**, within unchanged tolerance.
- **B04:** **24 Segment/Detect bus checks**, with visible overlay/subset clouds and full-cloud restoration, confidence, valid aligned counts and median Z. Maximum median display error **4.2369080e-7**. Predictions/ROIs are not GT.
- **B05:** **21 replay-state checks**, frames1/6/7/12/19/20/24 for obj-0005. Exact saved source/timestamps/statistics agree. Frames7–19 remain missing with blank Z/XYZ, a visible history gap and no observed-frame buttons. All three speeds, pause/advance, stepping/bounds and ending pass; no timing/identity accuracy claim.
- **B06:** **48 bilingual route layouts** at1280×900 and supplemental390×844. Visible version links/images follow language, native destination clicks work, selected bus/ID and missing-frame state persist, controls remain reachable and horizontal overflow stays≤1px. Representative EN/zh-TW narrow layouts were visually inspected. Font/range styles differ normally.
- **B07:** correct version titles/destinations, current **9/209/152/57** vs historical **7/230/125/105**, source/terms and depth/static-data limitations remain distinct. The legacy RGB caption points to exact queries.
- **B08:** all three have native gzip/WebGL; **both unsupported-gzip and actual Canvas-fallback branches remain unexercised**. They are not converted to passes.

Chrome final evidence combines **chrome-03** (B01–B05/B07) with **chrome-04** (B06); Edge combines **edge-01** with **edge-02** (B03); Firefox uses **firefox-01**. A case-only rerun leaves all unselected cases not_run in its own raw record. Case origins are explicit, so no fictional single all-pass attempt is created.

### Retained tool failures

1. **chrome-01:** native element screenshot timed out during WebGL capture; the next model capture was interrupted. The integrity subcheck completed, but final aggregation did not. Raw output is unchanged; pending cases are accounted as incomplete. Native viewport PNG capture replaced the element-capture path.
2. **chrome-02:** screenshot regions were sampled during CSS smooth-scroll, producing reset/subset comparison failures. B06 selected a card article instead of its anchor and wrongly required a language query on the home link. These are retained harness assertions/selection errors.
3. **chrome-03:** B02/B04 passed after capture positioning was fixed; off-screen language clicks still relied on driver auto-scroll and were intercepted. **chrome-04** explicitly positions controls before native clicks and passes B06.
4. **edge-01:** B03 pointer target left the viewport after switching the map toolbar. **edge-02** repositions the canvas before every native click and passes B03.

No browser globals, CSS, product behavior, data or pass tolerance were altered to obtain passing results. Explicit instant UI scrolling corrects test coordinates; the website's smooth-scroll style remains unchanged. Setup path-probe failures are also retained in the ledger. Raw traces and earlier failed assertions stay local with their hashes; none is relabelled as an original pass. Local Pages regression tests: **13 passed**. Final PR/main CI and deployed smoke are recorded with PR #27.

## Method and reproducibility

The opt-in [harness](../../tools/pages_browser_acceptance.py) uses explicit browser/driver paths, native WebDriver pointer, wheel, Shift-drag, keyboard and select actions. BiDi console/JavaScript-error subscriptions start before navigation. DOM/canvas inspection is read-only; no browser globals, missing APIs, app state, routes or network responses are substituted. Certificate validation and browser sandboxes remain enabled. Original viewport PNGs are saved unchanged; in-memory regions support pixel comparisons, followed by visual review.

Install [optional dependencies](../../requirements-browser-tests.txt) into a dedicated environment, then run with actual executable paths and a **new ignored** output directory:

```sh
python tools/pages_browser_acceptance.py --browser chrome \
  --binary /path/to/google-chrome --driver /path/to/chromedriver \
  --output artifacts/browser-study/new-chrome-run
```

Repeat with `--browser edge` or `firefox` and matching executables. Output refuses overwrite. The command targets public saved-data Pages by default; it neither installs browsers nor changes the app environment. Browser tests are opt-in and are not represented by ordinary application CI.

The independent stdlib oracle decodes the original little-endian Float32 buffers, verifies their hashes and applies saved K/source-pixel mapping. Segment RLEs and Detect boxes are mapped independently to each depth grid. The original tolerance remains `abs(error) <= max(5e-6, abs(expected)*5e-7)`. Reusing the same bus exports and short replay provides compatibility evidence, not new independent tracking/accuracy samples.

## Retained attempts and next gates

Every attempted run, harness correction and final case outcome is retained in the follow-up record. Raw per-click logs, stack traces, driver logs, screenshots, profiles and downloaded binaries remain local; only reviewed aggregate outcomes and hashes are published. Earlier in-app failures remain unchanged.

Safari/macOS, physical Android/iOS, native touch, headed browser/OS coverage and naturally unsupported gzip/WebGL paths remain open. All three available engines naturally support gzip and WebGL; this cannot pass B08. No missing API is injected to manufacture coverage. Full matrix acceptance, calibration, identity GT/IDSW/HOTA, long occlusion/moving camera, RTSP, fresh Windows/Alpha installation and endurance/VRAM gates remain open. [Data provenance and new/old tracking limits](real-ai-pages.md) still apply.
