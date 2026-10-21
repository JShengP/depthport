# Accepted-event membership and birth-lineage audit — 2026-10-21

[繁體中文](../zh-TW/tracking-accepted-events.md) · [ROADMAP](../../ROADMAP.md) · [Prior carrier/role audit](tracking-carrier-roles.md) · [Frozen protocol](../validation/v0.3-accepted-events-protocol.json)

## Frozen scope

After 107 synthetic/native contracts and integrity checks of 434 existing files, publish the frozen method before extracting new event memberships. Audit all three previously public changed discovery outputs: MOT17-09-DPM (525 frames), MOT17-11-DPM (900), MOT20-07 (585), totaling 2,010 already-seen source frames. Independently traverse both archived trials per arm; repeats are not additional sources or independent confirmation.

Read-only diagnosis: no GT/scores, media/cache reads, inference, tracking rerun, solver, tuning or default change. Keep weak continuation, geometry rule, parameters and original decisions. Hash pickles only; do not load them. Recheck all 434 inputs and ten original public records before and after extraction.

## Definitions and limits

Accepted-input keys are source frame/original detection index. Seed-lineage keys are birth frame/original detection index. Never join native IDs or tokens across arms; a birth seed is not an accepted update. Compare input, stage-labelled, lineage-labelled and stage+lineage sets separately, retaining reference/control/common/lost/added counts and exact net-change balances, including zeros.

For common inputs, separately count stage, lineage and posterior-box JSON-encoding changes. Partition the original weak, confirmed-output and active-update membership proxies: a lost weak-stage member may be accepted at high stage rather than dropped; active loss uses fixed exclusive priority of missing input, different seed lineage, different stage, then retained role. These are descriptive proxies, never verified FN/FP/IDSW, localisation errors or identity correctness.

Retain all 26 source rows: three selected, nineteen unchanged outputs out of scope, four original failed/missing histories unmeasured with null counts. Original failures, incomplete discovery and false formal replication flags remain unchanged. No zero/out-of-scope/missing evidence becomes safety acceptance.

Only aggregate counts, denominators, integrity/failure flags and hashes are public. Raw input/seed/token/ID/box cases, exceptions and local paths remain ignored locally. Previously reviewed MOT/KITTI noncommercial local-research terms apply; no media/GT/cache/raw-output redistribution or relicensing.

## Results and decision

[Complete ledger and denominators](../validation/v0.3-accepted-events.json) · [Method published before extraction](https://github.com/JShengP/depthport/commit/5dc33a4dcd2cfea0ae29a2e9c261f711ba214587)

All twelve archived histories covering three sources/2,010 original frames were read completely. Both trials per arm agree on counts, input and ordered event receipts, and membership differences. No source audit failed or retried. All434 original inputs and ten public records remain unchanged. The26-row ledger retains3 completed,19 out-of-scope and4 originally failed/unmeasured rows with null counts; discovery completeness and all eight formal replication flags remain false.

- **MOT17-09-DPM:** accepted inputs4,140→4,144; common4,140/lost0/added4 (high2/weak2). All1,432 original weak inputs retained. Births38→36, two lost/no new. Among common inputs,51 seed lineages and51 posterior-box encodings change;51 original active-edge keys are lost, all due to lineage, with no missing input/stage/retained-role loss.
- **MOT17-11-DPM:** inputs5,751→5,766; common5,751/lost0/added15 (high1/weak14). All494 original weak inputs retained. Births47→46, one lost/no new. Common inputs have39 lineage and49 posterior-box encoding changes.38 original active edges are lost through lineage; the other changed lineage was originally retained and does not belong to active loss.
- **MOT20-07:** inputs3,753→3,758; common3,753/lost0/added5, all weak. All1,928 original weak inputs retained; births23→23. Common-input stage/lineage/box-encoding changes and original active-edge losses are all zero.

No original weak or confirmed accepted input is lost, no common input changes high/weak stage, and no new birth appears in any scene. **Two scenes still fail the original no-lost-active-update-pair proxy:** that key includes seed lineage, so51/38 changed keys do not mean89 dropped accepted inputs. Do not relax or retrospectively pass the original gate. MOT20-07 passing these four membership proxies is not overall quality acceptance. Extra coverage, fewer births and equal boxes do not establish correct identity, true FN improvement or occlusion recovery. Without GT, legitimate chain merging versus incorrect association is unresolved.

**No next intervention is selected.** Prospectively define a causal bridge using only common accepted observations available before a decision, separating chain continuation, merges/splits and absent support, before considering intervention. Birth-key equality is not identity truth; zero lost inputs does not justify removing protection. Quality, long-occlusion and genuinely unseen confirmation remain open. Weak continuation, geometry, parameters, decisions, application/worker and defaults are unchanged. Raw cases remain local.

## Validation and reproduction

107 synthetic/native contracts passed before freeze. Six new optional fixture tests initially failed on a helper package import; correcting it passed before any real-history extraction, with the original failure summary retained locally. Public-report checks separately verify membership balance, stage deltas, all26 rows/nulls/four failures and434 seals. CI is software/import evidence without pretrained weights; subsequent PR/main results are recorded in[PR #36](https://github.com/JShengP/depthport/pull/36).

Use `tools/audit_tracking_accepted_events.py freeze|analyze --archive-root <existing artifacts directory>`. Existing sealed artifacts must be obtained under their original terms; they are not included publicly. Source tracking reconstruction is a different experiment and cannot substitute for this read-only audit.

Final local validation:567 passed/98 optional skipped in the application environment, retaining one existing Starlette/httpx deprecation warning;111 current/related contracts passed in the pinned NumPy2 research environment. Skips are not passes. Public-manifest/local-link/obvious-secret-pattern checks pass; this is not a full security audit.

Windows format regression: the[result commit first application CI](https://github.com/JShengP/depthport/actions/runs/39529352201) failed one protocol-byte-seal test on each Windows Python3.11/3.12 job; both Linux jobs passed. Observed hash`f2ca378d…` exactly matches the original LF protocol converted to CRLF; original LF hash`6441c390…` remains unchanged. Add LF checkout rules for public validation JSON and an actual Git autocrlf export contract, preserving frozen definitions, original inputs and audit numbers. Both original application JUnit artifacts and full logs remain local. The[parallel Model API workflow](https://github.com/JShengP/depthport/actions/runs/39529352215) also fails the same test in its two Windows jobs; both full logs are preserved locally. All four Windows failures remain failed, with four Linux jobs passing.
