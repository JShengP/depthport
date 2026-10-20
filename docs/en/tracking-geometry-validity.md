# Prediction-geometry validity control — 2026-10-20

[繁體中文](../zh-TW/tracking-geometry-validity.md) · [ROADMAP](../../ROADMAP.md) · [Prior numerical/assignment diagnosis](tracking-estimator-shadow.md) · [Frozen definitions](../validation/v0.3-geometry-validity-protocol.json) · [Native reference seal](../validation/v0.3-geometry-validity-references.json) · [Complete results](../validation/v0.3-geometry-validity.json)

**The held-out group does not pass the frozen replication gate:**0006 triggers once and removes9 invalid prediction rows, but0007 has no trigger. Every per-scene observable harm screen passes; this is not tracking-quality or identity acceptance.

This experiment isolates one opt-in ByteTrack prediction control. It preserves the original parameters, inputs, high/weak association, accepted measurement update and lifetime semantics. **No application/worker/default change is installed.** GT and accuracy scores are not read; observable harm screens are deliberately separate from tracking-quality acceptance.

## Freeze and source separation

The definition seal is **`733053db5e0a009ae3cdf9841b672dfaf54ff63cc3b28425b7e4f63c7b3b68fe`**. Twenty-four new synthetic/native contracts plus20 earlier numerical/assignment contracts pass before the freeze. Only official image-directory metadata for the two new sources is inspected beforehand; no new PNG member, inference output or control result is read. The four prior numerical failures and five prior assignment cases are disclosed known evidence. The [frozen method commit](https://github.com/JShengP/depthport/commit/b61baf8bba7193aab341776019026449635bbfea) is public before any control execution (after image preparation had started); the earlier local freeze remains unchanged. This is not external preregistration.

The complete fixed ledger contains seen KITTI0004/0005 (314/297 frames) for mechanism checks and previously unused KITTI0006/0007 (270/800 frames) for source-held-out control validation. The new pair is the next two training IDs in lexical order after all previously used0000–0005, selected without GT or detector/tracker outcomes. There is no clipping, source substitution, early stop, favourable-result selection or parameter adjustment. Every zero/failed source is retained. Same-dataset source separation does not establish independent sites, participants, model training data or statistical power.

Official original PNGs are read from the image-only archive with immutable ETag/range checks, ordered member/CRC manifests and image hashes. Complete FFV1 bgr0 videos at native10Hz must decode pixel-identically to every original PNG. YOLO26n/Ultralytics8.4.176 CPU, person class0, confidence.1,640px,max64,NMS.7 and the original weight hash are fixed. No resize/crop/resampling of source frames, label archive, GT/evaluator or accuracy-score-based selection is used. Detection caps block acceptance and remain recorded.

## Rule and mean/covariance consistency

For a positive finite8D XYXY pre-predict mean, compute the original next fixed-step mean `F(1) @ x`. If next width or height is non-positive, set the two corresponding corner velocities to their arithmetic average. Other coordinates and velocities are unchanged. Both affected axes can be projected in the same row; there is no epsilon, fitted duration, box-position clamp or threshold tuning.

Let `T` be identity except the two velocity rows of each affected axis each contain `.5` in its paired velocity columns. Apply **`x_projected = T @ x` and `P_projected = T @ P @ T.T`**, including all cross terms, before the unchanged native prediction. This preserves current position and centre velocity while making the affected dimension velocity zero. No F/H/Q/R, motion/noise cache, clock, ID, birth, confirmation, expiry, input or solver replacement is introduced.

This is conditional linear moment propagation for the selectedT. It does not represent uncertainty over the trigger branch or establish statistically calibrated covariance. Unsupported non-positive treatment prestate is a failure, not a posterior repair. Native reference histories may retain their original invalid means.

The live estimator and a persistent detached shadow receive the same projection. Frozen shadow code then checks every original prediction and accepted update exactly, including array dtype/shape/value/byte hashes and native F*x/F*P*F.T+Q algebra. P/Q/R symmetry/PSD diagnostic tolerance remains the previous fixed1e-10. `state_post/P_post` continue to describe the last actual accepted update; native predict writes its new prior fields. Historical accepted posteriors are never rewritten to conceal the projection.

## Accepted updates and roles

Apply the same rule to all tentative/confirmed hypotheses, recording active pre-predict `time_since_update==0` and retained `>0` separately. No maturity/waiting or buffer change is made. Every accepted high/weak measurement still enters the original Kalman update once, with its original measurement; no accepted update is clipped, rejected, projected or rerouted. A non-positive accepted posterior fails the per-scene screen. Projection is not accepted observation evidence: it resets no missed-frame age, hit counter or confirmation, and empty-input frames remain prediction-only with normal expiry. All weak inputs and the native weak stage remain enabled. Effects on actual accepted weak observations are measured rather than assumed unchanged.

## Native seals, repeats and per-scene gates

Before any projected arm, all four complete unhooked native references and immutable source/cache locks are sealed. Old0004/0005 complete JSON/native output/final-state hashes must equal the pre-existing archive. New0006/0007 native references are newly sealed before treatment; they are not described as historical original results.

Each source then has two full observed reference passes and two control passes, each in a fresh process with OpenCV one thread/seed0. Observed references must equal the unhooked prediction JSON/native-output/final-state bytes, old lifecycle records must also equal their old seals, and each arm's repeated complete outputs/state/lifecycle/numerical/geometry histories and event sets must agree. Pickles are written and hashed, never loaded. No inference occurs during tracking.

Every scene separately requires:

- Zero numerical failures and non-positive treatment prediction/accepted-posterior rows.
- Zero lost baseline weak accepted input events or confirmed-output input events, keyed by `(frame,input-index)`.
- Zero lost baseline active accepted update pairs, keyed by frame, the shared input birth event, current input index and stage. Native ID numbers are not transferred/equated across arms.
- Zero new birth events. Lost/new event membership is checked even when total counts are equal; additional confirmed inputs are recorded without calling them benefits or false positives.

No scene compensates another. Both new full sources must additionally have at least one actual projection, fewer non-positive prediction rows than their own reference, complete matching repeats and zero detection-cap frames. Zero exposure cannot pass by output equality. Even passing these frozen gates establishes geometry/proxy evidence only: FP/FN/IDSW/HOTA, physical identity and true tracking harm remain unverified without GT.

## Results and decision

All **four sources /1,681 unique original frames /20 scheduled passes** complete without exclusion, source failure, retry, cap frame or post-freeze amendment. The held-out pair contributes1,070 unique frames; repeats are equality checks, not additional independent samples. All source/implementation/runtime seals remain unchanged.

- **Seen mechanism0004:**191 inputs,10 births,102 predictions,17 high/5 weak accepted updates. Four retained-confirmed projections (four axes) reduce non-positive prediction rows **18→0**; accepted-posterior violations0, all proxy-harm gates pass.
- **Seen mechanism0005:**46 inputs, zero births/predictions/updates/projections. Zero geometry exposure remains explicit; numerical/role efficacy is unmeasured here.
- **Held-out0006:**496 inputs,2 births,29 predictions,0 high/5 weak accepted updates,5 confirmed input observations. One retained-confirmed projection (one axis) reduces invalid predictions **9→0**. Every numerical and proxy-harm gate passes; lost weak/active-update/confirmed-input events, new births and additional confirmed inputs are all0.
- **Held-out0007:**208 inputs,2 births,48 predictions,8 high/18 weak accepted updates,26 confirmed input observations. Native invalid predictions **0→0**, actual projections0. All proxy-harm screens pass; the scene has estimator exposure but **no geometry-control exposure**. It is a retained negative, not a second effective replication.

Across all scenes, applied active-confirmed, active-tentative and retained-tentative rows are0; only retained-confirmed projections are exposed (four seen/one new). These strata remain distinct. Every accepted posterior stays positive, every numerical check passes, and the persistent shadow matches each native operation exactly. This verifies the declared moment transform/native update execution, not covariance calibration or empirical safety in unexposed roles.

All twelve native/observed-reference prediction files equal their source's unhooked seal, including IDs/formatting. The six old-source files also equal the pre-existing archive; the new-source files match newly sealed references. Native outputs/final-state seals and both old lifecycle seals reconcile. Two control repeats/source agree in all complete outputs, state and raw histories/events. Reference and control also have identical complete predictions/native returns/final-state hashes in all four scenes, while the intentionally projected intermediate estimator histories differ in0004/0006. **There are no additional confirmed observations or demonstrated recovery/identity gains.**

**Decision: do not promote the control or relax the two-source gate.** Frozen `held_out_geometry_proxy_gate_pass=false`: only0006 has effective geometry reduction,0007 is unexposed. Every scene passes conservative observable harm screens, but GT-free checks cannot establish true tracking harm or quality. Keep parameters, native assignment, weak continuation and app/worker defaults unchanged.

The next step is a separately frozen **GT-free geometry-exposure selection** process: fixed complete source order, actual own-arm projections/role groups, all zeros/failures retained, and untouched confirmation reserved before outputs.0006/0007 are now seen and cannot be relabelled independent confirmation. Do not fit a new epsilon/duration or substitute a favourable scene after this result. Active/tentative intervention exposure, independent replication, identity/localisation/long-occlusion and per-scene true-harm/HOTA gates remain open.

## Reproduction and checks

Use the original pinned NumPy2 tracker environment, sealed local source/cache/archive files and local freeze receipt. The public repository intentionally contains no original raw diagnostics or inference caches; rebuilding them on a different recipe yields new hashes and must not be described as original-archive equality. New image preparation uses the separate model environment with the frozen8.4.176 detector, not the tracker NumPy2 environment.

```bash
python tools/validate_tracking_geometry.py run \
  --protocol docs/validation/v0.3-geometry-validity-protocol.json \
  --seal artifacts/tracking-geometry-validity/freeze.local.json \
  --old-inputs artifacts/tracking-past-exposure/confirmation-inputs.local.json \
  --new-inputs artifacts/tracking-geometry-validity/inputs/inputs.local.json \
  --work artifacts/tracking-geometry-validity/new-run \
  --references artifacts/tracking-geometry-validity/new-references.local.json \
  --output artifacts/tracking-geometry-validity/new-results.local.json
```

Validation:24 new contracts /205 related pinned research contracts pass; the updated base suite is **475 passed /68 optional skipped**, with one existing Starlette/httpx warning. The publicly frozen program commit passes all eight [application](https://github.com/JShengP/depthport/actions/runs/39353765810) / [model API](https://github.com/JShengP/depthport/actions/runs/39353764966) jobs (Linux/Windows, Python3.11/3.12, no pretrained inference in CI). Public-file/link/obvious-secret, unchanged freeze/helper/source seals, every original reference and source-only archive checks are performed. Reused research/model environments are not a fresh full Alpha installation or hardware/quality acceptance.

## Terms and public boundary

[KITTI official terms](https://www.cvlibs.net/datasets/kitti/) are CC BY-NC-SA3.0; attribution: Andreas Geiger, Philip Lenz, Raquel Urtasun, *Are we ready for Autonomous Driving? The KITTI Vision Benchmark Suite*, CVPR2012. This is local noncommercial research; no source media, GT or raw results are redistributed or relicensed as project code.

Only reviewed source-level counts, each scene's gates/zeros/failures and complete source/code/output seals are published. Full states/covariances/matrices, individual trigger axes, frame/ID/birth keys/event sets, paths, media, weights, caches and raw diagnostics remain under ignored local artifacts. Existing release tags/download assets are unchanged.

[The separately frozen GT-free exposure follow-up is now complete](tracking-geometry-exposure.md); the original definitions/results above remain unchanged.
