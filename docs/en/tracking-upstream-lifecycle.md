# Read-only KITTI upstream lifecycle diagnosis — 2026-10-19

[繁體中文](../zh-TW/tracking-upstream-lifecycle.md) · [ROADMAP](../../ROADMAP.md) · [Previous exposure gap](tracking-exposure-gap.md) · [Frozen definitions](../validation/v0.3-upstream-lifecycle-protocol.json) · [Full aggregate](../validation/v0.3-upstream-lifecycle.json)

**The two upstream gaps are different.** KITTI-0004 has sparse weak-input/hypothesis co-occurrence, zero overlap on every missed weak-input row, and actual lifecycle removals. KITTI-0005 never receives a high-stage birth seed. Neither source reaches the existing competition controls. No threshold, buffer, control, default, detector or input changed; weak continuation remains intact. This is descriptive mechanism diagnosis, not identity accuracy, independent exposure confirmation or harm acceptance.

## Definition freeze and observational equality

Local definition seal **`d296d92d0e595c3f53ab9ce727a8cb0e8522007c8f7cd484d74f57f097467a72`** followed 15 synthetic/pinned-runtime contracts and preceded all new source tracking/telemetry. The prior exposure-gap findings were already known; this is not external preregistration or an unseen-source test. The original source protocol, confirmation ledger/lock, previous diagnosis, new observer/runner/tests, runtime versions and native lifecycle/IoU implementations are hash-bound. Original frozen files remain unchanged.

All **611 original frames**, unchanged immutable detection caches and source videos were checked, in original order. Each source ran three full isolated passes: unhooked reference, observed reference, observed reference again. There was no inference, GT/annotation read or evaluator invocation. There were no source failures, exclusions, substitutions, retries or parameter changes.

- Every pass's complete canonical confirmed-object prediction text exactly equals the original sealed reference, including full frame order and zero-object frames. The original prediction hashes remain `d8994eab…58a9` (0004) and `341a4f52…642e` (0005).
- All native outputs, including unconfirmed detections, are byte-identical across the three new passes. Final native tracker pickle bytes after hook removal are identical too; pickles stay local and are not loaded from external input.
- Both observed passes produce identical complete lifecycle bytes and aggregate counts. All **268 original association stages** reproduce their matrix, gate, matches, partitions, ownership and pre-update state. Captured prediction geometry recomputes the native IoU exactly in every stage.
- Hooks belong only to each research tracker instance. They copy observations and forward original calls/arrays/return objects; the native predictor, assignment, births and prune execute unchanged. Exit restores method ownership even on failure. No observer is installed in the app or worker.

The saved prediction objects from all three passes also compare directly equal to the original saved prediction objects, including the original Object ID strings, before canonicalization. These checks establish output equivalence for these inputs/runtime, not a universal proof, throughput benchmark or quality result. Repeated passes do not add independent evidence.

## KITTI-0004: availability, geometry and lifecycle

The 314 frames have **191 inputs: 27 high / 164 weak**, with weak inputs in 68 frames. There are **10 native births**, all from unmatched high inputs, no activation rejection, and **7 later confirmations**. Native matching accepts 17 high and 5 weak updates; 3 weak updates are to already-confirmed hypotheses. Birth, confirmation and accepted update are separate events, not counts of true physical objects.

The 68 weak-input frames partition completely:

- **13** have remaining weak-stage hypothesis rows.
- **1** has all available hypothesis rows consumed by high-stage updates.
- **6** have no hypothesis and no earlier birth.
- **48** have no hypothesis after all earlier hypotheses have been removed. This describes state availability, not whether later detections depict the same person.

There are **70 confirmed missed-row observations** in the remaining weak stage: **57 without weak input** and **13 with weak input**. All 13 have **exactly zero predicted IoU** against every current weak input, rather than a small positive score just below the original gate. All last accepted observation boxes also have zero best IoU against the same current weak columns; prediction-versus-last-box best overlap is equal in all 13. There is no gate-supported opportunity or evidence here that merely changing the existing positive gate would safely recover the physical identity.

**6 of the 13 predicted boxes have non-positive width or height** (2 width, 4 height). For the deterministic first best weak column, horizontal disjointness occurs in 12 rows and vertical disjointness in 6; these categories overlap and that tie choice is not an identity match. Invalid native geometry is a concrete estimator-health diagnostic target. It does not explain all zero-overlap rows: the corresponding last accepted boxes also fail to overlap, and the data do not establish which detections belong to the same object or whether camera motion/detector localization caused the gap. No box was clipped, reordered or substituted.

All 10 born hypotheses are eventually removed: **3 immature/unmatched at age 1**, **7 confirmed/expired at age 11**; no combined-expired/immature removal, unconfirmed expiry or end-of-source survivor. The seven expiries are 11 original frames after their last accepted update. Four removals occur on a frame with some weak input; co-occurrence alone is not an admissible association or a preventable loss.

The native fixed10Hz buffer30 budget is **10 frames**. Prediction advances the age, association runs, then the inclusive `age <= 10` post-update keep predicate runs. Thus an unmatched age11 hypothesis expires, while a successful age11 match can reset its age first. The synthetic last-chance contract verifies that distinction. This refines the [buffer erratum](../validation/v0.3-buffer-semantics-erratum.json); it does not change the executed budget or certify a physical timeout.

## KITTI-0005: no high-stage initialization

The 297 frames contain **46 weak inputs in 39 frames**, zero high inputs, zero birth candidates, births, hypothesis rows, accepted updates, confirmations or removals. All 39 weak-input frames are in the never-born state. The weak inputs are still delivered intact; native birth only considers unmatched high-stage inputs. There is no hypothesis to retain or expire, so extending a buffer or altering downstream past-support/protection cannot create exposure in this observed history. This does not establish absence of people, a detector error or a safe lower high/activation threshold.

## Decision and remaining gates

**Keep current controls, weak continuation and defaults.** The upstream gap is now separated into missing simultaneous weak observations, no initialization, immature loss, fixed-budget expiry, and geometric non-overlap; the downstream controls remain unexposed in both sources. Do not interpret these counts as GT misses, false tracks, ID switches, measured harm or release acceptance.

Next freeze a read-only estimator/observation-health audit on these same caches: locate the first non-positive prediction dimensions relative to accepted state updates, and account for observation gaps around native birth/removal. Require the same reference-output/state equality before considering a separate intervention. Current evidence does not identify a safe prediction repair, buffer extension or detector threshold. That further state-estimator audit/repair is **not implemented or executed in this study**.

All sources remain seen. A fresh exposure search still needs frozen discovery plus untouched confirmation; independent exposure, usefulness, scene-wise/paired harm, bus-HOTA/long-occlusion, hardware and calibrated3D acceptance remain open.

## Reproduction and public boundary

```bash
python tools/diagnose_tracking_upstream.py run \
  --protocol docs/validation/v0.3-upstream-lifecycle-protocol.json \
  --seal artifacts/tracking-upstream-lifecycle/freeze.local.json \
  --inputs artifacts/tracking-past-exposure/confirmation-inputs.local.json \
  --raw-root artifacts/tracking-past-exposure/confirmation \
  --work artifacts/tracking-upstream-lifecycle/new-run \
  --output artifacts/tracking-upstream-lifecycle/reproduced.local.json
```

Use the original pinned NumPy2 research runtime and immutable local inputs; existing output directories are refused. Original [source terms and attribution](tracking-past-exposure.md#reproduction-terms-and-public-boundary) still apply: local noncommercial research, no redistribution/relicensing of media, GT or raw outputs. Public files contain the frozen definitions, source hashes, all-source fixed counters/histograms, equality flags and this report. Predictions, boxes, frame locations, IDs/tokens, matrices, native state pickles and raw diagnostics remain ignored local artifacts. No private data is added to the public source archive.

Validation: **15 new pinned contracts passed;136 related pinned contracts passed;431 base application tests passed/40 optional skipped.** Public manifest, local links, obvious-secret-pattern check and source-only archive checked. The archive contains325 allowlisted files and no raw artifacts/media/pickles/weights. These code checks are separate from tracking quality acceptance.
