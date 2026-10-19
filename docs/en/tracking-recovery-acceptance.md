# ByteTrack competing-recovery deferral — 2026-10-19

[繁體中文](../zh-TW/tracking-recovery-acceptance.md) · [ROADMAP](../../ROADMAP.md) · [Preceding diagnosis](tracking-association-diagnosis.md)

**The frozen research screen passes on one new sequence; general tracking acceptance remains open.** Deferring four competing weak-stage recoveries changes FP **55→52**, FN **17,194→17,092**, IDSW **21→13**. Recall is still only **13.98%**, fragmentations increase **46→48**, and none of nine long-low-visibility events has both endpoints matched. Keep the control opt-in and offline; application/worker defaults remain unchanged.

[Frozen protocol](../validation/v0.3-recovery-deferral-protocol.json) · [Reviewed aggregate record](../validation/v0.3-recovery-deferral.json) · [Plot source](../../tools/plot_tracking_recovery.py)

![Whole-sequence errors, identity scores and fragmentation](../assets/tracking-v03-recovery.png)

## New input and source terms

The entire **MOT20-01 training preview: 429 consecutive frames, 25 fps**, a crowded indoor station with a static camera. It is separate from all previously studied MOT17-04/09/10/11/13 scenes. This is one independently selected scene, not a multi-scene held-out test, original-JPEG benchmark result or moving-camera acceptance.

The [official MOT20 page](https://motchallenge.net/data/MOT20/) explicitly lists [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) and warns that original-source conditions can also apply. MOT20-01's Source column has no additional third-party link. Attribution: MOTChallenge; Dendorfer, Rezatofighi, Milan, Shi, Cremers, Reid, Roth, Schindler and Leal-Taixé, [MOT20](https://arxiv.org/abs/2003.09003). Use here is local non-commercial research. Media, labels and raw outputs are not redistributed; application AGPL does not relicense the dataset. The aggregate figure/record retain the source attribution and CC BY-NC-SA 3.0 notice where applicable.

ETH/MOT17-05 was considered but excluded because its additional original-source terms could not be verified; unavailable terms are not treated as permission. No scene was substituted after seeing tracking scores.

YOLO26n CPU / **Ultralytics 8.4.176**, confidence .10, input 640, class 0, NMS .70, cap 64. Both arms share exactly **7,529 detections**, zero frames at the cap. The compressed video is **960×540**; source GT is **1920×1080**, verified uniform 2× scaling and one-based MOT coordinates. Official preprocessing leaves **19,870 pedestrian observations**. Detector/cache/video/GT/metadata/weights/terms hashes are recorded. The reused application runtime plus 8.4.176 overlay is not a fresh installation of the complete Alpha.2 recipe.

## Frozen independent intervention

The protocol was saved locally **after common caching and synthetic mechanism tests, before any new-sequence tracker output or GT evaluation**. This is a local freeze, not external preregistration. Both arms use pinned Roboflow **Trackers 2.6.1**, activation .30, high/weak split .60, confirmation 2, IoU gate .10 and buffer 30 reference frames (one second, scaled to source fps). Only the candidate installs an instance-local control:

1. Run the original high association and original weak-stage assignment.
2. Consider a selected weak-stage row only if it already has a confirmed ID and predicted age ≥2: at least one fully missed prior frame.
3. Defer that pair if another **remaining confirmed row, age exactly 1**, has similarity ≥.10 in the same detection column and `selected − competitor ≤ .05`. The margin may be negative; the alternative can be assigned elsewhere and is not proof of ownership.
4. Return just that pair unmatched: original detection remains in output with ID −1, missed hypothesis remains predicted within the original lifetime. Do not rematch or assign the detection to the competitor. Reassess each following frame; this can defer repeatedly, not necessarily exactly one frame.

High association, births/confirmation, ordinary active-track weak updates, uncontested weak recovery, raw weak inputs and lifecycle remain upstream. There is no GT, ReID, state-update bypass, buffer extension or BoT-SORT intervention. `RecoveryDeferral` is used only by the explicit offline runner and restores method ownership on exit/failure; it is not installed by the tracker factory, Session or worker.

**Research screen fixed before execution:** intervention >0; FP strictly lower; no FN/IDSW increase; no IDF1/HOTA decrease; no paired same-ID event-recovery losses. Every condition is required. This screen does not guarantee per-observation non-regression or release acceptance, and no parameters were retuned after results.

## Whole-sequence result and paired harms

Two arms × three fresh tracker repeats = **6 runs / 2,574 frame updates**. Rotated order, OpenCV seed 0/one thread; canonical outputs and full diagnostic hashes agree in every repeat. A separate unhooked upstream reference run exactly matches the instrumented reference. Repeats are not independent scenes.

Pinned [TrackEval](https://github.com/JonathonLuiten/TrackEval/tree/12c8791b303e0a0b50f753af204249e622d0281a) uses official MOT20 pedestrian preprocessing, CLEAR IoU .5, Identity and HOTA. Diagnostic CLEAR counts reconcile exactly. Reference → candidate:

- **FN 17,194→17,092 (−102); FP 55→52 (−3); IDSW 21→13 (−8).** TP 2,676→2,778; recall **13.47→13.98%**, precision **97.99→98.16%**, MOTA **13.09→13.65%**.
- **IDF1 20.03→20.84%; HOTA 20.50→21.39%.** Fragmentations worsen **46→48**. Four selected weak edges are deferred on four frames; subsequent association histories change, so gains cannot be obtained by simply subtracting four old detections.
- Immutable-location pairing: **FP added 0 / removed 3**; **FN added 22 / removed 124**; **IDSW added 1 / removed 9**. A net improvement still introduces new misses and a new switch. FP uses (frame, cache-detection index); FN/IDSW use (frame, GT). Native tracker numbers are never compared across runs.
- Captured recovery observations change **31→30**: same-previous-GT TP **19→21**, different-previous-GT TP **4→3**, FP **8→6**. These are correlated events on diverging histories, not paired physical-person recoveries; last official ownership may already be wrong.

All frozen screen conditions pass **for this scene**. The source still has very low coverage; this is a useful research signal, not a replacement default or a robust long-occlusion solution.

## Occlusion and crossing proxies

Existing GT-only rules remain unchanged: low visibility ≤.30 for ≥1 second, ≥.60 visible anchors within one second; crossing proxy uses GT overlap/order exchange. These diagnose image-box visibility/order, not verified physical occlusion or 3D crossing. Endpoint matching is a separate full-frame IoU .5 diagnostic, not official scenario HOTA/CLEAR.

- **9 long-low-visibility events / 9 subjects:** both arms have **0 complete endpoint pairs**, 0 same-ID recoveries; missing before **8**, missing after **9**. Event recall **16/340 = 4.71%** in both. No evidence of improved long-occlusion recovery; the zero-loss screen component is uninformative here.
- **36 overlap/order events / 72 subjects:** complete endpoints **16→17**, same ID **13→15**, changed ID **3→2**; missing before **53→52**, after **52→51**. Event matched observations **235→252 / 1,342**. Paired same-ID gains: **1 from changed**, **1 from missing**, **0 losses**; matched endpoint gain **1**. Denominators overlap in time and do not constitute independent trials.

## Implementation verification

Local application suite: **327 passed / 13 optional skipped**; real pinned-library mechanism/admission/probe tests: **28 passed**. With SciPy deliberately unavailable, related base tests: **21 passed / 7 opt-in skipped**. Contracts cover active weak continuation, uncontested missed recovery, selective competing deferral, original detection retention, unmodified matrices/other assignments and hook/registry restoration. Public-manifest/link checks, development source build and synthetic-only site build pass; no release asset or site deployment was performed. Protocol/core implementation and original input hashes remain unchanged after the experiment.

## Reproduce and next step

Place the licensed compressed sequence and official labels in ignored local storage, generate the common detector cache with `tools/cache_video_detections.py`, and prepare a local manifest with `video`, `detections`, `gt`, `seqinfo`, `labels_archive` paths. Exact paths never go in public JSON. Use a separate NumPy 2 environment with the frozen runtime versions and clean evaluator commit.

```bash
python tools/validate_tracking_recovery.py \
  --protocol docs/validation/v0.3-recovery-deferral-protocol.json \
  --manifest local/mot20-recovery.json \
  --trackeval-root local/TrackEval \
  --work-dir artifacts/recovery/run \
  --output artifacts/recovery/aggregate.json
```

The runner rejects changed implementation/input/runtime hashes, verifies official archive content and full dense coverage, repeats tracking before joining GT, and writes raw matrices/IDs/events locally. TrackEval's unrelated optional BURST importer reports missing `pycocotools`; the MOT20 loader and all three requested metrics execute successfully. Deprecated NumPy aliases are supplied in this isolated evaluator process, as in the previous studies.

Next: replicate the unchanged control on additional licensed scenes, including camera motion, and inspect the newly added FN/IDSW locally. Separately freeze a detector-localisation/resolution study to explain poor coverage; geometric support is not a causal detector diagnosis. Do not combine a new detector, buffer or confirmation change with this control or transfer scores from older caches. Physical camera, Windows inference/worker, calibrated 3D, endurance and throughput remain unverified. Existing releases/tags are unchanged; raw media, GT, diagnostic matrices/IDs, notes and paths stay local.
