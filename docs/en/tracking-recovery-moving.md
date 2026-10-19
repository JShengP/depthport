# Unchanged recovery control on moving cameras — 2026-10-19

[繁體中文](../zh-TW/tracking-recovery-moving.md) · [ROADMAP](../../ROADMAP.md) · [Previous static-camera study](tracking-recovery-acceptance.md)

**The replication fails the per-scene research screen; keep the control opt-in/offline and defaults unchanged.** Combined FP **543→535**, FN **13,695→13,695**, IDSW **21→21**. Added misses/switches are both **zero**, but bus-view HOTA **24.9588→24.9473%** slightly regresses. Combined scores cannot hide this failure. No new same-ID long-event recovery is observed.

[Frozen protocol/amendment](../validation/v0.3-recovery-moving-protocol.json) · [Initial snapshot](../validation/v0.3-recovery-moving-protocol.initial.json) · [Replication aggregates](../validation/v0.3-recovery-moving.json) · [Moving-scene audit](../validation/v0.3-recovery-moving-errors.json) · [Prior added-error audit](../validation/v0.3-recovery-static-errors.json)

![Errors on the two moving-camera views](../assets/tracking-v03-recovery-moving.png)

> Later [state/association-history diagnosis](tracking-recovery-history.md) reproduces these frozen scores and explains retained-state gating, continuity ownership and low-threshold HOTA losses. No control/default change.

## Sources and evidence boundaries

Entire **MOT17-11-DPM, 900 frames / 30 fps** (forward-moving shopping-mall camera), and **MOT17-13-DPM, 750 frames / 25 fps** (intersection filmed from a bus): **1,650 consecutive frames**. Separate from static MOT20-01 and policy-discovery MOT17-09/10. Both scenes appeared in earlier general benchmarks, but **not this control**; they are not never-seen or blind test scenes. Select full sequences before replication results, without outcome-based clipping/substitution.

The [official MOT17 page](https://motchallenge.net/data/MOT17/) explicitly lists [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/), with possible additional original-source conditions; neither selected Source column has an additional third-party link. Attribution: MOTChallenge; Milan, Leal-Taixé, Reid, Roth and Schindler, [MOT16](https://arxiv.org/abs/1603.00831). Local non-commercial research only; no media, GT or raw diagnostic redistribution. Application AGPL does not relicense source data. Dataset-derived plots/records retain attribution and the applicable CC BY-NC-SA 3.0 notice.

Rebuild shared **YOLO26n CPU / Ultralytics 8.4.176** caches: confidence .10, 640, NMS .70, class 0, cap 64, identical weights. Scene 11 has **8,558** detections; 13 has **8,285**; both have **zero** cap-hit frames. Old 8.4.115 scores/caches are not controls. Each 960×540 preview maps uniformly 2× to 1920×1080 GT with one-based MOT coordinates; **21,078** official pedestrian observations. Reused model runtime plus version overlay is not a fresh full Alpha.2 installation.

## Unchanged policy and execution checks

Keep the original `RecoveryDeferral`, original runner's `run_arm`, IoU .10 / margin .05, activation .30, split .60, confirmation 2, buffer 30 reference frames (one second), runtime and upstream ByteTrack class hashes. Only defer selected missed-hypothesis weak pairs with an active confirmed competitor. No rematching/lifetime extension; active weak continuation, uncontested recovery and every raw detection remain upstream. No CMC/ReID, GT-fed tracking, Session or worker-default changes.

Two scenes × two arms × three repeats = **12 runs / 9,900 frame updates**; separately run one unhooked upstream reference per scene. Canonical outputs and full trace hashes agree across all repeats and each unhooked reference agrees. Repeats are not independent scenes. Each scene defers **three** pairs, **six** total.

The protocol was frozen before replication tracking. The first attempt stopped during scene-11 reporting with a missing `frame_matches` import after six successful tracking runs. Add only that existing-function import, retain the [initial snapshot](../validation/v0.3-recovery-moving-protocol.initial.json) and amendment, then rerun everything. Control, parameters, inputs, diagnostic definitions and evaluation algorithms are unchanged; first-attempt prediction/trace/scenario-file hashes match the repaired run exactly. This is local freezing, not external preregistration or a failure-free execution claim.

Use the original pinned [TrackEval](https://github.com/JonathonLuiten/TrackEval/tree/12c8791b303e0a0b50f753af204249e622d0281a), official MOT17 preprocessing, CLEAR IoU .5 / Identity / HOTA; diagnostic counts reconcile exactly. Combine with official combiners, **never average scene rates or pool MOT20 scores**. Apply the same screen per scene and combined: actual trigger, strictly lower FP, no FN/IDSW increase, no IDF1/HOTA decrease, no paired same-ID event-recovery loss. All must pass.

## Scores and the HOTA regression

Reference → candidate; retain enough precision and introduce no post-result tolerance:

- **Mall 11:** FP **388→384**, FN **4,073→4,073**, IDSW **18→18**, fragmentation **31→31**; recall **56.8355%** unchanged, IDF1 **52.9400→52.9540%**, HOTA **47.1473→47.1596%**. Scene screen passes.
- **Bus 13:** FP **155→151**, FN **9,622→9,622**, IDSW **3→3**, fragmentation **47→47**; recall **17.3510%** unchanged, IDF1 **26.1851→26.1927%**, HOTA **24.9588→24.9473%** (about **−.01145 percentage points**). Fails HOTA non-regression.
- **Combined:** FP **543→535**, FN **13,695**, IDSW **21**, fragmentation **78** unchanged; recall **35.0270%**, IDF1 **40.1945→40.2055%**, HOTA **36.8828→36.8842%**. Combined screen passes, but **overall screen fails** because one scene fails.

Immutable-location pairing: FN added/removed **0/0**, IDSW **0/0**; FP added **2**, removed **10**. Both added bus-view FP have **.10≤IoU<.50** partial overlap with an evaluated pedestrian, were not emitted by the reference after preprocessing, and have no IoU≥.5 excluded-annotation overlap. Metric FP is not proof no real person is present.

Post-hoc re-evaluation exactly reproduces every official score. Bus-view mean-over-thresholds DetA **13.8574→13.8488%**, AssA **45.0321→45.0188%**, DetRe/AssRe also slightly decrease while DetPr/AssPr increase. Unchanged CLEAR .5 FN/IDSW does not guarantee unchanged multi-threshold HOTA association quality; do not attribute all of its movement to those two FP. Neither screen nor control was relaxed.

## Long events, crossings and the earlier added errors

Keep existing GT visibility/overlap-order proxies and separate IoU .5 endpoint matching. They are not audited physical occlusion or 3D crossing:

- **Long low visibility:** 11 has six events, four complete endpoint pairs, **zero same-ID / four changed-ID**; 13 has three events, **zero complete pairs**. Both arms are identical: **no new same-ID recovery across nine events**. Event matches are **18/369** and **0/126**, respectively; long-occlusion acceptance remains open.
- **Crossing proxy:** 19 events / 38 subjects; **19** complete pairs / **14** same-ID, unchanged. Paired gains/losses both zero; zero added errors is not recovery improvement.

There are no newly added FN/IDSW cases in these moving scenes to classify. Separately perform **post-hoc diagnosis, without tracking/retuning**, on the earlier MOT20-01 raw outputs; all original official scores reproduce exactly:

- **22 added FN:** two directly deferred now; 12 reference detections are unmatched/unemitted in the candidate weak stage; eight remain emitted with confirmed IDs but lose the original GT's official match. Distinguish preprocessing, continuity priority and other-GT competition. Not all 22 are directly blocked at that frame.
- All 22 have IoU≥.5 **weak-only** raw support, no strong support; all overlap other GT, 11 are low visibility. They form **five** contiguous per-GT episodes, longest **nine frames**. These are correlated contexts/geometric support, not guaranteed feasible one-to-one association.
- **One added switch:** a gap with raw support; uses the **same immutable current detection** as reference, without any same-frame deferral. It has overlap/crossing and a geometrically supporting deferral within one second. Inspect subsequent association history rather than assigning it to a missing current detection. Proximity and prior official GT ownership do not prove physical causality.

## Implementation checks

Local application suite: **330 passed / 13 optional skipped**; real pinned-library recovery/admission/probe/diagnostic tests: **31 passed**. With SciPy deliberately unavailable, related base tests: **24 passed / 7 opt-in skipped**. Tests distinguish direct deferral, unmatched weak outputs, retained detections and history switches without comparing native IDs across arms; original weak continuation/hook restoration contracts remain passing. Public manifest/links, reviewed development source archive and synthetic-only site build pass. No release asset or site deployment is performed.

## Reproduction and next step

All input/cache/GT/metadata/original-implementation hashes remain unchanged. Raw matrices, frame/ID mappings, exact event windows and cases stay local. Use the frozen separate NumPy 2 runtime:

```bash
python tools/validate_tracking_recovery_replication.py \
  --protocol docs/validation/v0.3-recovery-moving-protocol.json \
  --manifest local/mot17-moving.json --trackeval-root local/TrackEval \
  --work-dir artifacts/recovery-moving/run --output artifacts/recovery-moving/aggregate.json
python tools/audit_tracking_recovery_errors.py \
  --manifest local/mot17-moving.json --record artifacts/recovery-moving/aggregate.json \
  --runs-dir artifacts/recovery-moving/run --trackeval-root local/TrackEval \
  --work-dir artifacts/recovery-moving/audit --output artifacts/recovery-moving/errors.json
```

The audit also supports the original MOT20-01 record. HOTA decomposition/prior-case classification are deterministic post-result analyses, not retroactive preregistered criteria. The unrelated optional BURST `pycocotools` import warning is retained; the requested loader/three metrics execute. Publish only reviewed aggregates/hashes/numeric plots; existing releases/tags are unchanged.

Next inspect post-deferral state/association histories, unmatched weak detections and GT competition, plus bus-view multi-threshold DetA/AssA losses, before separately freezing a more targeted control. Detector localisation/resolution is a separate intervention. Do not blanket-remove weak continuation. No default promotion or general long-occlusion/moving-camera reliability claim; physical RTSP, Windows inference/worker, calibrated 3D, endurance and throughput remain unverified.
