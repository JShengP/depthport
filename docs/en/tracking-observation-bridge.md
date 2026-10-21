# Past common-observation lineage bridges — 2026-10-22

[繁體中文](../zh-TW/tracking-observation-bridge.md) · [ROADMAP](../../ROADMAP.md) · [Previous accepted-event audit](tracking-accepted-events.md) · [Frozen protocol](../validation/v0.3-observation-bridge-protocol.json)

## Scope and causal contract

This method is frozen before extracting new bridges, with the previous public findings already known: MOT17-09-DPM / MOT17-11-DPM have51/39 changed seed lineages,51/38 lost original active-update keys and zero lost accepted inputs. Read all525/900 original frames and both archived trials per arm:1,425 unique frames/eight histories. These are already seen sources, not independent confirmation or external preregistration.

At frame `f`, a bridge anchor is an original `(frame, detection index)` input **accepted by both arms at a strictly earlier frame `t < f`**. Compute the intersection incrementally. Birth seeds, unmatched/single-arm inputs, current-frame high/weak updates and future observations cannot support a decision. All accepted high/weak, active/retained and tentative/confirmed updates qualify equally; no support-count tuning. The whole-frame barrier conservatively excludes even an earlier stage in the same frame.

The bipartite graph connects per-arm immutable birth keys that owned those common past observations. Native IDs/tokens never join arms; equal birth labels alone are no evidence. Retain all historical edges, including retired owners, with no decay or intervention. Degrees describe recorded chain relationships, not physical identities:

- Direct edge with reference/control degrees1/1: **unique continuation**.
- Degrees1/>1: **merge relation**, multiple reference owners connected to one control owner.
- Degrees>1/1: **split relation**; >1/>1: **many-to-many relation**.
- No direct edge but both owners have other anchors: **unbridged known chains**. An indirect path is a separate flag and never substitutes for a direct anchor.
- No direct edge and zero degree on the reference side, control side, or both: three separate **missing-support** categories. Distinguish empty accepted history from accepted history containing only noncommon inputs.

Classify every common current input before committing any current-frame anchors. Keep eight categories including zeros for all common inputs, changed/unchanged lineages and original lost-active keys; these overlapping groups are not independent cases. Retain stage/predecision-role strata, distinct owner-pair and first-event denominators. The previous strict proxies are reproduced unchanged, **never retroactively passed by a bridge**.

## Integrity, limits and publication

Freeze code/tests, previous public evidence and the inherited434-file byte-hash seal. Reconcile complete input/event receipts and previous membership counts in both original archived trials; recheck originals before/after. No GT, scores, media, detection-cache reads, inference, tracking/solver execution, tuning or changes to weak continuation, geometry, confirmation/buffer or defaults. Pickles are hashed, never loaded. Keep all26 scope rows: two scheduled scenes,20 out of scope and four original failures/nulls. New failures remain failed/null with local exceptions; no overwrites or retries. Original incomplete discovery and eight false replication flags remain.

Only aggregate source counts, denominators, role/stage strata and hashes are public. Raw input/owner/ID/frame/box cases and diagnostics stay in ignored local artifacts. Inherit the previously reviewed MOT/KITTI local noncommercial research terms; no media/GT/raw-result redistribution or relicensing.

This is descriptive correspondence, not verified identity, correct merge/split, FN/FP/IDSW/HOTA or harm acceptance. Missing support stays unknown. No intervention is chosen before all frozen results are available.

## Execution

`tools/audit_tracking_observation_bridge.py freeze|analyze --archive-root <existing artifacts directory>` requires the matching original local archives. A new tracking run cannot replace these sealed histories. Method commit is published before `analyze`; results and actual validation will be appended separately.
