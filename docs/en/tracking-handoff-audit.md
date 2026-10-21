# Past-only handoff evidence audit — 2026-10-22

[繁體中文](../zh-TW/tracking-handoff-audit.md) · [ROADMAP](../../ROADMAP.md) · [Previous bridge audit](tracking-observation-bridge.md) · [Frozen protocol](../validation/v0.3-handoff-audit-protocol.json)

## Frozen scope

Before extracting new handoff context, fix all four previously reported lost-active boundaries: three missing-reference-support events and one unbridged-known-chain event. The full MOT17-09-DPM525 / MOT17-11-DPM900 frames and both original archived trials per arm are read:1,425 unique source frames/eight histories. Expected target counts are2/0 and1/1 respectively, not selected after new outcomes. Already seen sources/repeated histories are not independent confirmation; four event boundaries need not be four physical incidents.

## Evidence available before each decision

At frame `f`, query only the timeline committed through `f-1`, validated against `before_update`. Copy all evidence before any current-frame graph/timeline commit.

- **Birth:** immutable within-arm birth(frame,input-index) and recorded unmatched-high reason, with `birth_frame < f`. Birth is not an accepted update or identity anchor. For that same past input in the other arm, record birth, high/weak acceptance and its prior owner role, unaccepted, or missing evidence. Identical input receipts establish source alignment; native IDs/boxes do not join arms. An unaccepted input has no inferred refusal reason.
- **Accepted observations:** all original prior high/weak updates, including active/retained and tentative/confirmed roles. Empty accepted history differs from a missing birth/record. Include every direct past bridge neighbor and its own evidence, even retired owners; historical graph neighbors are not automatically live competitors.
- **Removal/expiry:** require exact recorded removals matching pre-prune minus post-update ownership, with the original `expired`, `immature_unmatched` or combined reason. Absence, age, no update and a later deletion cannot establish prior expiry. Keep live active/retained × confirmed/tentative roles. No removal record means only no recorded removal through `f-1`; source-end live tracks are censored, not expired. No threshold is recomputed or changed.

The current accepted event is kept in a separate result pane, never used as prior support. For the full suffix `f+1..source-end`, preserve same-pair graph categories, stages/roles, other counterparts touching either owner, later high/weak owner updates and source-end removal/censoring. Current frame is excluded from following counts. No fitted window or backward repair of the prior snapshot. Cases can share owners/suffixes, so summed history/update counts are case-exposures, not unique events or people.

## Integrity and limits

Reproduce complete previous accepted-input/event receipts, original proxy memberships and full causal bridge summaries/ordered receipts. Both archived trials must agree on complete raw case receipts and aggregates. Recheck434 original files and all pinned prior public/code records before/after; pickle is hashed only. Freeze method/tests before new extraction and publish the method commit first. No overwrites/retries; failures stay failed/null with local exceptions.

Preserve26 source rows: two scheduled,20 out of scope/null and four original failed/unmeasured/null. Preserve incomplete discovery, eight false formal replication flags and both failed active-update proxies. No GT/scoring, media/cache reads, inference, tracker/solver execution, tuning, intervention or changes to weak continuation, geometry, confirmation/buffer or defaults. Correspondence, birth consolidation and expiry receipts do not establish true identity, correct merges/splits, FN/FP/IDSW/HOTA or tracking safety.

Publish only source/category aggregates, denominators, role/stage counts, statuses/nulls and hashes. All per-case frame/input/birth/owner/ID/box histories, removals and exceptions remain in ignored local artifacts. Inherit reviewed MOT/KITTI noncommercial research terms; no media, GT or raw-result redistribution/relicensing.

## Reproduction

`tools/audit_tracking_handoff.py freeze|analyze --archive-root <existing artifacts directory>` requires the exact presealed local archives; a fresh tracker run cannot replace them. Actual findings, validation counts and next decision will be recorded separately after the frozen full read.
