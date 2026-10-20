# Geometry exposure discovery and confirmation — 2026-10-20

[繁體中文](../zh-TW/tracking-geometry-exposure.md) · [ROADMAP](../../ROADMAP.md) · [Original geometry rule](tracking-geometry-validity.md) · [Frozen protocol](../validation/v0.3-geometry-exposure-protocol.json)

**Discovery and unseen confirmation are complete; the formal replication gate remains blocked by four retained archive failures.** Preserve the previous geometry rule and failed two-source gate. No accuracy or default promotion is claimed.

## Frozen process

The local definition SHA256 is `0e17491922bcada995e96882a0fdf53fe40827f10d1d03b2fd301fd758b0b21f`. Twenty-two new synthetic/native contracts plus24 unchanged geometry contracts pass before freeze. Source metadata and old immutable cache/output seals are inspected; no new geometry replay or reserved PNG/inference/tracking output precedes the freeze. This is a local freeze, not external preregistration. Historical GT outcomes of seen sources were already known; an old aggregate report was previewed before freeze. Scores are never input features, no new GT is loaded or scored, and the source order was already fixed.

Discovery uses all16 previously inspected MOT sources in their original order, followed by all seen KITTI0000–0007 in lexical order:24 complete sources. Preserve all zero births, zero estimator exposure, zero projections, cap counts and failures. Failed sources are unknown rather than zero and block replication. No retry, replacement, clip selection or favourable early stop.

Select the first eligible source separately for four mutually exclusive pre-predict roles: active-confirmed, active-tentative, retained-confirmed, retained-tentative. Active means missed-age0, retained means positive missed age; confirmation uses the nativeID sign. Also report overlapping active/retained/unconfirmed/any groups, without summing them. Eligibility requires actual own-treatment projected rows and exposed source frames, full equal repeats/native references, zero detection caps/numerical failures/invalid treatment predictions or accepted posteriors. Hypothetical reference candidates and accepted-output/GT quality scores do not select a source. Missing exposure remains null.

Only after the complete discovery ledger, SHA and selections are sealed may the reserved KITTI0008/0009 images be read, inferred or tracked. These are fixed next unseen IDs (390/803 full original frames), retained regardless discovery result. Each group needs a discovery selection and actual eligible projection in **both** reserved sources, with every scheduled source complete; otherwise replication is false. This verifies exposure only, not quality or true per-scene harm. The two sequences share KITTI cameras/data family with part of discovery and share a pretrained detector/runtime; source separation does not establish independent sites, persons, model training data or statistical power.

## Unchanged method and integrity

The original `T*x` / `T*P*T.T` guard and its live/detached-shadow consistency remain byte-pinned. Native accepted high/weak updates, birth, confirmation, expiry, assignment, parameters and application/worker defaults are unchanged. No new threshold, epsilon, duration or FPS normalization is introduced. Native buffer30 is scaled by original source FPS:25/30/10 frames at MOT25/30Hz or KITTI10Hz. Fixed one-frame prediction remains native. Weak inputs/continuation remain enabled; actual accepted-event outcomes are not assumed equal.

All phase unhooked references are sealed before any phase treatment. All24 discovery full prediction JSONs (includingID/format) must equal old archived bytes; KITTI0004–0007 additionally match previous native-output/final-state seals. Every source then has two observed references and two treatments, each in a fresh isolated process, all frames continuously across cache shards. References equal unhooked full bytes/state; repeated treatments match complete output/state/uncompressed raw histories/role counts. Repeats are consistency checks, not independent samples. Pickles are written/hashed, never loaded. Streaming compressed diagnostics remain local.

Reserved preparation uses only the official image ZIP: frozen ETag, bounded four-way exact8MiB If-Match ranges, ordered PNG CRC/SHA, FFV1 bgr0 native10Hz and pixel equality. YOLO26n8.4.176 CPU person settings/weights remain fixed. No network retry or label archive. A preparation failure retains its scheduled slot and safe failure reason.

## Sources, publication and limits

[MOT17](https://motchallenge.net/data/MOT17/), [MOT20](https://motchallenge.net/data/MOT20/) and [KITTI](https://www.cvlibs.net/datasets/kitti/) publish CC BY-NC-SA3.0 terms, refreshed and hashed in the protocol. Attribution: Milan, Leal-Taixe, Reid, Roth, Schindler (MOT16); Dendorfer et al. (MOT20); Geiger, Lenz, Urtasun (CVPR2012 KITTI). Local noncommercial research only; no media/GT/raw redistribution or dataset relicensing.

Publish all ordered source aggregates, zeros/failure codes, selections and input/output/code seals. Raw images, detections, states/covariances, coordinates, per-case axes, frame/IDs/events, local paths, weights and exceptions stay in ignored artifacts. No FP/FN/IDSW/HOTA or identity/localisation/long-occlusion acceptance is established. v0.3 remains an experimental development preview; this does not validate historical release tags or change defaults.

## Reproduction boundary

The source manifest accepts only complete local video/cache paths and SHA256 seals, not labels or score files. Long existing MOT sources retain explicit contiguous cache offsets; tracker and shadow history continue across shards. Use the original pinned tracker research runtime, and the separate frozen8.4.176 model runtime for reserved inference. This reused environment is not a fresh complete Alpha installation.

The public tools are `freeze_tracking_geometry_exposure.py`, `select_tracking_geometry_exposure.py` and `prepare_tracking_geometry_exposure.py` under `tools/`. Each CLI documents its required protocol, local seal, manifest, output and phase arguments with `--help`. All run/preparation destinations reject overwrite; the reserved preparer requires the complete discovery result and writes its pre-inference seal before any image-member download. Use ignored artifacts for raw work and outputs; only reviewed aggregates enter the public manifest. Reproduction on already seen sources is not a new untouched confirmation and cannot change this frozen study's failures or gate.

## Discovery result — sealed before reserved preparation

[Complete ordered discovery](../validation/v0.3-geometry-exposure-discovery.json) · [All native reference checks](../validation/v0.3-geometry-exposure-discovery-references.json) · [Post-failure archive diagnosis](../validation/v0.3-geometry-exposure-archive-compatibility.json)

All24 scheduled sources /20,643 original frames remain in the ledger. Twenty sources /19,665 frames complete all five passes; four KITTI0000–0003 native replays fail the frozen whole-archive byte check and block their16 dependent observed passes.24 native plus80 observed passes execute. Every zero and failure is retained, without retries or source replacement. The complete-discovery gate is **false**, so group replication cannot pass even if reserved exposure is later found.

The20 completed sources have584 actual projected rows: active-confirmed3 (one source), retained-confirmed581 (18 sources), both tentative strata0. Count each source once, not repeated passes. All treatment numerical/invalid-prediction/invalid-accepted-posterior counts and all source cap counts are0. Complete reference outputs/native returns/final states equal unhooked seals; both observed-reference and treatment histories/counts repeat exactly.

Fixed-order selections are **MOT17-12-DPM** for active-confirmed/active and **MOT17-09-DPM** for retained-confirmed/retained/any. Both tentative strata and unconfirmed remain **null**. Selection is based on actual own-arm exposure and frozen integrity screens, never a quality score. These are discovery candidates, not independent confirmations.

The four failures are serialization compatibility: old archives have a Session object around `frames`, while the current replay saves the frame list. A separate post-failure read-only comparison finds every full frame list (including IDs) equal and its unchanged JSON serialization equal the new native file hash. No tracker rerun is used for this diagnosis. This does **not** satisfy frozen whole-file equality or change the failure status. A future format-aware protocol needs a separate prospective freeze; do not repair this result into a pass.

At the discovery publication, reserved0008/0009 preparation and confirmation were still pending. Only after this full discovery hash/selection seal may they be read or inferred. Parameters, weak continuation and defaults remain unchanged.

Native weak-stage code/inputs remain enabled; accepted weak updates total55,604→55,625 and three sources have different complete saved outputs. This is not an accepted-event membership harm audit or proof of recovery/identity benefit.

## Unseen confirmation and final decision

[Confirmation ledger](../validation/v0.3-geometry-exposure-confirmation.json) · [New native seals](../validation/v0.3-geometry-exposure-confirmation-references.json) · [Preparation](../validation/v0.3-geometry-exposure-preparation.json) · [Pre-inference seal](../validation/v0.3-geometry-exposure-pre-inference.json)

The [method commit](https://github.com/JShengP/depthport/commit/0892857b5f03dba413f0a41f53b66d2651c296b1) precedes every new geometry scan. The [complete discovery publication](https://github.com/JShengP/depthport/commit/c590532171f61401ec99653ea8fbf7d5f7c49b26), with SHA256 `5b80ff38b3b0806b81a5f7cd35fe2c5a4216b487ed412321d396daa6bb113347`, precedes any reserved PNG-member read/inference. The local pre-inference seal binds that complete ledger and unchanged selections. Both full sources prepare successfully:390/803 original PNGs and video frames are pixel-identical, with original detector/settings/runtime/weights. No new GT, accuracy evaluator, tuning, retry, source replacement or default change.

All ten reserved passes complete, with complete reference/native-output/final-state equality and exact two repeats per observed arm. These are newly sealed unhooked native references, not pre-existing historical archives. Both have zero cap frames, numerical failures, nonpositive accepted posteriors and treatment nonpositive predictions.

- **KITTI0008:**390 frames,26 births,190 prediction rows,4 high/40 weak accepted updates,44 confirmed observations. Two actual retained-confirmed projections in two source frames; native invalid prediction rows8→0. The native reference has only one hypothetical candidate row: selection correctly uses the two actual treatment-history rows. Active-confirmed and both tentative roles0.
- **KITTI0009:**803 frames,1 birth,19 predictions,8 high/0 weak accepted updates,8 confirmed observations. One actual retained-confirmed projection in one source frame; native invalid predictions3→0. Active-confirmed and both tentative roles0. Zero weak acceptance is retained, not interpreted as weak-stage filtering or efficacy.

Both reserved sources therefore have eligible **retained-confirmed/retained/any exposure**. Active-confirmed/active have discovery exposure but no reserved exposure; tentative/unconfirmed have neither a discovery selection nor reserved exposure. Complete saved outputs/native returns/final states are unchanged between reference and treatment in both sources, while intermediate projected histories differ. This demonstrates geometry/exposure, not recovery or identity benefit, and final-state equality does not imply unchanged intermediate states.

**Every formal `replicated_in_both_reserved` remains false.** The frozen rule requires every scheduled discovery source to complete; the four original whole-file failures block it. Do not remove failures, relax equality retrospectively, compensate across groups or call the retained-source triggers a passed study. Per-scene accepted-event membership/true harm, covariance calibration, tracking quality and app/release acceptance remain open; this exposure protocol does not repeat the earlier event-membership harm gate.

Across both phases:26 scheduled full sources /21,836 unique source frames;22 sources /20,858 frames have full observed comparisons, four /978 frames have native-only archive failures and unmeasured role exposure.26 native plus88 observed passes execute;16 dependent observed passes are blocked. No retries, source substitutions, omitted zeros or new source/run/preparation failures occur beyond the four retained archive-contract failures. Repeats are not independent samples.0008/0009 are now seen and cannot be future untouched confirmation.

Next prospectively freeze archive-carrier compatibility contracts and read-only tentative-role reachability. Preserve this original failure ledger. Separately freeze accepted-event membership/proxy-harm auditing for the three changed discovery outputs before interpreting their additional weak updates or designing a new intervention. Keep the same rule, parameters, native weak continuation and defaults. Future untouched-source confirmation requires a new prospective seal; do not tune from these outcomes.

Checks:22 new synthetic/native contracts plus24 original geometry contracts pass; full base suite495 passed/70 optional skipped (one existing Starlette/httpx deprecation warning). Method-head application and model API CI both pass,8/8 Linux/Windows Python3.11/3.12 jobs. Discovery publication application CI passes4/4. Public manifest, links, pinned hashes and reviewed source archive are checked again for the final documentation publication. Raw diagnostics/media remain local.

[The separately frozen read-only carrier/role audit is complete](tracking-carrier-roles.md):carrier reconstruction is exact and tentative zero projections follow the conditional native lifecycle; every original failure and replication flag above remains unchanged.
