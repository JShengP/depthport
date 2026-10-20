# Native headed Pages browsers — 2026-10-20

[繁體中文](../zh-TW/pages-headed-browsers.md) · [Headless study](pages-standalone-browsers.md) · [Original in-app study](pages-browser-compatibility.md) · [Roadmap](../../ROADMAP.md#current-pages--目前互動展示) · [PR #28](https://github.com/JShengP/depthport/pull/28)

## Frozen scope and mode

The unchanged [eight-case/eight-environment protocol](../validation/pages-browser-protocol.json), SHA256 `fd0851f025d7b1e3bf6cced37c8553a074ce29e33db64e06e8eccaf3d316d38d`, remains authoritative. The [headed execution plan](../validation/pages-headed-plan.json) and mode support were publicly sealed in **`c5060e4` before Pages UI tests**, targeting deployed main **`2f77579`**. Setup probes used only `about:blank`, never a product-case pass.

This is native **Linux X11 headed execution**, distinct from the prior headless study. All three vendor browsers use fresh temporary profiles on the existing X.Org 21.1.11 desktop (1920×1080×24); no Xvfb, daily browser profile, private Session, notes, credentials or RTSP feed. The original protocol and every historical JSON ledger remain unchanged. No inference, GT access, tracker rerun, tuning, defaults or saved-data change occurs.

## Environment and visibility evidence

- **CHROME-D:** Google Chrome **155.0.8059.84**, ChromeDriver **155.0.8059.84**.
- **EDGE-D:** Microsoft Edge **155.0.4283.62**, EdgeDriver **155.0.4283.62**.
- **FIREFOX-D:** Mozilla Firefox **157.0**, GeckoDriver **0.37.1**.

The executables, official source/checksum chain, Selenium 4.51.0/Pillow 13.0.0 isolated environment and application dependencies are unchanged from the [headless preparation](../validation/pages-standalone-plan.json). The new `--headed` option omits headless flags; default headless behavior remains available. Native process arguments have **no headless switches**. Firefox also reports **`moz:headless=false`**. Vendor process IDs are used to check only PID properties, then the matching browser window's `IsViewable` map state and geometry. No other window title or desktop image is read or captured; public metadata excludes process/window IDs and profile paths.

Desktop **1280×900, DPR1** uses the actual native content area: clear viewport overrides and resize the native window until `innerWidth`/`innerHeight` match. Browser chrome adds different outer dimensions; client-viewport compatibility does not certify window-manager panels, whole-monitor placement or OS browser chrome. Supplemental **390×844** B06 checks use native WebDriver BiDi **CSS viewport overrides** inside the visible window. The outer window is not 390px wide; this is neither a native minimum-window-size test nor a phone/touch/OS result. Returning to desktop clears the override and restores the native content size.

Headed Chrome/Edge report `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4090/PCIe/SSE2, OpenGL 4.5.0)`, whereas their prior headless runs used SwiftShader. This is observed renderer metadata, not a GPU benchmark or acceptance of the complete local app. Firefox's `NVIDIA GeForce GTX 980, or similar` remains a generic reported string that cannot identify/certify physical hardware. Cross-mode screenshot bytes are not compared as a numerical accuracy test.

## Results

[Aggregate ledger and original evidence hashes](../validation/pages-headed-acceptance.json): **21 pass / 0 fail / 3 not_run**. Each headed browser passes **B01–B07**; **B08 stays not_run**. No product repair or real-case rerun was needed. The unique frozen matrix remains **33 pass / 0 fail / 31 not_run** out of 64; the prior headless 21/3 record remains unchanged and is not added again. Full matrix acceptance remains open.

- **B01:** home/three versions load, 53 public files match pinned repository bytes in each browser and after the study; passive page-console/JavaScript monitoring observes no errors. Hash verification remains separate from real UI checks.
- **B02:** 24 cloud/model/layout checks across four models, v0.1/v0.2 and three browsers. Native orbit, wheel zoom, Shift-pan, point size, RGB/depth color and reset work; within-session reset pixels restore exactly. All 24 baseline clouds plus representative operations were visually inspected. Right-button/touch gestures are not claimed.
- **B03:** 48 RGB/depth centre/edge samples, independently checked raw/final Z and camera XYZ. Native/final map switching preserves queried values. Maximum displayed query error **4.8547515e-07**, within the unchanged frozen tolerance.
- **B04:** 24 Segment/Detect bus checks: visible masks/ROI subset clouds, full-cloud restoration, confidence, valid aligned counts and median Z match the independent RLE/box oracle. Maximum median display error **4.2369080e-07**. Predictions/ROIs are not GT.
- **B05:** 21 states at 1/6/7/12/19/20/24 for obj-0005. Saved source32/43/55, timestamps and observed statistics agree;7–19 remain missing with blank Z/XYZ, a real history gap and no observed-frame buttons. All 0.5×/1×/2× speed, pause/advance, step/bounds and end checks pass. No timing/identity accuracy claim.
- **B06:** 48 EN/zh-TW route layouts at native 1280×900 and supplemental 390×844 override. Version links/images, actual destinations, selected bus/ID and missing state remain correct; controls are reachable, horizontal overflow≤1px. Representative bilingual narrow layouts were visually inspected. Native fonts/ranges differ normally.
- **B07:** titles/destinations, exact-query legacy caption, static/source/terms limits and current 9/209/152/57 versus historical 7/230/125/105 stay distinct.
- **B08:** all three naturally support gzip/WebGL. Neither unsupported-gzip error nor actual Canvas fallback was reached; both branches remain untested, never simulated or counted as passes.

### Retained setup failures

The first about:blank probe launched Chrome/Edge, but a main-thread child-process lookup found no browser PID, so visibility/headless-argument proof failed. Both original failures remain sealed. Vendor `goog:processID`/`moz:processID` capabilities fixed identification before the public freeze. A second probe verified all visible windows; a third refined desktop sizing from a BiDi override to actual native content resizing. No product case was run or passed during these probes. All three full Pages attempts use the same sealed harness; individual raw results and sources have retained hashes.

## Method and reproduction

The [opt-in harness](../../tools/pages_browser_acceptance.py) keeps the same native pointer/select/key/wheel/Shift-pan actions, immutable per-attempt outputs, passive BiDi console/error monitoring, original viewport PNG capture and independent stdlib Float32/K/RLE/box oracle. Pixel-query tolerance stays `abs(error) <= max(5e-6, abs(expected)*5e-7)`. Reset/operation checks compare pixels within the same session and need visual review. Source/hash provenance and new/old tracking limits in [saved-data documentation](real-ai-pages.md) still apply.

Install [optional browser-test dependencies](../../requirements-browser-tests.txt) into a separate environment, then supply real executable paths, a working native display and a new ignored output directory:

```sh
python tools/pages_browser_acceptance.py --headed --browser chrome \
  --binary /path/to/google-chrome --driver /path/to/chromedriver \
  --output artifacts/headed-study/new-chrome-run
```

Repeat sequentially for Edge and Firefox. Without `--headed`, the default remains headless. Output refuses overwrite; `--cases` can target a rerun while keeping unselected cases `not_run`. Browser automation is not run by ordinary application CI. Certificate validation and browser sandboxes stay enabled. No missing API, CSS, app state, network response or browser global is substituted to force a pass.

## Accounting and remaining gates

Headed/headless are **two execution modes of the same three existing desktop rows**; they are not six independent browsers or additional cells in the frozen 64-cell matrix. Each mode retains its own 24 case cells, browser builds, target and origins. Shared bus exports and replay frames are not new independent tracking samples.

Natural no-gzip and actual browser Canvas fallback remain `not_run` when those branches are not reached. Safari/macOS, physical Android/iOS, native touch and other OS/build combinations remain open. Saved-result checks do not establish calibrated distance, identity GT/IDSW/HOTA, long-occlusion/moving-camera reliability, RTSP, fresh Windows/full Alpha installation or sustained GPU/VRAM acceptance.

Raw PNGs, errors, per-click events, driver logs, profiles, binaries and diagnostic paths remain ignored/local. Only the reviewed harness, frozen plan, aggregate outcomes and hashes are public. Original failures and incomplete attempts are retained separately from accepted retests.
