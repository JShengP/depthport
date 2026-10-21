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

## Results and decision

[Complete aggregate ledger](../validation/v0.3-observation-bridge.json) · [Published method before extraction](https://github.com/JShengP/depthport/commit/b769bcc6bd0b1ce717b97e4609b435cf461daa3a)

Both scenes completed without source failures or retries. All1,425 unique frames/eight archived histories were read. Each original trial independently reproduces identical bridge receipts/counts, full accepted-event receipts and previous memberships. All434 original files and15 prior public/code records match their frozen hashes before/after. The26-row ledger retains20 out-of-scope nulls and four original failed/unmeasured nulls; original incomplete discovery and eight false replication flags remain.

- **MOT17-09-DPM:** all4,140 common accepted inputs classify as4,053 unique continuations,49 merge relations,2 missing-reference-support and36 missing-both-support. Split, many-to-many, unbridged-known and missing-control categories are0. The51 changed-lineage inputs are exactly the51 original lost-active keys:49 merge relations plus2 missing-reference-support events, across2 owner pairs. Both first pair events lack reference accepted history and are reference active-tentative/control active-confirmed high updates; later49 are active-confirmed on both sides (48 high/1 weak). Final graph:38 edges,38 reference owners of degree1;34 control owners of degree1 and2 of degree2.
- **MOT17-11-DPM:** all5,751 common inputs classify as5,656 unique continuations,37 merge relations,10 split relations,1 unbridged-known-chain,1 missing-reference-support and46 missing-both-support; other categories0. The39 changed-lineage inputs span2 owner pairs:37 merge,1 unbridged-known and1 missing-reference-support. The original38 lost-active keys include36 merge (34 high/2 weak),1 established active-confirmed high unbridged pair and1 reference active-tentative/control active-confirmed high event with no reference accepted history. The other changed-lineage merge is a retained-confirmed weak update on both sides, outside the active-loss denominator. All10 split relations occur among **unchanged birth-key** inputs. Final graph:48 edges;46 reference owners degree1/1 degree2;45 control owners degree1/1 degree3.

Across the **89 original lost-active keys**,85 have direct past-supported merge relations,3 lack reference accepted history and1 connects known chains without any direct or indirect past bridge. None is unique continuation, split, many-to-many, missing-control or missing-both in that target group. The broader90 changed-lineage inputs include one additional retained weak merge. Groups and repeated trials overlap; do not count them as independent cases. Empty-history events are not imputed from their current or future accepted observation. In the full9,891 common-input denominator,82 first owner-pair events lack both histories; equal birth labels still do not supply evidence. Every zero and role/stage stratum remains in the JSON.

**Why the two proxies still fail:** accepted inputs were preserved, but the immutable seed-owner keys change across observation-chain consolidations and unsupported handoff boundaries. Those keys cannot encode cross-run identity. Past support distinguishes a repeated merge relationship from an initially unsupported transition; it does not prove that the consolidation is correct. Conversely, the10 split relations with unchanged seed labels show why seed equality cannot certify unique continuity. No FN/FP/IDSW/HOTA, physical merge/split, identity correctness or safety conclusion follows, and neither failed gate is relaxed.

**Next diagnostic control point:** prospectively freeze a boundary-focused, past-only ownership-handoff audit for the three empty-reference-history events and one established-chain unbridged event, retaining their subsequent chain relations and active/retained roles. Define admissible birth/accepted-observation/expiry evidence before further extraction; do not use current or future anchors to repair missing past evidence. These four event boundaries are not necessarily four physical incidents. No intervention, default promotion or support-count threshold is selected. True identity/localisation quality and genuinely unseen confirmation remain open; original weak continuation and seals remain unchanged.

## Validation

Before definition freeze:44 tests passed/6 optional native cases skipped, public manifest/links/obvious-secret-pattern checks passed. The pinned NumPy2 research environment subsequently passed89 synthetic/native contracts without real tracking execution. The first full application run passed588/98 optional skips with one existing Starlette/httpx deprecation warning; the final run passed592/98 optional skips, including four public-report integrity and denominator checks, with the same existing warning. CI details and final counts are recorded in [PR #37](https://github.com/JShengP/depthport/pull/37); CI contracts/imports do not load real weights or establish hardware/accuracy acceptance. Public checks are not a full security or history audit.
