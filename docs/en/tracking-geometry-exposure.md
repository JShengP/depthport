# Geometry exposure discovery and confirmation — 2026-10-20

[繁體中文](../zh-TW/tracking-geometry-exposure.md) · [ROADMAP](../../ROADMAP.md) · [Original geometry rule](tracking-geometry-validity.md) · [Frozen protocol](../validation/v0.3-geometry-exposure-protocol.json)

**Discovery sealed; reserved confirmation pending.** Preserve the previous geometry rule and failed two-source gate. No accuracy or default promotion is claimed.

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

Reserved0008/0009 preparation and confirmation remain pending at this discovery publication. Only after this full discovery hash/selection seal may they be read or inferred. Parameters, weak continuation and defaults remain unchanged.

Native weak-stage code/inputs remain enabled; accepted weak updates total55,604→55,625 and three sources have different complete saved outputs. This is not an accepted-event membership harm audit or proof of recovery/identity benefit.
