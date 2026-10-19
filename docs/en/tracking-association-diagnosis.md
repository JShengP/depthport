# Promotion and recovery association-cost diagnosis — 2026-10-19

[繁體中文](../zh-TW/tracking-association-diagnosis.md) · [Roadmap](../../ROADMAP.md) · [Previous admission study](tracking-admission-acceptance.md)

**Next research control point: ByteTrack's missed-frame recovery in the weak-association stage when an active confirmed hypothesis competes at a low margin.** Preserve normal active-track weak updates and retain weak detections for recovery research. This is an observational target, not an implemented fix or accepted policy: the flagged cohort also contains same-GT endpoint recoveries. Application/worker defaults and predictions remain unchanged.

[Frozen capture protocol](../validation/v0.3-association-diagnosis-protocol.json) · [Aggregate costs/counts and stage breakdown](../validation/v0.3-association-diagnosis.json)

![Aggregate promotion, recovery and competing-hypothesis evidence](../assets/tracking-v03-association.png)

## Inputs and what was actually rerun

Reuse the exact **YOLO26n CPU / Ultralytics 8.4.176** detector caches, official GT and licensed MOT17-09/10 compressed previews from the [admission experiment](tracking-admission-acceptance.md): **1,179 continuous frames**, one fixed-view and one moving-camera scene. These are previously studied training scenes, not an independent validation group. Detector settings/weights, association gates, confirmation values and source FPS are unchanged.

For each backend, observe **activation control** (.30 activation/.60 split/confirmation 2) and **confirm 3**, with the same one-second reference buffer and original CMC settings: **2 scenes × 2 backends × 2 profiles × 2 repeats = 16 runs / 9,432 frame updates**. Do not count repeats or related profiles as independent samples. All eight unique outputs exactly reproduce the previous canonical predictions and official CLEAR/Identity/HOTA; both full probe-trace hashes agree per scene/profile. No new accuracy gain is claimed.

[MOTChallenge's official page](https://motchallenge.net/data/MOT17/) states [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/); original-source conditions may also apply. Attribution: MOTChallenge; Milan, Leal-Taixé, Reid, Roth and Schindler, [MOT16 benchmark](https://arxiv.org/abs/1603.00831). Local non-commercial research only; source imagery, GT and raw diagnoses are not redistributed or relicensed under the code's AGPL. The retrieved terms-page hash, source/cache/GT/weight hashes, original runtime and reused-environment limits are linked through the protocol/reference record.

## Observe the actual decision, without changing it

The opt-in **instance-only** probe targets Roboflow Trackers 2.6.1. It forwards the original matrix, gate and assignment result unchanged, restores original instance attributes even on failure, and does not modify the upstream registry. Tracking receives only the original frames/detections; GT is joined afterwards. Ordinary weak continuation remains upstream behaviour, including BoT-SORT's exclusion of already-lost hypotheses from its weak stage.

Raw local JSONL contains each stage's full similarity/cost matrix, gate, chosen/unmatched rows and columns, original detection indices, private track tokens/IDs, counters and retained age. BoT-SORT's actual stage row/column mapping is checked against the original detections. Full matrices/events stay local; public records contain reviewed counts/distributions and hashes only.

- **Cost:** `1 − actual similarity` is an equivalent fixed-cardinality assignment objective. ByteTrack uses IoU; BoT-SORT high/unconfirmed stages use score-fused IoU, while its weak stage does not. These are neither appearance/Mahalanobis costs nor calibrated probabilities; do not compare a universal cost threshold across stages/backends.
- **Promotion:** a matched tentative hypothesis acquires a confirmed ID. BoT-SORT's six instant first-frame activations per profile are counted separately and excluded from promotion-cost statistics.
- **Recovery:** an already-confirmed retained hypothesis is matched after at least one fully missed prior frame. This is a missed-frame proxy, not proof of physical occlusion. Expired hypotheses have no matrix row and are outside this opportunity cohort.
- **Low margin:** selected similarity minus the best other gate-admissible edge in its row/column is ≤.05, possibly negative. Alternatives can be assigned elsewhere; the .05 value is a frozen diagnostic definition, not a proposed production threshold.
- **Active competitor in weak recovery:** confirmed and matched in the immediately preceding frame (predicted age 1 in this stage's pool). This does not prove ownership of the current detection.
- **Endpoint label:** official CLEAR TP/FP/exclusion at that observation. For recovery TP, compare current GT with the track's last known official TP GT. A different previous GT is not automatically a counted ID switch or proof of physical identity error; earlier ownership may already be wrong. Promotion TP is not proof of later track purity.

## Promotion: no evidence for another blanket cost gate

In activation-control / confirm-3 order:

- **ByteTrack:** promotions **77 / 76**: TP **59 / 61**, FP **14 / 11**, excluded **4 / 4**. All promotion low-margin counts are **zero**. Control median selected cost is **.1351 for TP, .1044 for FP**; lower cost is not a reliable purity label here.
- **BoT-SORT:** promotions **66 / 61**: TP **51 / 54**, FP **13 / 5**, excluded **2 / 2**, plus **6 / 6** separately counted instant births. All promotion low-margin counts are **zero**. Control median TP/FP cost is **.4034 / .4239**; confirm-3 median is **.3883 / .3815**. Distributions overlap, so a single stricter cost cutoff is not justified by these observations.
- Prior-stage gate-admissible confirmed hypotheses appear for **1 / 3 BoT-SORT TP promotions and zero FP promotions**. A blanket veto on those hypotheses would hit observed TP, not identify the FP promotions.

These are **promotion events**, not the previous study's whole-sequence FP/FN observation counts. Longer confirmation still has the previously recorded coverage/identity trade-off; no default is promoted.

## Recovery: where the competition signal is

Activation-control totals, without pooling backend or repeat cohorts:

- **ByteTrack: 146 recoveries** = **45 same-previous-GT TP, 19 different-previous-GT TP, 1 TP without prior official identity, 70 FP, 11 excluded**. **140** occur in the weak stage: **43 same-GT, 16 different-GT, 1 unknown-prior TP, 69 FP, 11 excluded**. Correct-endpoint and FP costs overlap; their overall median selected costs are **.4379 / .6429**, with same-GT P95 **.8600**.
- **BoT-SORT: 33 recoveries**, all high-stage = **19 same-GT TP, 10 different-GT TP, 3 FP, 1 excluded**. Its low-margin subset has **2 same-GT and 1 different-GT, zero FP**. Do not transfer ByteTrack's diagnostic flag to this backend. Confirm 3 has 32 recoveries with one fewer same-GT endpoint; full counts remain in JSON.

For ByteTrack's **weak-stage** recovery:

1. The low-margin subset contains **38 events: 28 FP, 5 different-GT TP, 5 same-GT TP**.
2. Requiring an **active confirmed competing hypothesis** narrows this to **34 events: 24 FP, 5 different-GT TP, 5 same-GT TP**. Candidate types can co-occur with alternative detections; count each event once.
3. This same 34-event composition occurs under confirm 3. On 09 the counts are **12 / 5 / 1**; on 10, **12 / 0 / 4** in FP/different-GT/same-GT order. These are related observations on the same clips, not independent replication.

This identifies a place to test **competition-aware deferred reattachment of missed hypotheses**, using observable state/history and stage-specific costs, while keeping ordinary active-track weak continuation intact. It does **not** imply that removing these outputs would improve the tracker: a blanket veto also touches **five same-GT recoveries**, and subsequent assignments/FP/FN/IDSW would change. No counterfactual score gain or physical causal diagnosis is claimed.

## Missing opportunities and non-findings

Recovery opportunities count **frames × retained confirmed hypotheses**, not unique people or independent events. Control totals are ByteTrack **2,453**, BoT-SORT **2,142**. In ByteTrack / BoT-SORT order:

- No prior official TP: **194 / 116**; prior GT not annotated now: **691 / 693**.
- Among **1,568 / 1,333** opportunities with a prior official TP and current GT, no raw IoU≥.5 support: **699 / 605**; weak-only support: **314 / 308**.
- Strong geometric support exists but no corresponding high-stage admissible edge: **443 / 292**; admissible but not selected for this hypothesis: **110 / 107**; supported strong edge selected: **2 / 21**.
- BoT-SORT's **308** weak-only lost opportunities are outside its upstream weak stage. This is a recorded lifecycle rule, not evidence that enabling weak lost recovery would be safe or successful.
- Every captured stage has **zero gate-valid edges between both-unmatched endpoints after solve/filter**. There is no observed residual-edge exposure here for a residual-rematching repair.

Raw support uses the last-known GT box, is not one-to-one association, and can reflect partial-body/full-body localisation mismatch, prediction drift, competing ownership or annotation limitations. It does not prove a detector missed a person or that a gate change could recover the observation. Long-occlusion hypotheses that expired earlier are not represented; general long-occlusion acceptance remains open.

## Reproduce and next controlled test

Use the same licensed local inputs/manifest and isolated NumPy 2 / Trackers 2.6.1 environment as [the previous study](tracking-admission-acceptance.md), plus clean pinned [TrackEval](https://github.com/JonathonLuiten/TrackEval/tree/12c8791b303e0a0b50f753af204249e622d0281a). The tool verifies input/configuration hashes, official GT/metadata, reference predictions, repeated trace hashes and all official metrics; no network operation occurs. Capture source was frozen before runs. Stage breakdown is deterministic post-processing of those local traces/events, not another intervention or parameter search. The public curated record adds protocol links, interpretation and verification to the base tool output.

```bash
python tools/diagnose_tracking_association.py \
  --manifest local/mot17-admission.json \
  --admission-record docs/validation/v0.3-mot17-admission.json \
  --trackeval-root local/TrackEval --work-dir outputs/association \
  --output outputs/association.json --repeats 2
python tools/summarize_association_stages.py \
  --record outputs/association.json --work-dir outputs/association \
  --output outputs/association-stages.json
RUN_TRACKERS_CONTRACTS=1 python -m pytest -q tests/test_tracking_association_probe.py
python tools/plot_association_diagnosis.py \
  --record docs/validation/v0.3-association-diagnosis.json \
  --output outputs/association-counts.png
```

Before changing behaviour, freeze a separate control protocol for the ByteTrack missed-hypothesis weak-stage competition point, retain an unchanged control, and report FP/FN/IDSW/IDF1/HOTA plus paired recovery gains/losses on an **independent licensed sequence group**. No GT may enter runtime admission/recovery decisions. Separately investigate localisation and hypothesis expiry; do not drop all weak detections, tighten every promotion gate, add buffer/ReID blindly or promote a default from this diagnosis. Physical RTSP, Windows real inference/worker integration, endurance, hardware WebGL and calibrated 3D accuracy remain unverified. No new release or tag replacement is made.
