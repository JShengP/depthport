# Independent causal handoff candidates — 2026-10-22

[繁體中文](../zh-TW/tracking-handoff-controls.md) · [ROADMAP](../../ROADMAP.md) · [Prior handoff diagnosis](tracking-handoff-audit.md) · [Shared freeze](../validation/v0.3-handoff-controls-protocol.json)

## Separate rules and available information

Two immutable hypotheses are frozen separately: [birth/continuation](../validation/v0.3-birth-continuation-rule.json) and [past-competition handoff](../validation/v0.3-past-handoff-rule.json). Each runs independently over the unchanged geometry-projected ByteTrack baseline; there is no combined arm or application/worker/default integration.

**Birth/continuation:** after the native high-stage assignment, only mutually unique eligible edges among free rows/columns can add an acceptance. The high detection must clear the original activation threshold; the existing owner must be pre-confirmed, have a strictly earlier accepted observation and positive predicted geometry. The edge clears the unchanged native IoU gate. Do not remove an original high accepted pair. Native update executes once, so the detection continues an owner instead of entering unmatched-high spawn.

**Past-competition handoff:** replace a selected high edge only with its unique free competitor when both owners are pre-active/confirmed, both have accepted distinct inputs at the previous frame, and at the selected owner's previous high acceptance the competitor was active-confirmed, gate-admissible and within the existing0.05 margin. The competitor's previous accepted update may be weak. The current alternative must also pass native gate/margin and cannot be claimed by another edge. Keep every other high accepted pair/cardinality; return the selected row to native weak availability. No additional solver assignment is installed.

Both exclude an alternative row with any current gate-admissible weak input. Current high/weak detections, native assignment and predicted geometry are available at that decision; accepted history/support contexts commit only after the entire frame. No birth-only support, cross-run bridge, future non-repetition, GT, guessed expiry, fitted duration or new confidence/IoU threshold. The native weak association/result is never intercepted. Later weak losses are measured rather than assumed impossible.

## Fixed unseen sources and terms

All recorded KITTI0000–0009 and sixteen MOT sources are already seen. Fix the next full lexical KITTI0010/0011:294/373 original frames,667 unique frames, native10Hz. Only ZIP directory metadata is inspected before freezing, with local existing-output-name checks finding no prior0010/0011. Do not replace, crop, search or select sources by detector/control outcomes. These are source-held-out within the same dataset/camera family, not independent sites, people or datasets and not external preregistration.

Use official image-only ZIP immutable ETag/ranges, full PNG CRC/SHA manifests and lossless FFV1 bgr0 pixel verification. Freeze the unchanged YOLO26n8.4.176 CPU recipe, confidence0.1,640px, person class0, cap64, NMS0.7 and original weights. A separate local detector environment uses NumPy1; tracking stays in the original NumPy2/Trackers2.6.1 runtime. No labels archive, GT or evaluator is read, and no inference occurs during tracking.

[KITTI official terms](https://www.cvlibs.net/datasets/kitti/): CC BY-NC-SA3.0, local noncommercial research and reviewed aggregates only. Attribute Andreas Geiger, Philip Lenz, Raquel Urtasun, *Are we ready for Autonomous Driving? The KITTI Vision Benchmark Suite*, CVPR2012. Repository AGPL does not relicense KITTI; no media, weights, caches or raw result redistribution.

## Per-scene harm and exposure gates

Against each source's own projected baseline, require zero lost accepted input keys, weak-stage accepted inputs or confirmed-output inputs; zero new birth keys; zero numerical failures/invalid accepted posteriors; no added nonpositive predictions; and zero lost protected **other** high accepted pairs. The intended replaced handoff edge is explicit. Record complete lost/new stage/lineage memberships, not only count differences. No cross-scene compensation.

**Historical strict seed-key active-update gates remain computed unchanged and separate.** The new observable-input/protected-update screen does not pass or replace old study gates. A deliberate owner change can fail that historical proxy while preserving inputs; neither screen establishes correct identity, FP/FN/IDSW/HOTA or true harm without GT.

For each candidate independently, BOTH fixed sources must finish all passes with at least one actual changed assignment, cap0, native/repeat equality and every new per-scene gate true. Zero triggers are failed exposure, not replicated safety by equality. No default promotion follows even if this observable screen passes; true quality remains unverified.

## Integrity and publication

Seal all complete unhooked native references before any candidate execution. Two observed native runs must reproduce complete prediction JSON, raw outputs and final tracker pickle. Two fresh isolated repeats for each geometry baseline/A/B arm must match complete outputs, state, histories and event receipts; OpenCV one thread/seed0. Keep all scheduled sources, zeros, failures/nulls; refuse overwrite/retry.434 original sealed files and all prior public/code records are verified before/after; old pickles are hashed only. Original failures, incomplete discovery and false replication flags remain.

Raw images, frame/owner/ID/cost/state histories, predictions, exceptions and diagnostics stay in ignored local artifacts. Only reviewed source aggregates, gates, denominators and hashes are public. Pre-freeze tests include artificial-matrix operator coverage, which is not real-source exposure. Initial five generated-fixture failures were corrected before freeze (missing synthetic class IDs and artificial costs below the actual native gate), with the original failure receipt retained; no real-source tuning occurred.56 related generated/native contracts then passed. Results and actual CI are recorded separately after the published method freeze.
