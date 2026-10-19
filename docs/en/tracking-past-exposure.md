# Same-rule GT-free exposure discovery and reserved confirmation — 2026-10-19

[繁體中文](../zh-TW/tracking-past-exposure.md) · [ROADMAP](../../ROADMAP.md) · [Prior causal control](tracking-past-support.md) · [Protocol](../validation/v0.3-past-exposure-protocol.json) · [Discovery](../validation/v0.3-past-exposure-discovery.json) · [Confirmation](../validation/v0.3-past-exposure-confirmation.json) · [Pre-inference seal](../validation/v0.3-past-exposure-confirmation-seal.json)

Follow-up: [read-only applicability diagnosis](tracking-exposure-gap.md) locates both reserved sources before accepted missed-row weak opportunities. Past/protection tests are not reached; no new gate or default is justified. Buffer prose is corrected below with the original frozen records preserved.

**All three mechanisms trigger in discovery; independently replicated exposure still fails.** The complete 16-source discovery ledger gives **40 / 8 / 2 actual vetoes**, selecting **MOT17-09-DPM / MOT17-10-DPM / MOT20-06** by order, separately for past support / update protection / both. The two prospectively reserved KITTI sources both have zero vetoes for all treatments. All scheduled sources complete, including all zeros; no GT, accuracy score or evaluator is read in this study. Exposure is not identity benefit or release acceptance.

![All ordered discovery sources, reserved sources and actual own-arm vetoes](../assets/tracking-v03-past-exposure.png)

## Freeze and selection rules

Local protocol SHA-256 **`573b76a8019ce5bb069a6140d2070c26ca7c4071dace026dcef3ea8eba255082`**, sealed `2026-10-19T14:48:52.951961+00:00`, after **11** synthetic/pinned-library contracts, before new detector/tracker output. Source intent preceded new image preparation; reserved IDs and complete frame counts came only from the original archive directory. Original-image downloads could continue during implementation/freezing; these are not inference or tracking. This is a local prospective freeze, not external preregistration. Previous MOT diagnostics and some historical scores were already known; they are not loaded as selection features and do not make discovery blind.

The [same causal rule](tracking-past-support.md) is byte-identical: its implementation hash remains `d760faddc836de6e299240d84ff3046c559e5b52e55d6a56c0a70a1aa5b251e1`. Keep decision-before accepted-observation support, active/retained/unconfirmed distinctions and missing-evidence reasons; protect every other accepted row/detection update, with conjunction on the same competitor. Each arm owns its continuous history; no reference-history transfer, native-ID joins, future support window or new threshold. The three treatments and no-veto reference are unchanged.

1. Inspect **every scheduled discovery source** in the frozen order, without early stopping. For each treatment independently select the first completed full source with ≥1 actual veto and ≥1 veto frame on its own history, three identical canonical-prediction/full-trace/count repeats, equal unhooked reference and zero detection-cap frames. Reference opportunities never select a treatment. No quality ranking or favourable clip selection.
2. Keep every zero and failure. Failure means unknown, never zero; store a safe public reason and local exception. A first qualifying completed source can still be listed when another fails, but search is then incomplete and replication cannot pass. No outcome-based retries, replacements or relaxed criteria.
3. Seal the entire discovery ledger/hash and deterministic selections **before any reserved detector or tracker output**. Confirmation gets a separate input lock bound to that discovery hash and a recorded pre-inference preparation seal. Both reserved sources run completely regardless of discovery outcome; neither can fill a discovery slot.
4. A treatment replicates mechanism exposure only if discovery selected a source, every scheduled discovery/reserved source completed, and that treatment actually vetoes in **both** reserved sources with all repeat/reference/cap checks passing. All other results are false, including null discovery selection. This gate reads no GT, FP/FN/IDSW/Identity/HOTA or accuracy score, and cannot pass tracking quality/reliability or the prior per-scene harm gates.

## Sources and independence

Discovery uses the **same complete 16-source MOT cohort** as the prior exposure study, now entirely discovery-only, in its original order: 17,984 source frames. The formerly reserved MOT20-03/05 are already inspected and are explicitly reclassified as seen discovery, not fresh confirmation. This is the complete prespecified list, not an exhaustive search of every public dataset. Existing immutable 8.4.176 caches are reused, never regenerated or ranked by outcomes.

Reserve **KITTI-0004 (314 frames) / KITTI-0005 (297 frames)**: first two remaining training IDs after the previously studied 0000–0003, fixed before new output. Other KITTI IDs are prospectively excluded; the old four-source negative study remains unchanged. The new pair has no prior project inference/tracking or GT-member read. Both are from a new dataset/source family relative to MOT discovery, but shared pretrained detector/runtime, non-random selection and two vehicle sequences do not establish independent camera sites, participants or statistical power. They are now seen and cannot become future untouched confirmation.

Both original PNG sequences are ZIP-CRC/hash checked and converted to FFV1 BGR at native 10 Hz; **every one of 611 decoded frames is pixel-identical** to its original, no cropping/resampling/lossy encoding. [Prepared metadata](../validation/v0.3-past-exposure-prepared-sources.json) binds image-manifest/video hashes and complete dimensions/counts, and is hashed in the [pre-inference seal](../validation/v0.3-past-exposure-confirmation-seal.json). [Discovery lock](../validation/v0.3-past-exposure-discovery-inputs.json) and [confirmation lock](../validation/v0.3-past-exposure-confirmation-inputs.json) bind all video/cache hashes, full frame coverage, FPS, shard counts and detection/cap counts. No label archive is downloaded, opened or passed in this study; an older local KITTI ZIP is not accessed.

Native source FPS is preserved: MOT 25/30 Hz versus KITTI 10 Hz. **Corrected:** lost_track_buffer 30 is expressed at 30 Hz; the pinned helper configures 25/30 native frames on MOT and 10 on KITTI, nominally1second in each profile. The earlier1–1.2s/3s interpretation was wrong. [Erratum](../validation/v0.3-buffer-semantics-erratum.json) preserves original frozen prose/code/output hashes and documents the correction. No buffer tuning. Detector remains YOLO26n person0, Ultralytics8.4.176 CPU, confidence.10/imgsz640/NMS.70/max64/same weight; activation.30/high.60/buffer 30/confirmation2/margin.05, weak continuation and defaults unchanged.

## Full ledger and deterministic selections

Numbers are actual selected-edge vetoes; correlated observations are not independent people or events. Each treatment's counter is on its own diverged history: the three columns are not nested matched subsets to subtract for causal effects. All no-veto-reference counts are zero. Failed rows would say unknown; **there are no failures here**.

| Source | Phase | Frames | Status | Past only | Protection only | Both |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| MOT17-09-DPM | discovery | 525 | completed | 5 | 0 | 0 |
| MOT17-10-DPM | discovery | 654 | completed | 3 | 1 | 0 |
| MOT17-11-DPM | discovery | 900 | completed | 1 | 0 | 0 |
| MOT17-13-DPM | discovery | 750 | completed | 1 | 0 | 0 |
| MOT17-04-DPM | discovery | 1050 | completed | 0 | 0 | 0 |
| MOT20-01 | discovery | 429 | completed | 0 | 0 | 0 |
| MOT20-02 | discovery | 2782 | completed | 12 | 2 | 0 |
| MOT20-06 | discovery | 1008 | completed | 6 | 1 | 1 |
| MOT20-07 | discovery | 585 | completed | 0 | 0 | 0 |
| MOT20-08 | discovery | 806 | completed | 1 | 1 | 1 |
| MOT17-07-DPM | discovery | 500 | completed | 1 | 0 | 0 |
| MOT17-08-DPM | discovery | 625 | completed | 4 | 2 | 0 |
| MOT17-12-DPM | discovery | 900 | completed | 2 | 0 | 0 |
| MOT17-14-DPM | discovery | 750 | completed | 0 | 1 | 0 |
| MOT20-03 | discovery | 2405 | completed | 4 | 0 | 0 |
| MOT20-05 | discovery | 3315 | completed | 0 | 0 | 0 |
| KITTI-0004 | confirmation | 314 | completed | 0 | 0 | 0 |
| KITTI-0005 | confirmation | 297 | completed | 0 | 0 | 0 |


| Treatment | Discovery vetoes / exposed sources | First qualifying source | Reserved vetoes (0004 / 0005) | Exposure replicated in both |
| --- | --- | --- | --- | --- |
| Past support only | 40 / 11 | MOT17-09-DPM | 0 / 0 | False |
| Update protection only | 8 / 6 | MOT17-10-DPM | 0 / 0 | False |
| Both, same competitor | 2 / 2 | MOT20-06 | 0 / 0 | False |


Every discovery source has three equal full runs per arm; all 16 new no-veto references equal their historical frozen canonical predictions and additional unhooked upstream outputs. Both reserved references equal unhooked outputs; `historical_reference_equal:false` there means no historical reference was available, not a mismatch. All 18 scenes retain the full four-arm counts/hashes, zero-valued role/qualification counts and repeat evidence in the published JSONs. There are no source-level detection-cap hits.

## Execution and decision

**18 sources / 18,595 frames / 216 factorial runs**, plus **18 unhooked references**; no tracker resets at cache-shard boundaries. Four isolated source processes, fresh tracker/control/probe per source/arm/repeat, OpenCV single thread/seed0 and rotated arm order. Strict phase-local manifests reject GT/score/evaluator fields; no scoring API is called. The reused video helper imports the manual-evaluation module, but its evaluator is never invoked; official TrackEval is not imported. Frozen code/runtime and input hashes are checked before use. Research runtime: trackers 2.6.1 / NumPy 2.2.6 / SciPy 1.18.1 / supervision 0.27.0 / OpenCV 4.11.0.86. Fresh reserved caches use the same reused CPU model environment, not a fresh full installation or GPU/real-time benchmark.

**Decision: discovery exposure is established separately for all three mechanisms, but none is independently replicated in both reserved sources.** Do not substitute a positive discovery scene for confirmation, tune the conjunction from its two triggers, or reinterpret confirmation zeros as accuracy/safety success. Retain weak continuation/defaults and all prior bus-HOTA/long-occlusion failures. No new score, quality benefit, physical-ID validity, product/release/hardware or long-event acceptance is established.

Next record the fixed-rule applicability gap between seen pedestrian-dense discovery and vehicle-source confirmation **without changing eligibility or thresholds**. If another source search is warranted, freeze a separate GT-free ordered discovery cohort and genuinely untouched confirmation before new outputs, retaining this negative confirmation and every checked source. Only independently exposed controls can meaningfully enter a separately declared GT per-scene/paired harm evaluation; the earlier harm criteria remain open, not waived.

## Reproduction, terms and public boundary

```bash
# Pinned trackers/NumPy 2 environment; strict local video/cache-only manifests.
# Original freeze already exists: do not overwrite it or reuse the recorded output directories.
python tools/select_tracking_past_exposure.py scan \
  --protocol docs/validation/v0.3-past-exposure-protocol.json \
  --seal artifacts/tracking-past-exposure/freeze.local.json \
  --phase discovery \
  --inputs artifacts/tracking-past-exposure/discovery-inputs.local.json \
  --input-lock docs/validation/v0.3-past-exposure-discovery-inputs.json \
  --work-dir artifacts/reproduction/discovery \
  --output artifacts/reproduction/discovery.json
# Seal complete discovery before reserved inference; bind the resulting source/cache hashes.
python tools/select_tracking_past_exposure.py scan \
  --protocol docs/validation/v0.3-past-exposure-protocol.json \
  --seal artifacts/tracking-past-exposure/freeze.local.json \
  --phase confirmation \
  --discovery docs/validation/v0.3-past-exposure-discovery.json \
  --preparation-seal artifacts/tracking-past-exposure/confirmation-preparation-seal.local.json \
  --inputs artifacts/tracking-past-exposure/confirmation-inputs.local.json \
  --input-lock docs/validation/v0.3-past-exposure-confirmation-inputs.json \
  --work-dir artifacts/reproduction/confirmation \
  --output artifacts/reproduction/confirmation.json
```

The original `freeze` command refuses overwriting protocol/seal. Reproduction needs the recorded pinned runtime and source/cache bytes; use new ignored work/output directories and identify it as reproduction, not new preregistration. Confirmation is cryptographically bound to the original published discovery file; if reproduced discovery bytes differ, an explicitly new preparation/lock is required. Repeat hashes verify execution determinism, not additional independent samples.

[MOT17 terms](https://motchallenge.net/data/MOT17/) / [MOT20 terms](https://motchallenge.net/data/MOT20/) and [KITTI terms](https://www.cvlibs.net/datasets/kitti/) state **CC BY-NC-SA 3.0**. The selected MOT rows list no extra third-party Source link; additional original-source conditions may still apply. Attribution: MOTChallenge / Milan, Leal-Taixe, Reid, Roth, Schindler (MOT16); Dendorfer et al. (MOT20); Geiger, Lenz, Urtasun, *Are we ready for Autonomous Driving?*, CVPR 2012 (KITTI). Only local noncommercial research, no leaderboard submission or raw-media redistribution; program AGPL does not relicense datasets. Current terms snapshots are hashed in the protocol.

Application suite **408 passed / 33 optional skipped**; pinned related contracts **98 passed**, including 11 new selection/privacy/failure/actual-contested-shard contracts. Public file allowlist, links, obvious-secret patterns, source archive and synthetic-only site build checked; aggregate figure visually checked. Public outputs are code, synthetic tests, source hashes/counts, complete ordered ledgers, safe reasons and numeric charts. Original images/labels, raw predictions/trace matrices, frame positions/IDs, observation histories and local paths stay in ignored artifacts.
