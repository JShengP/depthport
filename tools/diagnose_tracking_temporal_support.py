#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Freeze risk/support definitions, then observe immutable reference histories.

No tracking, GT, cache mutation, future-informed intervention or new gates.
Birth observation indices were not recorded by the original probe: histories
here cover recorded accepted association edges, not complete birth histories.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.tracking_recovery_control import MARGIN, PARAMETERS
from depthport.video_tracking_benchmark import sha256_file
from tools.diagnose_tracking_competition import analyze as structure_analysis
from tools.diagnose_tracking_competition import distribution, require, verify_hash

LAGS = (1, 2, 5, 10, 30)
HORIZON = PARAMETERS['lost_track_buffer']
EFFECTS = ('same_updated_rows', 'row_replacement', 'fewer_updates', 'other')
GROUPS = tuple(f'{o}/{e}' for o in ('occupied', 'available') for e in EFFECTS)
STATES = ('shared_stage_gate', 'shared_stage_below_gate', 'competitor_other_stage_update',
          'competitor_absent', 'selected_no_update', 'selected_absent',
          'unanchored_history', 'sequence_end', 'no_recorded_selected_update')
SOURCE = 'docs/validation/v0.3-exposure-selection-protocol.json'
STRUCTURE = 'docs/validation/v0.3-competition-structure.json'
RECORDS = tuple(f'docs/validation/v0.3-exposure-{p}.json' for p in ('discovery', 'confirmation'))


def risk_group(row):
    delta, lost, gained = (row[k] for k in ('accepted_count_change', 'lost_updated_rows', 'gained_updated_rows'))
    require(delta == gained - lost, 'Update-set counts differ')
    effect = ('same_updated_rows' if delta == 0 and lost == gained == 0 else
              'row_replacement' if delta == 0 and lost == gained and lost > 0 else
              'fewer_updates' if delta < 0 else 'other')
    return ('occupied' if row['occupied'] else 'available') + '/' + effect


class FrameView:
    """Read-only stage/observation view; native tracker IDs never join histories."""
    def __init__(self, frame):
        self.number = frame['frame']; self.stages = frame['stages']
        require([s['name'] for s in self.stages] == ['high_all', 'weak_remaining'], 'Stage order differs')
        require(not frame['deferred'], 'Reference must not defer')
        self.present = {}; self.updates = {}; self.rows = []
        used_keys = set()
        for k, stage in enumerate(self.stages):
            lookup = {t['token']: i for i, t in enumerate(stage['tracks'])}
            require(len(lookup) == len(stage['tracks']), 'Duplicate stage token')
            require(len(set(stage['detection_indices'])) == len(stage['detection_indices']), 'Duplicate detection index')
            matrix = np.asarray(stage['similarity'], dtype=float).reshape(len(lookup), len(stage['detection_indices']))
            require(np.isfinite(matrix).all(), 'Nonfinite matrix')
            self.rows.append(lookup)
            if k == 0:
                self.present = {t['token']: t for t in stage['tracks']}
            else:
                require(all(t == self.present.get(t['token']) for t in stage['tracks']), 'Weak snapshot differs')
            matched_rows = set(); matched_cols = set()
            for r, c in stage['matched']:
                require(r not in matched_rows and c not in matched_cols, 'Nonexclusive matching')
                matched_rows.add(r); matched_cols.add(c)
                token = stage['tracks'][r]['token']; key = (self.number, stage['detection_indices'][c])
                require(token not in self.updates and key not in used_keys, 'Duplicate accepted observation')
                require(matrix[r, c] >= stage['gate'], 'Rejected edge recorded as accepted')
                self.updates[token] = {'key': key, 'stage': k, 'row': r, 'column': c}
                used_keys.add(key)

    def relation(self, selected, competitor):
        if selected not in self.present:
            return {'state': 'selected_absent'}
        if selected not in self.updates:
            return {'state': 'selected_no_update'}
        observation = self.updates[selected]
        common = {'selected_observation': observation['key']}
        if competitor not in self.present:
            return {'state': 'competitor_absent', **common}
        k = observation['stage']; stage = self.stages[k]
        q = self.rows[k].get(competitor)
        if q is None:
            other = self.updates.get(competitor)
            require(other is not None and other['stage'] < k, 'Unexplained stage absence')
            return {'state': 'competitor_other_stage_update', **common,
                    'competitor_observation': other['key']}
        r, c = observation['row'], observation['column']
        score = stage['similarity'][q][c]; selected_score = stage['similarity'][r][c]
        admissible = score >= stage['gate']
        snapshot = stage['tracks'][q]
        return {'state': 'shared_stage_gate' if admissible else 'shared_stage_below_gate',
                'signed_gap_supported': bool(admissible and selected_score - score <= MARGIN),
                'active_confirmed_competitor': snapshot['tracker_id'] >= 0 and snapshot['age_since_update'] == 1,
                'stage': stage['name'], 'selected_similarity': selected_score,
                'competitor_similarity': score, 'gate': stage['gate'], **common,
                'competitor_observation': self.updates.get(competitor, {}).get('key')}


class HistoryLedger:
    """Append-only (frame, immutable detection index) histories within one trace.

    Probe tokens preserve object ownership, not identity; prefixes and counters
    verify continuity. No cross-arm ID/box-nearness join or invented birth key.
    """
    def __init__(self):
        self.histories = defaultdict(list); self.snapshots = {}; self.previous_present = set()
        self.number = 0; self.age_checks = 0; self.counter_checks = 0; self.births_unindexed = set()

    def check(self, view):
        require(view.number == self.number + 1, 'Nonconsecutive trace')
        for token, snapshot in view.present.items():
            if token in self.snapshots:
                require(token in self.previous_present, 'Token reappeared after disappearance')
                prior = self.snapshots[token]
                updated = bool(self.histories[token]) and self.histories[token][-1][0] == self.number
                expected = prior['consecutive_updates'] + 1 if updated else 0
                require(snapshot['consecutive_updates'] == expected, 'Consecutive-update history differs')
                self.counter_checks += 1
            else:
                self.births_unindexed.add(token)
            require(snapshot['successful_updates'] is None, 'Pinned ByteTrack has no cumulative successful-update counter')
            if self.histories[token]:
                require(snapshot['age_since_update'] == view.number - self.histories[token][-1][0], 'Observation age differs')
                self.age_checks += 1

    def commit(self, view):
        for token, update in view.updates.items():
            require(not self.histories[token] or update['key'][0] > self.histories[token][-1][0], 'History is not append-only')
            self.histories[token].append(update['key'])
        self.number = view.number; self.previous_present = set(view.present)
        self.snapshots.update(view.present)

    def assert_prefix(self, token, prefix):
        require(tuple(self.histories[token][:len(prefix)]) == tuple(prefix), 'Immutable prefix differs')


def temporal_sequence(frames, anchors, horizon=HORIZON):
    by_frame = defaultdict(list); interests = set()
    for a in anchors:
        by_frame[a['frame']].append(a)
        interests.add((a['selected_token'], a['competitor_token']))
    ledger = HistoryLedger(); active = []; previous_support = {}; initialized = 0
    for frame in frames:
        view = FrameView(frame); ledger.check(view)
        for a in active:
            offset = view.number - a['frame']
            if offset > horizon:
                continue
            for token_key, prefix_key in (('selected_token', 'selected_prefix'), ('competitor_token', 'competitor_prefix')):
                ledger.assert_prefix(a[token_key], a[prefix_key])
            state = view.relation(a['selected_token'], a['competitor_token']) if a['history_anchored'] else {'state': 'unanchored_history'}
            a['future'].append(state)
        active = [a for a in active if view.number - a['frame'] < horizon]
        for a in by_frame.get(view.number, []):
            r, q = a['selected_token'], a['competitor_token']
            anchor_state = view.relation(r, q)
            require(anchor_state['state'] == 'shared_stage_gate' and anchor_state['signed_gap_supported'], 'Anchor support differs')
            require(anchor_state['active_confirmed_competitor'], 'Anchor competitor role differs')
            require(view.present[r]['age_since_update'] >= 2, 'Anchor must be missed selected row')
            rp, qp = tuple(ledger.histories[r]), tuple(ledger.histories[q])
            a.update(group=risk_group(a), history_anchored=bool(rp and qp), future=[],
                     selected_prefix=rp, competitor_prefix=qp,
                     previous_support=previous_support.get((r, q), {'state': 'no_recorded_selected_update'}),
                     previous_update_gap=view.number-rp[-1][0] if rp else None)
            active.append(a); initialized += 1
        for r, q in interests:
            if r in view.updates:
                previous_support[(r, q)] = view.relation(r, q)
        ledger.commit(view)
    require(initialized == len(anchors), 'Missing anchor frame')
    for a in anchors:
        a['future'].extend({'state': 'sequence_end'} for _ in range(horizon-len(a['future'])))
        require(len(a['future']) == horizon, 'Follow-up length differs')
    return {'frames': ledger.number, 'age_checks': ledger.age_checks, 'counter_checks': ledger.counter_checks,
            'tokens_with_unindexed_birth': len(ledger.births_unindexed)}


def state_counts(states):
    counts = Counter(s['state'] for s in states)
    require(set(counts).issubset(STATES), 'Unknown support state')
    return {s: counts[s] for s in STATES}


def prefix(row, gap=False):
    length = 0
    for state in row['future']:
        if state['state'] != 'shared_stage_gate' or gap and not state['signed_gap_supported']:
            return length, state['state'] if state['state'] != 'shared_stage_gate' else 'gap_not_supported'
        length += 1
    return length, 'horizon_end'


def core_summary(rows):
    lags = {}
    for lag in LAGS:
        states = [r['future'][lag-1] for r in rows]
        lags[str(lag)] = {'denominator': len(rows), 'states': state_counts(states),
            'signed_gap_support': sum(s.get('signed_gap_supported', False) for s in states),
            'active_confirmed_gate_support': sum(s['state'] == 'shared_stage_gate' and s['active_confirmed_competitor'] for s in states)}
    prefixes = [prefix(r) for r in rows]; gaps = [prefix(r, True) for r in rows]
    return {'alternatives': len(rows), 'history_anchored': sum(r['history_anchored'] for r in rows),
            'previous_accepted_observation': state_counts([r['previous_support'] for r in rows]),
            'previous_signed_gap_support': sum(r['previous_support'].get('signed_gap_supported', False) for r in rows),
            'previous_update_gap': distribution([r['previous_update_gap'] for r in rows if r['previous_update_gap'] is not None]),
            'lags': lags, 'gate_prefix_lengths': dict(sorted(Counter(str(n) for n, _ in prefixes).items(), key=lambda x: int(x[0]))),
            'gate_prefix_stops': dict(sorted(Counter(reason for _, reason in prefixes).items())),
            'signed_gap_prefix_lengths': dict(sorted(Counter(str(n) for n, _ in gaps).items(), key=lambda x: int(x[0]))),
            'signed_gap_prefix_stops': dict(sorted(Counter(reason for _, reason in gaps).items())),
            'gate_support_resumes_after_first_stop': sum(any(s['state'] == 'shared_stage_gate' for s in r['future'][prefix(r)[0]+1:]) for r in rows)}


def summarize(rows):
    """Only fixed-label counts/distributions: no raw histories or locations."""
    return {'all': core_summary(rows), 'groups': {g: core_summary([r for r in rows if r['group'] == g]) for g in GROUPS}}


def local_path(path):
    path = path.resolve()
    require(path.is_relative_to(ROOT / 'artifacts') and '.local.' in path.name, 'Raw output/seal must stay in ignored artifacts with .local. name')
    return path


def freeze(output, seal):
    seal = local_path(seal)
    require(not output.exists() and not seal.exists(), 'Do not overwrite frozen definitions')
    exposure = json.loads((ROOT / SOURCE).read_text())
    implementation = {**exposure['implementation_sha256'],
        **{name: sha256_file(ROOT / name) for name in ('tools/diagnose_tracking_competition.py',
            'tools/diagnose_tracking_temporal_support.py', 'tests/test_tracking_temporal_support.py')}}
    for name, digest in implementation.items():
        verify_hash(ROOT / name, digest)
    definitions = {
        'format': 'depthport.temporal-support-protocol.v1',
        'frozen_at_utc': datetime.now(timezone.utc).isoformat(),
        'base_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'status': 'Local freeze after synthetic contracts, before temporal extraction; prior structure outcomes already known. Not external preregistration or new independent confirmation.',
        'source_protocol': {'path': SOURCE, 'sha256': sha256_file(ROOT / SOURCE)},
        'structure_record': {'path': STRUCTURE, 'sha256': sha256_file(ROOT / STRUCTURE)},
        'phase_records': [{'path': p, 'sha256': sha256_file(ROOT / p)} for p in RECORDS],
        'runtime': {k: exposure['runtime'][k] for k in ('numpy', 'scipy')},
        'implementation_sha256': implementation,
        'cohort': 'All 197 reference alternatives, 178 selected edges / 177 frames / 16 sources. Preserve original discovery and reserved-confirmation labels, zeros and complete source order. No GT or new source/clip selection.',
        'risk_groups': {'occupancy': ['occupied', 'available'], 'effects': list(EFFECTS),
            'definition': 'Occupancy of competitor in accepted weak matching crossed with forced-alternative accepted update-set effect: same rows; equal count with row replacement; fewer updates; all remaining other. No dropped/merged groups; hypothetical replacement, not veto effects.'},
        'history': 'Append-only accepted association keys (frame, immutable full-cache detection index), across high/weak stages. Probe token owns one ledger; verify nonempty anchor prefixes, consecutive-update counters and age. Pinned ByteTrack cumulative successful-update counter is unavailable (null), not fabricated. No native-ID, nearest-box or cross-arm joins. Birth indices not recorded: do not invent them or claim complete birth histories. Unanchored pairs retain explicit unknown status.',
        'support': 'At each next frame use the same selected hypothesis recorded accepted observation and the competitor in that same stage. Compare stored score against that stage original gate. Missing update, absent hypothesis, earlier-stage accepted competitor, sequence end and unanchored history are separate states, not negative geometry. No comparison to the same numeric detection index in a different frame.',
        'signed_gap_support': f'Secondary: admissible same-stage support and selected_score-competitor_score <= {MARGIN}; original one-sided margin, not new tolerance. Active confirmed competitor role is reported separately; future selected hypothesis need not remain missed.',
        'primary_lag_frames': 1, 'report_lags_frames': list(LAGS), 'followup_horizon_frames': HORIZON,
        'horizon_rationale': 'All consecutive frames through existing buffer=30, not 30 seconds or a tuned decision window. Primary adjacent-frame result; fixed secondary lags only descriptive.',
        'previous_support': 'Relation on last recorded selected-hypothesis accepted observation strictly before anchor, with elapsed gap; do not skip forward to next update or substitute another hypothesis.',
        'persistence': 'Length of consecutive observed same-stage gate-support prefix starting at anchor+1; stop on first non-support OR not-comparable state, distinguish stop reason. End/horizon censored. Also report secondary signed-gap prefix and later resumption. No continuity claim across unknowns.',
        'denominator': 'Every original alternative at every lag, including not-comparable/censored. Group/source counts not independent people/events; no post-hoc cutoff, risk ranking, quality score or online use of future observations.',
        'decision': 'Temporal support can motivate a separately frozen causal/past-only intervention; it cannot establish correct physical identity or select an online veto without GT harm criteria and genuinely new confirmation. Keep weak continuation and all controls/defaults unchanged.',
        'support_states': list(STATES), 'gt_read': False, 'retuned': False,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(definitions, indent=2, ensure_ascii=False) + '\n')
    seal.parent.mkdir(parents=True, exist_ok=True)
    seal.write_text(json.dumps({'protocol_sha256': sha256_file(output), 'frozen_at_utc': definitions['frozen_at_utc']}, indent=2)+'\n')
    print(json.dumps({'protocol_sha256': sha256_file(output), 'temporal_extraction_started': False}))


def analyze(protocol_path, seal_path, phase_inputs):
    protocol = json.loads(protocol_path.read_text()); digest = sha256_file(protocol_path)
    seal = json.loads(local_path(seal_path).read_text())
    require(seal['protocol_sha256'] == digest, 'Local freeze seal differs')
    require(protocol['report_lags_frames'] == list(LAGS) and protocol['followup_horizon_frames'] == HORIZON, 'Support definitions differ')
    for name, expected in protocol['implementation_sha256'].items():
        verify_hash(ROOT / name, expected)
    for entry in (protocol['source_protocol'], protocol['structure_record'], *protocol['phase_records']):
        verify_hash(ROOT / entry['path'], entry['sha256'])
    require([r for r, _ in phase_inputs] == [ROOT / e['path'] for e in protocol['phase_records']], 'Complete ordered phase inputs required')
    previous, anchors = structure_analysis(ROOT / protocol['source_protocol']['path'], phase_inputs)
    frozen = json.loads((ROOT / protocol['structure_record']['path']).read_text())
    require(previous == frozen, 'Prior structure does not reproduce exactly')
    phases = []; all_rows = []; checks = Counter()
    for phase, (_, raw_dir) in zip(previous['phases'], phase_inputs):
        name = phase['phase']; phase_rows = []; scenes = []
        record = json.loads((ROOT / next(e['path'] for e in protocol['phase_records'] if name in e['path'])).read_text())
        for scene, source_scene in zip(phase['sequences'], record['ledger']):
            rows = [dict(a) for a in anchors if a['phase'] == name and a['scene'] == scene['name']]
            path = raw_dir / scene['name'] / 'activation_control-trace.local.jsonl'
            verify_hash(path, source_scene['arms']['activation_control']['trace_sha256'])
            with path.open() as file:
                reconciliation = temporal_sequence((json.loads(line) for line in file), rows)
            require(reconciliation['frames'] == scene['frames_inspected'], 'Full trace length differs')
            checks.update(reconciliation)
            scenes.append({'name': scene['name'], 'frames_inspected': reconciliation['frames'],
                           'groups': {g: sum(r['group'] == g for r in rows) for g in GROUPS},
                           'summary': core_summary(rows)})
            phase_rows.extend(rows)
        phases.append({'phase': name, 'sequences': scenes, 'summary': summarize(phase_rows)})
        all_rows.extend(phase_rows)
    require(len(all_rows) == frozen['combined']['alternatives'], 'Cohort count differs')
    result = {'format': 'depthport.temporal-support.v1', 'protocol_sha256': digest,
        'scope': 'Frozen definitions before temporal extraction on already known reference cohort; no identity/quality or independent confirmation claim.',
        'tracking_rerun': False, 'retuned': False, 'gt_read': False, 'raw_details_public': False,
        'birth_observations_complete': False, 'reconciliation': dict(checks),
        'phases': phases, 'combined': summarize(all_rows)}
    return result, all_rows


def main():
    p = argparse.ArgumentParser(description=__doc__); sub = p.add_subparsers(dest='command', required=True)
    f = sub.add_parser('freeze'); f.add_argument('--output', type=Path, required=True)
    f.add_argument('--seal', type=Path, required=True)
    a = sub.add_parser('analyze'); a.add_argument('--protocol', type=Path, required=True)
    a.add_argument('--seal', type=Path, required=True)
    a.add_argument('--phase', nargs=2, action='append', required=True, metavar=('RECORD', 'RAW_DIRECTORY'))
    a.add_argument('--output', type=Path, required=True); a.add_argument('--local-details', type=Path, required=True)
    args = p.parse_args()
    if args.command == 'freeze':
        freeze(args.output, args.seal); return
    result, details = analyze(args.protocol, args.seal, [(Path(r).resolve(), Path(d).resolve()) for r, d in args.phase])
    local = local_path(args.local_details); local.parent.mkdir(parents=True, exist_ok=True)
    local.write_text(json.dumps(details, indent=2, allow_nan=False)+'\n')
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
    print(json.dumps({'alternatives': len(details), 'tracking_rerun': False, 'gt_read': False}))


if __name__ == '__main__':
    main()
