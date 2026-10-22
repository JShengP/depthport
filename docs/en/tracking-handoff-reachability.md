# Read-only eligibility and action reachability — 2026-10-22

[繁體中文](../zh-TW/tracking-handoff-reachability.md) · [ROADMAP](../../ROADMAP.md) · [Original exposure ledger](tracking-handoff-exposure.md) · [Frozen protocol](../validation/v0.3-handoff-reachability-protocol.json)

## Freeze before extraction

This is a descriptive audit of seven already-seen complete histories, not new exposure selection or independent confirmation. Preserve original discovery KITTI0012–0016 and reserved0017/0018 labels; read both actual candidate arms and both archived trials:28 histories/6,372 trace frames,1,593 unique source frames. No windows, sampling, reselection, tuning, GT/labels/evaluator, tracker/inference/numerical replay or assignment solver. The published zero actions are known before freeze; new qualification decomposition is not.

Freeze code, tests, definitions, original rules/runtime/receipts and1,956 seven-source raw-file hashes before semantic trace extraction. Verify434 original files and772 earlier raw files before/after. All native predictions/raw outputs/final states remain byte-identical to original seals; pickle is hash-only. Neither this audit nor equality of zero-action outputs proves efficacy, safety or identity quality. Prior four failures/nulls, incomplete historical discovery, eight false formal replication flags, two false candidate gates and three false confirmation gates remain.

## Separate denominators and prerequisites

Count high-stage frames and native empty no-stage frames separately. Publish high rows/columns, original selected pairs, free rows/columns and activation-eligible columns. Four-bit availability masks mean row/high-column/free-row/free-column presence. Separate active-confirmed, retained-confirmed, active-tentative and retained-tentative rows; three-bit qualification masks mean confirmed/strictly-past accepted/positive predicted geometry. Zero universes and missing prerequisites are **not rejected proposals**.

Use pre-update roles: prediction has already incremented stage age. Confirmed is a sticky tracker role, not physical identity. Birth establishes ownership but does not count as an accepted observation. Commit every current high/weak accepted key and high-match context only after the decision audit, so support is available through f−1. Require distinct previous accepted input keys; a competitor's previous weak acceptance remains valid. Current/future anchors, later absence of pairing, inferred expiry and cross-run equal native IDs cannot repair support.

## Birth-continuation funnel

Unit:original free high row × free high column, split active-confirmed/retained-confirmed/tentative. Ordered conjunction:confirmed → prior acceptance → positive prediction → activation → unchanged native gate → no weak opportunity. Order is diagnostic bookkeeping, not runtime short-circuit or causal blame; independent masks retain overlapping deficits. Current-gate-qualified edges excluded by any admissible weak detection are preproposal exclusions. Remaining graph must be mutually unique in row AND column. Ambiguous edges never form proposals; qualified proposals equal reconstructed actions because this rule has no subsequent veto.

## Past-competition handoff funnel

Unit:original selected high edge(r,c) × original free high row q. Require both qualified, both pre-active, both last accepted at f−1, selected owner's latest high context at f−1, q present in that context, past active-confirmed/gate/margin, distinct prior inputs, current gate/margin and no weak opportunity. Preserve native gate0.1 and margin0.05. Per-selected-edge zero or multiple admissible alternatives are nonproposals. Exactly one forms a qualified proposal; only competing unique proposals claiming the same q are post-proposal rejections. Publish triples, selected-edge partitions,16 role pairs, ordered nonproposal counts and qualified claim vetoes separately. Broad weak-blocked row totals are not rejected actions.

## Integrity, failures and publication

Reuse sealed original matched/free partitions, never rerun assignment. Recompute only the pinned original pure IoU with original float64 predicted and float32 input boxes; exact high/weak matrix equality is required. Every acceptance/update operation and complete input/event receipt must reconcile; reconstructed actual-arm actions must match original zero actions. Both original trials must produce identical new aggregates and deterministic local decision bytes. A mismatch retains source failure/null audit and per-trial completed/failed/not-run status; never fill missing evidence with0, overwrite or silently retry.

Public output contains source/arm aggregates, denominators, zeros/nulls and hashes only. Per-frame boxes, costs, indices, native IDs/tokens, accepted keys, contexts, decisions, exceptions and media remain local. [Official KITTI terms](https://www.cvlibs.net/datasets/kitti/):CC BY-NC-SA3.0, local noncommercial research. Attribution:Geiger,Lenz,Urtasun, *Are we ready for Autonomous Driving? The KITTI Vision Benchmark Suite*, CVPR2012. Repository AGPL does not relicense data. No media/weights/cache/GT/raw distribution.

## Software checks at freeze

20 generated predicate/history contracts pass under pinned NumPy2. They distinguish absent opportunities, birth versus acceptance, past/current/future contexts, weak preproposal exclusions, mutual uniqueness and shared-competitor vetoes; verify full accepted receipts and fail exact-matrix/action mismatches. Fixtures are software checks, not real-source exposure. Real results will be recorded after the public method commit.

## Complete results after public freeze

[Public method commit](https://github.com/JShengP/depthport/commit/b7d5ec81c531c62b607b649f4d51db2996e2f45a) · [Aggregate ledger](../validation/v0.3-handoff-reachability.json)

All7 sources/28 histories/6,372 trace frames completed without extraction failure or retry.1,593 unique source frames are not multiplied by arms/trials into independent evidence. Each original repeat gives identical new counters and local decision bytes.434 old files,772 earlier raw files and1,956 seven-source files unchanged; all original native output/state/input/acceptance receipts reconcile. Each arm retains1,646 high and1,027 weak accepted updates. No new inference, tracker, numerical replay, solver or GT.

### Availability and role accounting

Per actual arm, pooling counts only for descriptive bookkeeping:1,021 high-stage frames plus572 native no-stage frames;3,547 high rows/1,737 high columns,1,646 matched pairs,1,901 free rows/91 free columns. All1,737 high columns meet unchanged activation threshold, including91 free columns. High-stage availability masks(row/high-column/free-row/free-column) have153×0000,7×0101,202×1010,147×1100,8×1101,439×1110 and65×1111; all other masks0. A high-stage call with empty high matrix can still contain weak detections.

High rows split active-confirmed2,665 / retained-confirmed791 / active-tentative91 / retained-tentative0. Free rows split1,074 /783 /44 /0; all1,857 confirmed free rows have past acceptance and positive predicted geometry. The44 tentative free rows have positive geometry but neither confirmation nor accepted history (mask001); other qualification masks except111 are0. These are row-frame counts, not unique objects, independent incidents or GT identities.

### All seven sources, including zero opportunities

Each line reports:frames;free rows/columns;birth edge universe(active-confirmed/retained-confirmed/tentative);handoff triples → both-qualified → both-active → selected previous-high context → past-active → past-gate → past-margin → current-margin;accepted high/weak. Omitted intermediate columns are retained in JSON; after both-active, previous acceptance removes0; competitor context membership removes0; distinct prior inputs/current gate remove0 after past-margin. Per-source rows never become cross-scene harm compensation.

- **KITTI-0012 (discovery):** 78; 0/0; 0/0/0; 0 → 0 → 0 → 0 → 0 → 0 → 0 → 0; 0/0.
- **KITTI-0013 (discovery):** 340; 616/45; 24/77/5; 730 → 661 → 225 → 197 → 180 → 10 → 2 → 0; 355/195.
- **KITTI-0014 (discovery):** 106; 36/5; 0/0/3; 0 → 0 → 0 → 0 → 0 → 0 → 0 → 0; 0/19.
- **KITTI-0015 (discovery):** 376; 303/11; 9/2/0; 368 → 357 → 227 → 196 → 190 → 9 → 0 → 0; 222/177.
- **KITTI-0016 (discovery):** 209; 824/21; 52/21/0; 2315 → 2254 → 1648 → 1287 → 1241 → 51 → 1 → 0; 602/585.
- **KITTI-0017 (confirmation):** 145; 122/9; 2/5/0; 339 → 330 → 148 → 138 → 128 → 6 → 0 → 0; 467/51.
- **KITTI-0018 (confirmation):** 339; 0/0; 0/0/0; 0 → 0 → 0 → 0 → 0 → 0 → 0 → 0; 0/0.

### Why no action is reached

Birth:200 free Cartesian edges split87 active-confirmed,105 retained-confirmed and8 tentative.192 confirmed edges pass past acceptance/positive geometry/activation, but **all192 fail the original current gate**. The8 tentative edges already lack confirmation/acceptance. Thus0 reach weak exclusion, ambiguity, full proposals or actions.0012/0018 have no high rows/columns or accepted updates;0014 has31 qualified free rows and19 weak updates but all3 free-pair edges are tentative. Missing high-stage coexistence is different from a rejected proposal.

Handoff:3,752 selected-edge/free-row triples →3,602 both qualified →2,248 both active/previously accepted →1,818 selected previous-high contexts →1,739 past-active competitors →76 past-gate →3 past-margin/distinct-input/current-gate →0 current-margin. Under the frozen diagnostic priority, nonproposals split150 qualification,1,354 active-role,430 previous-high-context,79 past-active,1,663 past-gate,73 past-margin and3 current-margin. These are ordered conjunction losses, not mutually exclusive causal events. The final3 occur only in0013(two) and0016(one); no persistent past-and-current ambiguity under the unchanged margin. All1,646 selected high edges have zero fully admissible alternatives;0 multi-alternative nonproposals,0 unique proposals and0 qualified claim rejections.

Broad weak-blocked rows are1,343, including1,043 high-free rows. **Both actual-arm funnels have0 otherwise-qualified edges removed by weak exclusion**. This does not mean weak opportunities are absent or that removing protection would help: the preceding conditions already produce zero. All1,027 native weak updates remain. Do not relabel missing premises, below-gate edges, weak-blocked rows or zero universes as rejected proposals.

### Decision and next boundary

Keep both candidates research-only and defaults/weak continuation unchanged. Zero exposure is explained within these archives; independent exposure, true harm/identity quality and default promotion remain unverified, with all old failures/false gates retained. No new control or parameter change follows. Before another experiment, prospectively freeze a read-only temporal geometry/competition audit of the192 qualified free edges and3 past-supported triples using only decision-prefix observations. Separate predicted localisation/observation geometry from competitor replacement and score-gap persistence; never relax a margin, remove weak protection or use future outcomes to manufacture eligibility. New definitions or source expansion require a new public freeze, not a retrospective rewrite of this evidence.

## Local software validation after extraction

Application NumPy1 suite:668 passed/110 pre-existing optional skips/one existing Starlette–httpx deprecation warning; then all11 added provenance/denominator/privacy report contracts passed. Pinned NumPy2 predicate contracts:20 passed. These are software/evidence-format checks, not model-quality or full hardware acceptance. Public manifest, local Markdown links, obvious-secret-pattern and whitespace checks pass; this is not a complete security audit. PR/main platform CI status is tracked in [PR #41](https://github.com/JShengP/depthport/pull/41).
