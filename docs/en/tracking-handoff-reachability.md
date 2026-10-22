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
