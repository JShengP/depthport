# Estimator numerical shadow and independent high-stage assignment audit — 2026-10-20

[繁體中文](../zh-TW/tracking-estimator-shadow.md) · [ROADMAP](../../ROADMAP.md) · [Prior health audit](tracking-state-observation-health.md) · [Frozen definitions](../validation/v0.3-estimator-shadow-protocol.json) · [Complete public aggregate](../validation/v0.3-estimator-shadow.json)

**All four first non-positive boxes follow unchanged independent-corner velocities through missed predictions. All five high-stage gate-supported terminal rows compete for detections already accepted by active, confirmed hypotheses.** The numerical mechanism and original assignment accounting are now reproduced. No intervention, parameter/default change or identity-quality claim follows from these seen cases; weak continuation remains intact.

## Freeze, scope and equality

Accepted definition seal **`a339cfbc3d7f7fab688c7f7419173e7ae71b198471f682959b2a7c2a97514624`** follows20 synthetic/pinned contracts and precedes new internal-state replay and assignment-case extraction. Earlier aggregate counts (four first failures, five high-stage row frames) are known. This is retrospective diagnosis of the same two already-seen KITTI sources, **not independent confirmation or external preregistration**. Definitions, implementation and original helpers remain frozen after extraction.

Both full sources, **611 original frames**, complete without source exclusion, failure or retry. Each source runs in three isolated processes with the original caches, dense decoded frames and pinned runtime: an unhooked native reference and two observed numerical-shadow repeats. No inference, GT/annotation access, accuracy evaluator, tuning, new input filtering or application integration is performed.

All six newly saved complete prediction JSON files, including Object ID strings and formatting, equal the original reference **byte for byte**. Their byte hashes are frozen before replay, in addition to the earlier canonical seals. Complete native outputs and final native tracker pickle hashes equal the original upstream archive. Both observed lifecycle files per source equal the old lifecycle seal. Repeated numerical histories, numerical aggregates/cases and independent assignment aggregates/cases also agree exactly. Pickles are written and hashed, never loaded.

The numerical observer enters after the unchanged lifecycle observer. A detached estimator starts at each native birth and persists across all later predictions/accepted updates. The original live call receives its exact arguments once; only the detached copy receives a duplicate call. Before and after each operation, every Kalman/motion field, array dtype/shape/value and array-byte hash must agree. Temporary instance hooks are removed on failure and ordinary return; no global patch, replacement solver, live numerical change, birth/prune change or worker integration is used.

## Numerical mechanism

KITTI-0004 has10 births,102 predictions and22 accepted updates (17 high/5 weak). All **124 operations** match their persistent detached shadows exactly. All102 predictions reproduce `F @ x` and `F @ P @ F.T + Q` exactly. Internal states, gain/innovation/noise arrays and motion caches are finite. Fixed P/Q/R symmetry and positive-semidefinite diagnostic screens pass all124 operations each; tolerance is1e-10, set before extraction. These screens do not establish a correct association or a physically appropriate shape model.

For the four prior first-failure hypotheses:

- Two first lose positive width and two positive height. The immediately preceding predicted dimensions are positive in all four.
- The affected dimension has a negative velocity difference between its two corners in all four. That velocity stays unchanged from the last accepted posterior through the missed interval.
- All four first-failure dimensions match last accepted posterior dimensions plus the native frame gap times that velocity difference, within the frozen1e-10 tolerance for rearranged scalar subtraction. Native state/shadow equality remains exact.
- The last accepted update introduces the affected negative dimension velocity in **three** cases; one already has shrinking velocity before that update. All last accepted input/posterior boxes remain positive. This locates the numerical transition; it does not establish that an observation or an association was wrong.

The last accepted updates precede the first invalid predictions by4/7/8/11 native frames, as previously sealed. The XYXY estimator has four independent corner velocities and an unconstrained velocity clamp. Finite, well-behaved covariance algebra therefore coexists with a mean whose opposing corners cross during prediction. There is no observed arithmetic/shadow divergence or covariance-screen failure to explain these four cases. A shape-validity constraint is a distinct modelling control that still needs its own causal test.

KITTI-0005 has297 original frames and46 weak-only inputs, with **zero births, predictions or accepted updates**. Its numerical-check dictionaries are empty because no estimator operation occurs; this is absent exposure, not a measured0% numerical failure rate. All zero population counts remain public.

## Independent high-stage assignment audit

This arm reads the **previously sealed lifecycle histories**, independently of new numerical output and first-failure selection. Both original histories are traversed separately. All134 original high stages (95/39 by source), including empty stages, reproduce the whole-matrix SciPy maximize assignment, subsequent native gate and unmatched partitions exactly.

The target population is every expired terminal row frame after its last accepted update/seed through removal whose prediction has any high-stage IoU at least the unchanged.1 gate. It reconciles the previously frozen **five cases in0004 and zero in0005**; these are row frames, not five independent people/events or GT misses.

- **Four** rows are unassigned in a rectangular one-to-one problem; **one** receives a raw assignment below the gate, then loses acceptance when the native gate is applied.
- There is exactly one gate-supported candidate edge per row, **five edges total**. Every candidate detection already has an accepted high-stage owner that is **active (age1) and confirmed**; unused/retained/tentative-owner counts are all zero.
- Forcing each edge in an otherwise optimal full-cardinality one-to-one assignment lowers the original raw objective in all five cases; exact equality/negative-loss counts are zero. This objective includes below-gate pairs before the gate, exactly like native tracking.
- Each forced alternative preserves the accepted-update count and removes another originally accepted row from the updated membership. More/fewer-update counts are zero. These are assignment trade-offs, not five free additional recoveries or validated identity corrections.

Raw matrices, solver pairings, individual losses, displaced row tokens, internal states and frame positions stay local. No forced alternative is installed; objective preference is not an identity or harm metric.

## Intervention decision and next gate

**Keep current native assignment, parameters, defaults and weak continuation.** Do not force the five high-stage edges or lengthen retention based on these data. The immediate next candidate is a separately frozen **prediction-geometry validity control**, with explicit mean/covariance consistency, accepted-update handling, active/retained/missing-evidence semantics and per-scene harm gates. Define it before any candidate execution; compare it against the unchanged native reference and reserve untouched confirmation sources. No candidate rule, clamp or representation change is installed in this study.

Keep numerical geometry and competition/update-displacement controls separate. This audit explains deterministic shape collapse and global assignment accounting in seen histories. It does not measure better tracking, corrected IDs, missed/false detections, long-occlusion recovery or HOTA. Prior exposure/quality/harm, bus-HOTA, real hardware and calibrated3D gates remain open. The age11 first failure is on expiry and cannot explain all earlier misses;52/77 terminal row frames still lack any input.

## Reproduction, public boundary and checks

Use the original pinned NumPy2 research environment and immutable local inputs. The accepted freeze includes package/source/module hashes, the actual SciPy solver binary hash, prior source/results/publication records, tests and implementation. A metadata path-type error was corrected during pre-freeze setup; no source replay or diagnostic extraction had started. That setup failure remains in the local ledger. There are no failed source runs or post-extraction amendments.

```bash
python tools/audit_tracking_estimator_shadow.py run \
  --protocol docs/validation/v0.3-estimator-shadow-protocol.json \
  --seal artifacts/tracking-estimator-shadow/freeze.local.json \
  --inputs artifacts/tracking-past-exposure/confirmation-inputs.local.json \
  --original-root artifacts/tracking-past-exposure/confirmation \
  --health-root artifacts/tracking-state-observation-health/run \
  --lifecycle-root artifacts/tracking-upstream-lifecycle/run \
  --work artifacts/tracking-estimator-shadow/new-run \
  --output artifacts/tracking-estimator-shadow/new-aggregate.local.json
```

The publication boundary was fixed **before extraction**: only aggregate counts/check denominators/failures and whole-source/code/output seals. No per-case state, matrix, cost, frame/ID/token, boundary distance, local path, media, label or raw output is published. Full local numerical and assignment diagnostics are retained under ignored artifacts. Original [KITTI terms and attribution](tracking-past-exposure.md#reproduction-terms-and-public-boundary) apply (CC BY-NC-SA3.0, Geiger/Lenz/Urtasun, local noncommercial research); no media/GT/raw redistribution or dataset relicensing.

Validation:20 new contracts pass before freezing; the related pinned suite totals **181 passed**. The base application suite has **455 passed/61 optional skipped**, with one existing Starlette/httpx deprecation warning. These program/equality checks do not close quality acceptance. Reviewed source-only packaging excludes all raw diagnostics, media and model weights; release tags/assets remain unchanged.
