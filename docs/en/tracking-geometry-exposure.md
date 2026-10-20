# Geometry exposure discovery and confirmation — 2026-10-20

[繁體中文](../zh-TW/tracking-geometry-exposure.md) · [ROADMAP](../../ROADMAP.md) · [Original geometry rule](tracking-geometry-validity.md) · [Frozen protocol](../validation/v0.3-geometry-exposure-protocol.json)

**Prospective workflow frozen; results pending.** Preserve the previous geometry rule and failed two-source gate. No accuracy or default promotion is claimed.

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
