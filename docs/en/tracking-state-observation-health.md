# State-estimation and observation-health audit — 2026-10-20

[繁體中文](../zh-TW/tracking-state-observation-health.md) · [ROADMAP](../../ROADMAP.md) · [Earlier lifecycle diagnosis](tracking-upstream-lifecycle.md) · [Definitions](../validation/v0.3-state-observation-health-protocol.json) · [Public aggregate](../validation/v0.3-state-observation-health.json) · [Publication projection](../validation/v0.3-state-observation-health-publication.json)

**Four hypotheses first acquire non-positive dimensions during prediction after an accepted update, while most terminal row frames lack any input.** This locates an operation and an observation-availability gap; it does not establish a numerical Kalman root cause, correct physical identity, or a safe intervention. Current parameters, controls, defaults and weak continuation remain unchanged.

## Frozen scope and equality

Definition seal **`4af6002d8f9624c73a7e3623469df7e912ddfed705ccdec35963bff5a09179f3`** follows23 synthetic/pinned contracts and precedes new health extraction. The earlier six invalid missed-row snapshots/ten births are known. This is a locally frozen retrospective audit of two already-seen sources, not independent confirmation or external preregistration. No method or threshold was changed after extraction.

Audit all **611 original frames** and every born owned hypothesis using both sealed lifecycle histories. No detector, tracker, GT/annotation read or evaluator is run. Original source/cache/code/runtime seals, all268 original association stages/geometry and prior aggregate counts reconcile. Posterior-to-next-before-predict continuity and native clocks reconcile on all102 predicted rows. Two traversals produce identical aggregates and raw audit bytes.

All three previously saved prediction files per source remain **byte-identical to the original reference**, before canonicalization and including original Object ID strings. Original native-output and final-state hashes still agree; pickle is only hashed, never loaded. Nothing in the frozen tracking history is rewritten.

## First non-positive state and accepted updates

KITTI-0004 has191 inputs, all finite with positive dimensions, and10 born hypotheses. It has102 prediction rows and112 pre-prune posterior rows. **Four confirmed hypotheses produce18 non-positive prediction rows**; the earlier six rows were only the missed-row/weak-input subset, not the full anomaly population.

- First phase: **birth0 / prediction4 / accepted-high0 / accepted-weak0**. Two hypotheses first lose positive width, two positive height, none both at their first event.
- Last accepted update: **high3 / weak1**; all four last accepted input boxes and accepted posterior boxes have positive dimensions. First invalid prediction occurs **4,7,8 and11 native frames** after that accepted update.
- All22 accepted updates (17 high/5 weak) have positive input and posterior dimensions. No accepted update starts from an invalid prediction, creates an invalid posterior, or repairs an invalid prediction in these histories. All four invalid hypotheses eventually expire; no invalid-to-positive prediction transition is observed.
- Seven hypotheses receive their first accepted update one frame after birth. All15 subsequent accepted-update intervals are one frame. There is no observed accepted update across a missed-frame gap in this cohort; the five weak updates are still delivered by unchanged native weak continuation.

The first age11 violation occurs on its expiry frame, so invalid geometry cannot explain all preceding missed updates. A valid input/posterior also does not prove a correct association or a healthy hidden state. Existing records contain boxes, ages and accepted history, **not internal Kalman means, covariance, velocity/noise or transition matrices**. The operation is localized to prediction; causal numerical diagnosis/repair remains open.

KITTI-0005 has46 finite, positive weak-only inputs and no birth, prediction row, accepted update or lifecycle end. Its zero first-anomaly counts mean the estimator was **not reached**, not a measured0% failure rate.

## Birth and terminal observation gaps

Use complete-source any/high/weak input-presence streams, every maximal empty run, and nearest strictly earlier/later observations. Event-frame availability is separate from neighbour distance. Missing neighbours are boundary-censored, never observed zero distances. Fixed birth-seed/last-accepted anchors test retrospective geometric overlap, not identity; no hypothesis is extrapolated after deletion.

For0004's10 births, all have some input in the previous frame. Five birth frames also have a weak input, but **none of those weak inputs reaches the native gate against its birth seed**. Four birth anchors have a gate-supported weak neighbour in the preceding frame; six have no preceding such observation within the source. Birth-frame high/any support is tautological because it includes the seed itself, not independent evidence of detector quality. Later anchor support is retrospective context only.

Seven confirmed expiries each have11 terminal frames since their last accepted update: **77 row frames** total. These can overlap across hypotheses and are not77 independent source frames.

- **52/77 have no input at all**. The remaining25 have some input;17 have high input and17 weak input, with overlap between categories.
- Actual alive predictions have high-stage gate support in **5 row frames**, but no accepted terminal update. There is no weak gate support; one weak row has positive overlap below the gate. Fixed last-accepted anchors have high gate support in6 row frames and weak gate support in0.
- At expiry, three events have some weak input and four have none; no event has high input or gate support against its fixed last-accepted anchor. Later any-input neighbours exist1/2/18 frames away. Four expiry anchors later have gate-supported any input9/10/10/75 frames away; three are right-censored. This is not evidence of the same person returning or of a beneficial longer buffer.

The three immature removals are seed-only gaps of one frame. Two have some current input, but neither fixed seed nor native prediction has any positive/geometric gate support. No combined-expired/immature removal or source-end survivor occurs; all zero/censored groups remain in the ledger.

0004 has interior no-input runs up to65 frames and high-input empty runs up to82 frames.0005 has no high input anywhere in297 frames and interior weak/any empty runs up to68 frames. These are scene-wide detector-input gaps, not GT object absences or misses. Full interior run histograms and all context groups are retained; exact boundary distances remain local.

## Intervention decision

**No tracking intervention or parameter change is installed.** The next candidate control point is prediction validity after accepted updates, subject to an isolated numerical shadow replay that records internal estimator state and preserves the native reference output. Freeze that replay before inspecting new internal-state evidence; do not select a box repair from these four seen cases alone.

The **five gate-supported but unaccepted high-stage terminal row frames** identify a separate assignment-audit target. Resolve original one-to-one selection/competition there before defining an association control; gate support alone does not establish an admissible identity correction. Both follow-ups are pending, not implemented in this study. Current evidence does not justify a new gate, buffer or default. Independent exposure, paired/scene-wise harm, long-occlusion/bus-HOTA, hardware and calibrated3D acceptance remain open; future confirmation must use untouched sources.

## Publication, reproduction and checks

After results but **before any upload**, a publication-only projection was specified: exact censor-boundary distances could reveal event locations, so neighbour censor buckets and boundary-run lengths are reduced to censor counts. The dated [projection record](../validation/v0.3-state-observation-health-publication.json) binds the unchanged freeze/full local aggregate and projection code. All sources, failures, zero groups, event denominators, interior lengths, observed-neighbour gaps and scientific counts are retained. This changes publication detail only, not the frozen audit or its results.

```bash
python tools/audit_tracking_health.py analyze \
  --protocol docs/validation/v0.3-state-observation-health-protocol.json \
  --seal artifacts/tracking-state-observation-health/freeze.local.json \
  --inputs artifacts/tracking-past-exposure/confirmation-inputs.local.json \
  --raw-root artifacts/tracking-upstream-lifecycle/run \
  --original-root artifacts/tracking-past-exposure/confirmation \
  --work artifacts/tracking-state-observation-health/new-run \
  --output artifacts/tracking-state-observation-health/new-full.local.json
python tools/project_tracking_health.py \
  --input artifacts/tracking-state-observation-health/new-full.local.json \
  --output artifacts/tracking-state-observation-health/new-public.local.json
```

Use the original pinned NumPy2 research runtime and immutable local inputs. Both sources complete without exclusions or failures. Raw boxes, frame locations, ownership tokens, accepted histories, exact boundary distances, full aggregate and contextual cases remain local. Original [KITTI terms/attribution](tracking-past-exposure.md#reproduction-terms-and-public-boundary) apply: local noncommercial research, no media/GT/raw-result redistribution or dataset relicensing. Program checks and observational equality do not close tracking quality acceptance.

Validation:23 new health contracts pass before the freeze;2 publication-projection contracts pass after extraction. The related pinned suite totals **161 passed**; the base application suite has **453 passed/43 optional skipped**. Public-file/link/obvious-secret checks, unchanged freeze/source seals, full-source projection invariants and the source-only archive are checked. The335-file allowlist contains no raw artifacts/media/state pickles/weights; these are program checks, not quality acceptance.
