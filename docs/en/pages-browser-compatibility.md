# Saved-result Pages browser compatibility — 2026-10-20

[繁體中文](../zh-TW/pages-browser-compatibility.md) · [Roadmap](../../ROADMAP.md#current-pages--目前互動展示) · [Data provenance](real-ai-pages.md) · [PR #26](https://github.com/JShengP/depthport/pull/26)

## Protocol and scope

The [eight-case protocol and eight-environment matrix](../validation/pages-browser-protocol.json) were publicly frozen in commit `8c5a25e` **before UI tests**, targeting deployment `884b996`. Raw depth, final geometry, semantic masks and replay data are unchanged. No model inference, GT access, tracker run, tuning or default change was performed.

The [initial ledger](../validation/pages-browser-initial.json) is immutable. A later [addendum](../validation/pages-browser-addendum.json) corrects an initially missed mobile-navigation failure without rewriting it. [Final results](../validation/pages-browser-acceptance.json) distinguish original observations from local repaired-build retests; the PR records subsequent main CI/deployment checks.

## Matrix and outcome

- **IAB-D:** in-app browser, 1280×900, mouse/keyboard; executed.
- **IAB-M:** the **same engine**, 390×844 viewport override, mouse/keyboard; executed. This is responsive layout testing, not touch or a physical phone.
- **CHROME-D / EDGE-D / FIREFOX-D / SAFARI-D:** standalone desktop browsers **not run**; not available on enabled control surfaces. No platform/version is certified.
- **ANDROID / IOS:** physical Chrome/Android and Safari/iOS **not run**; no controllable device. Viewport tests do not replace them.

The available engine reports Linux x86_64, `Chrome/155.0.0.0`, native gzip `DecompressionStream`, and WebGL with `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4090/PCIe/SSE2, OpenGL 4.5.0)`. This is a UA/renderer observation; the exact embedded build and driver were unavailable. It is not standalone Chrome certification, a benchmark, or acceptance of the full local application's NVIDIA rendering/installation gates.

**The complete matrix is not accepted.** The corrected original result is **9 pass / 3 fail / 52 not run** out of 64 environment-case cells. After repairs, the scoped local result is **12 pass / 0 fail / 52 not run**. A `not_run` case can contain completed subchecks; it is never counted as a pass.

## Executed cases

- **B01 — loads/integrity:** 53 public HTML/assets/data/screenshot files matched repository bytes. Both scheduled viewports loaded home and three versions without observed page console errors or alerts. Static integrity and UI behavior are separate evidence.
- **B02 — four clouds, incomplete:** each of four saved models rendered in **both v0.1/v0.2 at both viewports**, with orbit, wheel zoom, RGB/depth controls, size and reset exercised. **Modifier/right-button pan was not executed** by the available drag interface, so the whole case remains `not_run`. Native touch is also untested. The existing Node Canvas-fallback/pan contract passed, but does not replace browser evidence.
- **B03 — exact queries:** 40 visible raw/final-Z/XYZ readout checks, covering four models, RGB/depth centre/edge clicks and map switching at both viewports. Independent Python/NumPy decoded the saved little-endian Float32 values and applied saved K and pixel-centre mapping. All met the predeclared tolerance `abs(error) <= max(5e-6, abs(expected)*5e-7)`; maximum absolute displayed query error **4.9417114e-7**. No numerical values came from preview colors.
- **B04 — semantics:** 16 bus Segment/Detect checks across four depth models and both viewports. Visible mask/ROI clouds, confidence, aligned valid pixel counts and median Z were checked against independent RLE/box mapping and saved final depth. Maximum median display error **4.2369080e-7**. Segment and Detect are model predictions/approximate ROIs, not GT.
- **B05 — replay:** 14 state checks at frames **1,6,7,12,19,20,24** for `obj-0005`, plus advancement/pause at **0.5×/1×/2×**, end stopping and navigation bounds. Source32/43/55 and saved timestamps agree; frames7–19 remain unobserved with blank Z/XYZ, a visual history gap and no observed-frame buttons in that interval. Saved observed statistics agree. No FPS precision, throughput, identity or long-occlusion acceptance is inferred.
- **B06 — bilingual/responsive:** 16 initial route/language layouts had no horizontal overflow, but the first width-focused pass missed a hidden mobile link. The addendum retains that error. After CSS repair, all three version navs were visible/in bounds in both languages/viewports; six actual navigation clicks reached the named versions. Dynamic selected-object and missing-observation text remained usable. Mixed bilingual model/unit identifiers are intentional.
- **B07 — navigation/boundaries:** original title/link/caption failures below; corrected and locally retested. Current9/209/152/57 and old7/230/125/105 remain separate. Estimated HFOV, virtual depth, source terms and the static-only boundary remain unchanged.
- **B08 — unsupported/fallback, not run:** this engine naturally supports gzip and WebGL. Neither the no-gzip error path nor actual browser Canvas fallback was reached. Globals were not modified to manufacture support failures. These branches require a real naturally unsupported environment; Node coverage remains supplementary.

## Retained failures and repairs

1. **F01 / B07:** v0.1's title/metadata identified v0.2; its v0.1-labelled link led to v0.3. Repair: correct title/description and show correctly targeted v0.2/v0.3 links.
2. **F02 / B07:** the English legacy RGB reference claimed native depth was unpublished despite the real inspector above. Repair: direct users to that inspector; source-pixel clicks still work.
3. **F03 / B06, mobile:** shared narrow-layout CSS hid the second header destination. This was discovered during repair retesting and confirmed on the original public v0.2 page (`v0.1` was `display:none`). Repair: retain all version links and allow wrapping. The initial B06 mobile pass is superseded by the addendum, not silently changed.

Repair commit **`1a61a1b`** was locally rebuilt. Both viewport/language navigation sets and actual destinations, the corrected initial/clicked RGB reference, numeric/mask smoke and missing-frame replay were retested. Four independent repaired-build query/mask checks passed. A route-title/destination regression test was added. Local validation: **526 passed / 92 skipped**, focused Pages tests **13 passed**, public-file/link checks and static build passed. Main CI/Pages/deployed-link checks are recorded with the PR; local results are not labelled as a second browser or new deployment study.

Two harness mistakes are retained separately in the initial ledger: waiting for an unopened native option to be visible, and an offline validator including a non-frame harness entry. Both were corrected and rerun; neither is a product failure. A stopped old localhost preview was restarted on an explicit new preview port; it is not a public-site availability result.

## Remaining work and publication boundary

Execute the six unavailable matrix rows, actual modifier/right-button pan and native touch, and naturally unsupported gzip/WebGL paths. Record browser/OS/device versions and failures under the same frozen cases, or freeze a prospective revision before extending them. Do not mark cross-browser support complete from two viewport sizes in one engine.

This only verifies saved-result presentation. Depth calibration/accuracy, identity GT/IDSW/HOTA, long-occlusion/moving-camera tracking, physical RTSP, fresh Windows/full Alpha installation, sustained GPU/VRAM and local-app hardware rendering remain open. Source rights and new/old run limits in [provenance](real-ai-pages.md) still apply. Only aggregate outcomes/hashes are public; raw click logs, diagnostics, private Sessions, notes, originals and credentials remain local.
