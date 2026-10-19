# New-ID confirmation and competition controls — 2026-10-19

[繁體中文](../zh-TW/tracking-admission-acceptance.md) · [Roadmap](../../ROADMAP.md) · [v0.3 README](../versions/v0.3/README.md)

**Decision: keep application/worker defaults unchanged.** Longer confirmation removes some false positives but increases missed observations and reduces combined IDF1/HOTA. The birth-only IoU veto never fires on these inputs, so its predictions equal the reference. No candidate passes the frozen research non-regression screen; general tracking/long-occlusion acceptance remains open.

[Frozen protocol](../validation/v0.3-tracking-admission-protocol.json) · [Aggregate results](../validation/v0.3-mot17-admission.json)

![FN, FP and ID switches for six profiles per backend](../assets/tracking-v03-admission.png)

## Inputs, terms and evidence boundary

This is a **new controlled experiment on previously studied scenes**, not a new independent sequence group: all **1,179 continuous frames** of MOT17-09-DPM (525, fixed viewpoint) and MOT17-10-DPM (654, moving camera), with **18,164 evaluated pedestrian observations**. Both use the official compressed previews and official GT, not original benchmark JPEG inputs or a held-out leaderboard submission. Scores are not pooled with earlier studies.

[MOTChallenge's dataset page](https://motchallenge.net/data/MOT17/) explicitly states [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/); original-source conditions may also apply. Attribution: MOTChallenge; Milan, Leal-Taixé, Reid, Roth and Schindler, [MOT16 benchmark](https://arxiv.org/abs/1603.00831). This use is local non-commercial research. The protocol retains the retrieved terms-page hash, official source URLs and input hashes. No source imagery, GT, exact event windows or individual track/GT IDs are redistributed, and the code's AGPL does not relicense the dataset.

Fresh **YOLO26n CPU / Ultralytics 8.4.176** detections are shared unchanged by all profiles: image size 640, confidence .10, NMS .70, person class 0, cap 64; no frame reaches the cap. The old 8.4.115 caches/scores are not controls for this experiment. CPU inference reuses the documented torch 2.10.0+cu128 / NumPy 1.26.4 environment with a separate 8.4.176 detector layer; it is not a fresh install of the complete Alpha.2 recipe. Tracking remains in the isolated NumPy 2 environment; exact packages, weight/cache/video/GT hashes are in the records.

## Separate interventions

Each backend has six fixed profiles, each run three times: **2 scenes × 2 backends × 6 profiles × 3 repeats = 72 runs**. The protocol was timestamped/hashed locally before real-sequence tracker runs, not independently preregistered. No profile or threshold was changed after observing results.

- **Factory reference:** activation .70, split .60, buffer 30, confirmation 2.
- **Activation control:** activation .30; split .60, buffer 30, confirmation 2 unchanged.
- **Confirm 3 / Confirm 5:** only the upstream confirmation value changes to 3 / 5 relative to the activation control.
- **Competition:** confirmation 2; veto only unmatched high-confidence **births** whose ordinary bbox IoU is ≥.50 with a confirmed retained track. Compare after upstream CMC/association using updated matched states or predicted unmatched states; ignore tentative competitors. A blocked candidate returns its original detection with ID -1 and is reconsidered on later inputs.
- **Confirm 3 + competition:** same birth veto plus confirmation 3; compare both with activation control and confirmation-only.

The direct-library research hook leaves upstream high/low association, source detections, boxes, scores, CMC, lost-track budget and ReID settings unchanged. **Weak detections can still update existing tracks.** BoT-SORT's weak stage still excludes already-lost tracks as upstream specifies; this experiment does not add weak lost-track recovery. Only admission is controlled, not the later competition between already-confirmed tracks.

The parameter is named `minimum_consecutive_frames`, but upstream ByteTrack uses a consecutive-success counter while BoT-SORT uses a successful-update counter. BoT-SORT's instant-first-frame activation exception remains on. Values 3/5 are therefore **counter settings, not a universal promise of exactly 3/5 elapsed frames**. Real-library contracts test delayed admission, low-score continuation, duplicate-birth veto, unchanged inputs and an unchanged upstream registry. The Session worker, selector and application defaults are untouched.

## Whole-sequence results

Each line lists **FN / FP / IDSW; Recall / Precision / IDF1 / HOTA (%)**. FN/FP count observations, not unique people. Metric FP does not prove a nonexistent person. Counts/rates must be read together.

**ByteTrack**

- Factory: **12,116 / 536 / 61; 33.30 / 91.86 / 35.32 / 29.72**.
- Activation control: **10,865 / 816 / 94; 40.18 / 89.94 / 38.28 / 31.80**.
- Confirm 3: **10,924 / 800 / 95; 39.86 / 90.05 / 38.14 / 31.64**.
- Confirm 5: **11,059 / 776 / 93; 39.12 / 90.15 / 37.77 / 31.30**.
- Competition: exactly the activation-control predictions and metrics.
- Confirm 3 + competition: exactly the confirmation-3 predictions and metrics.

**BoT-SORT**

- Factory: **12,626 / 340 / 40; 30.49 / 94.22 / 36.80 / 30.91**.
- Activation control: **11,537 / 428 / 49; 36.48 / 93.93 / 40.23 / 32.91**.
- Confirm 3: **11,723 / 376 / 46; 35.46 / 94.48 / 39.70 / 32.48**.
- Confirm 5: **12,259 / 342 / 43; 32.51 / 94.53 / 37.51 / 31.43**.
- Competition: exactly the activation-control predictions and metrics.
- Confirm 3 + competition: exactly the confirmation-3 predictions and metrics.

Against activation control, confirmation 3 changes FN/FP/IDSW by **+59 / −16 / +1** for ByteTrack and **+186 / −52 / −3** for BoT-SORT. Confirmation 5 changes them by **+194 / −40 / −1** and **+722 / −86 / −6**. Every longer-confirmation arm loses combined IDF1/HOTA; fewer FP or switches alone is not a sufficient improvement.

## Paired errors, gate exposure and event limits

Official TrackEval CLEAR counts reconcile exactly with the diagnostic trace for all 24 sequence/profile outputs. Added/removed FP are paired by **(frame, immutable cache detection index)**; FN/IDSW by **(frame, GT)**, never by numeric tracker IDs across runs. Shared IDSW locations can still have different transitions.

- ByteTrack confirm 3: FN **59 added / 0 removed**, FP **1 / 17**, IDSW **35 / 34**. Confirm 5: FN **215 / 21**, FP **1 / 41**, IDSW **38 / 39**.
- BoT-SORT confirm 3: FN **186 / 0**, FP **0 / 52**, IDSW **24 / 27**. Confirm 5: FN **722 / 0**, FP **0 / 86**, IDSW **25 / 31**.
- Birth competition vetoes **zero** candidates in either scene or backend. Across both scenes per repeat, eligible births are ByteTrack **77**, BoT-SORT **123**; with confirm 3, **77 / 149**. Counters repeat consistently. Canonical prediction hashes prove equality to the respective no-veto arms. This is **no exposure at the chosen birth gate**, not proof that association competition is absent or solved. Do not lower the threshold post hoc to manufacture an improvement.
- Factory ByteTrack retains the same ID at both eligible endpoints for **1 / 21 long-low-visibility subjects**; factory BoT-SORT, activation controls and every intervention retain **0 / 21**. Missing endpoints and lower event coverage remain in JSON. These are GT visibility/order diagnostics, not proof of physical occlusion, correct continuous identity, or independent scenario IDF1/HOTA.

The frozen **research screen** required no per-scene FN/FP/IDSW increase, no combined IDF1/HOTA decrease, and at least one combined FP/IDSW decrease against activation control. Confirmation arms fail the coverage/identity conditions; competition arms show no improvement. The JSON lists failed conditions individually. No arm is promoted, including the activation control itself.

## Evaluation, reproduction and next step

Use clean pinned [TrackEval](https://github.com/JonathonLuiten/TrackEval/tree/12c8791b303e0a0b50f753af204249e622d0281a), official MOT17 distractor/zero-mark preprocessing, CLEAR IoU .5, Identity and HOTA. Verify uniform 2× preview-to-GT scaling and +1 MOT origin. Combined scores use the evaluator's combiners. Three fresh runs rotate configuration order, set OpenCV seed 0/one thread and produce identical canonical predictions. Latency includes the first direct-library update, excludes detector/decoding/startup and **does not include worker IPC**; it is descriptive single-host timing, not end-to-end throughput.

Prepare licensed local inputs/manifest as in [the existing reproduction guide](tracking-expanded-acceptance.md#reproduce-locally), but regenerate both caches with **8.4.176** and protocol flags. Keep all raw files outside the public manifest. In the isolated tracker environment:

```bash
python tools/validate_mot_tracking.py \
  --manifest local/mot17-admission.json --trackeval-root local/TrackEval \
  --work-dir outputs/admission --output outputs/admission.json \
  --repeats 3 --admission-study

RUN_TRACKERS_CONTRACTS=1 python -m pytest -q tests/test_tracking_admission.py
python tools/plot_tracking_admission.py \
  --record docs/validation/v0.3-mot17-admission.json \
  --output outputs/admission-counts.png
```

Next instrument competition at **unconfirmed promotion and recovery**, including association costs and the overlap/age of retained hypotheses, before selecting another control. Independently separate detector localisation from association and validate on a new licensed sequence group. Do not replace weak continuation with blanket low-score filtering or assume ReID will fix detection errors. General long-occlusion, physical RTSP, Windows real inference/worker integration, endurance, hardware WebGL and calibrated 3D accuracy remain open. Release tags/assets and original study records are unchanged.
