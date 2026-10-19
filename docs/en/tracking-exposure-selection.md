# GT-free competition exposure selection — 2026-10-19

[繁體中文](../zh-TW/tracking-exposure-selection.md) · [ROADMAP](../../ROADMAP.md) · [Previous controls](tracking-exclusive-competition.md) · [Frozen rules](../validation/v0.3-exposure-selection-protocol.json) · [Input lock](../validation/v0.3-exposure-input-lock.json) · [Discovery ledger](../validation/v0.3-exposure-discovery.json) · [Reserved confirmation](../validation/v0.3-exposure-confirmation.json) · [Post-selection audit](../validation/v0.3-exposure-audit.json)

**The complete frozen search and separated confirmation are finished; neither control has independently replicated exposure.** Availability vetoes occur eight times across six discovery sources, selecting MOT17-10 by fixed order. Both reserved sources have zero vetoes. Equivalent assignment has zero vetoes across all 16 sources and retains a `null` discovery selection. These are negative confirmation results, not reliability/fix acceptance. Controls, weak continuation and defaults are unchanged.

![Complete reference-candidate and actual-veto ledger](../assets/tracking-v03-exposure-selection.png)

## Freeze before searching

Local protocol SHA-256: `279e5d8d81fceb2409a0259a84d78ceee1a48ca4d04d81e2e1be91364ad4f36c`. Candidate order, source-family declarations, reserved group, implementation/runtime/upstream hashes and eligibility were frozen before any study exposure scan. Source/cache hashes were locked separately after preparation, still before discovery. This is a local freeze, not external preregistration.

- **Cohort/stopping:** inspect all 14 discovery sources, including zeros/failures. No early stopping, replacement or favourable post-result additions. No source failed in this study.
- **Selection:** independently per new arm, select the first listed discovery source with at least one actual veto / one veto frame on its own complete history and three identical canonical prediction/full-trace/count repeats. Reference hypothetical opportunities do not qualify; do not rank by event count. No qualifying source means `null`.
- **Data separation:** the input schema permits only source videos, detection caches and hashes, rejecting GT fields. The scanner/selector has no evaluator and reads no GT, FP/FN, IDSW, IDF1 or HOTA. Previously scored sources serve discovery only; historical outcomes are already known and are not rescored here.
- **Reserved confirmation:** seal complete discovery JSON and deterministic selections first, SHA-256 `fe8b549aab7da1ab9a4434c6475418bebde75bedb4528e36159bb18163563ac5`. Only then run all three arms on BOTH predetermined MOT20-03/05 sources, regardless discovery success. Exposure replication requires a discovery example and actual vetoes in both reserved sources; confirmation cannot refill discovery slots.

Sequence IDs and declared official-description source families are disjoint across phases. Shared dataset/detector/runtime and non-random group choice limit independence; no claim of independent datasets, camera sites or participants.

## Unchanged controls and full continuity

Retain activation `.3`, high `.6`, buffer `30`, confirmation `2`, weak IoU `.10`, column margin `.05`, equivalent-solver roundoff `1e-12` and the two [original separate definitions](tracking-exclusive-competition.md#four-separate-arms). Do not combine them, rematch residual edges, add ReID/CMC/GT or change lifecycle. All original weak inputs, active weak continuation and uncontested recovery are preserved.

Same YOLO26n / Ultralytics 8.4.176 CPU, confidence .10, imgsz 640, class 0, max_det 64, NMS .7, weight hash and NumPy 2 study runtime. No app/worker registration or environment upgrade.

**17,984 full source frames, 371,458 cached detections, zero capped frames.** Discovery: 12,264 frames / 14 sources; confirmation: 5,720 / two. Three arms × three repeats × 16 sources = **144 full-sequence runs**. Repeats do not add independent samples; counts use one identical result per arm/source.

Bounded storage shards retain existing ≤1,800 frames / ≤32 MiB per cache and ≤64 detections per frame. Decode entire original previews without clipping, re-encoding or subsampling; keep the same tracker/source index/probe across boundaries. Weak continuation/gap recovery contracts reproduce unsharded results; the cache writer exactly reproduces all original detections/metadata on 429 existing frames. MOT17-04 predictions and full traces exactly reproduce prior frozen hashes for all three arms.

## Complete inspected ledger

| Phase | Source | Frames | Legacy candidate edges¹ | Availability vetoes² | Equivalent vetoes² |
| --- | --- | ---: | ---: | ---: | ---: |
| discovery | MOT17-09-DPM | 525 | 18 | 0 | 0 |
| discovery | MOT17-10-DPM | 654 | 16 | 1 | 0 |
| discovery | MOT17-11-DPM | 900 | 4 | 0 | 0 |
| discovery | MOT17-13-DPM | 750 | 4 | 0 | 0 |
| discovery | MOT17-04-DPM | 1,050 | 1 | 0 | 0 |
| discovery | MOT20-01 | 429 | 5 | 0 | 0 |
| discovery | MOT20-02 | 2,782 | 55 | 2 | 0 |
| discovery | MOT20-06 | 1,008 | 16 | 1 | 0 |
| discovery | MOT20-07 | 585 | 1 | 0 | 0 |
| discovery | MOT20-08 | 806 | 6 | 1 | 0 |
| discovery | MOT17-07-DPM | 500 | 10 | 0 | 0 |
| discovery | MOT17-08-DPM | 625 | 24 | 2 | 0 |
| discovery | MOT17-12-DPM | 900 | 4 | 0 | 0 |
| discovery | MOT17-14-DPM | 750 | 9 | 1 | 0 |
| confirmation | MOT20-03 | 2,405 | 5 | 0 | 0 |
| confirmation | MOT20-05 | 3,315 | 0 | 0 | 0 |

¹ Eligible legacy-column edges on the reference history, not actual vetoes. ² Actual vetoes on each treatment's own history; do not pool arms as independent events/people. Exact frames/IDs/locations remain local. All three full prediction/trace/count repeats agree.

- Availability exposure: MOT17-10, MOT20-02, MOT20-06, MOT20-08, MOT17-08 and MOT17-14, eight vetoes. Fixed order selects previously studied discovery source MOT17-10, not the highest-count sources. This establishes natural reachability, without GT deciding whether a veto is correct.
- MOT20-03 has five legacy candidates, all with occupied competitors; neither new control triggers. MOT20-05 has no legacy candidates. Both treatments equal reference in reserved confirmation: **exposure does not replicate**. Do not relabel reserved sources or substitute a favourable confirmation source.
- Equivalent-assignment predictions equal reference on all 16 sources, with no natural veto. This is not evidence of effectiveness, absence of side effects or HOTA benefit.

## Why equivalent assignment remains unexposed

After sealing selection, a **post-selection descriptive audit** reads hash-verified local traces, without tracking or GT. Reference histories contain **178 eligible edges / 197 competitor alternatives**. All 192 discovery alternatives have positive full-assignment opportunity cost, about `.0002982–.9673191`; all five reserved alternatives are positive too, `.1547125–.8074592`. No equal-objective/fewer-admissible-pairs case or admissible equivalent alternative occurs.

The rule demands essentially no full-objective loss; none of these candidate alternatives satisfies it. This does not assert that every matrix has a unique optimum, or that the implementation is broken. Costs across matrices are not calibrated probabilities or universal risk scores; do not choose a new tolerance from the smallest observed loss. Availability's changed-history counts are reported separately, not imposed as reference counterfactuals.

## Provenance, terms and correction

Full official [MOT17](https://motchallenge.net/data/MOT17/) / [MOT20](https://motchallenge.net/data/MOT20/) compressed previews. Every selected row has no additional third-party source link. Official [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/), local non-commercial research; no source media, GT, detections, tracks or matrices redistributed. The protocol/input lock record terms-page hashes, order, exclusions, every source/cache hash and preparation status. Attribution: MOTChallenge; Milan, Leal-Taixe, Reid, Roth and Schindler, [MOT16](https://arxiv.org/abs/1603.00831); Dendorfer et al., [MOT20](https://arxiv.org/abs/2003.09003). Application AGPL does not relicense datasets.

MOT17-01/02/03/05/06 were not scanned because original third-party terms were not independently verified. MOT20-04's square family was reserved for MOT20-05 confirmation, so it was not scanned. FRCNN/SDP variants repeat the same imagery and were not counted as new sources. Public test previews are used only for exposure, with no hidden GT or leaderboard submission.

**Correction:** MOT17-04 already appeared in the [earlier general comparison](tracking-expanded-acceptance.md); the previous new-scene claim was inaccurate. The new element was the 8.4.176 cache. Correct prose/figure, preserve original frozen protocol/results with an explicit provenance note; do not retroactively claim independence or change historical scores.

## Decision and next gate

**No pair of independently exposure-replicated controls; no retuning, default promotion or reliability claim.** Availability provides local natural-trigger examples for a subsequent frozen mechanism/error study, but reserved exposure is absent. Equivalent assignment first needs a mechanism study of whether essentially equal-objective ambiguity occurs often enough naturally; relaxing opportunity cost would define a different control and cannot rewrite this result.

For accuracy evaluation, separately freeze complete comparison groups and per-source risk criteria before reading GT; report FN/FP/IDSW/IDF1/HOTA and failures. Exposure is not evidence of benefit; do not pick favourable clips. Low recall/localisation, long occlusion, previous bus HOTA, hardware/Windows/worker/3D/throughput remain unaccepted.

Application tests: **349 passed / 20 optional skipped**; pinned NumPy 2 exposure/audit/recovery/history contracts: **32 passed**. Contracts cover GT-key rejection, missing/reordered/duplicate ledgers, reserved-family leakage, positive versus zero selection, shard gaps/hashes/settings, real weak continuation/gap recovery and exact old-runner/unsharded/sharded prediction/trace equality. Public allowlist/link checks, source packaging and synthetic-only site build pass; no website deployment or release upload.

## Reproduction and public scope

```bash
python tools/select_tracking_exposure.py --phase discovery \
  --protocol docs/validation/v0.3-exposure-selection-protocol.json \
  --inputs local/inputs.json --input-lock docs/validation/v0.3-exposure-input-lock.json \
  --work-dir artifacts/exposure/discovery --output artifacts/exposure/discovery.json
python tools/select_tracking_exposure.py --phase confirmation \
  --protocol docs/validation/v0.3-exposure-selection-protocol.json \
  --inputs local/inputs.json --input-lock docs/validation/v0.3-exposure-input-lock.json \
  --discovery artifacts/exposure/discovery.json \
  --work-dir artifacts/exposure/confirmation --output artifacts/exposure/confirmation.json
```

Only code, frozen rules, complete aggregate count/hash ledgers, numeric figures and limits are public. Source media, GT, detections, exact frame/ID locations, matrices, full assignments, exception details and raw diagnoses stay local; no private paths, credentials or user images/bookmarks. Existing releases/tags remain unchanged.
