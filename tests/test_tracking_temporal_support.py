# SPDX-License-Identifier: AGPL-3.0-only
"""Synthetic immutable-observation/temporal definitions, before real extraction."""
from copy import deepcopy
import json
import pytest
from tools.diagnose_tracking_temporal_support import (FrameView, HistoryLedger, risk_group,
    temporal_sequence, summarize, prefix, GROUPS, HORIZON, LAGS, analyze, local_path)


class Trace:
    def __init__(self):
        self.last = {}; self.count = {}; self.number = 0

    def frame(self, observations, present=(11, 22), high=(), cross=.79):
        self.number += 1; n = self.number
        tracks = []
        for token in present:
            self.last.setdefault(token, n-1); self.count.setdefault(token, 1)
            if self.last[token] != n-1:
                self.count[token] = 0
            tracks.append({'token': token, 'tracker_id': token + 100,
                'age_since_update': n-self.last[token], 'successful_updates': None,
                'consecutive_updates': self.count[token]})
        stages = []
        for stage_index, name in enumerate(('high_all', 'weak_remaining')):
            chosen = {t: idx for t, idx in observations.items() if (t in high) == (stage_index == 0)}
            refs = tracks if stage_index == 0 else [t for t in tracks if t['token'] not in high]
            indices = list(chosen.values()); ordered = list(chosen)
            matrix = [[.8 if t['token'] == owner else cross for owner in ordered] for t in refs]
            matched = [[i, ordered.index(t['token'])] for i, t in enumerate(refs) if t['token'] in chosen]
            stages.append({'name': name, 'gate': .1 if stage_index == 1 else .25,
                'tracks': deepcopy(refs), 'detection_indices': indices, 'similarity': matrix,
                'matched': matched})
        for token in observations:
            self.last[token] = n; self.count[token] += 1
        return {'frame': n, 'stages': stages, 'deferred': []}


def anchor(frame=3, occupied=True, lost=0, gained=0):
    return {'frame': frame, 'selected_token': 11, 'competitor_token': 22,
            'occupied': occupied, 'accepted_count_change': gained-lost,
            'lost_updated_rows': lost, 'gained_updated_rows': gained}


def sequence():
    t = Trace()
    return [t.frame({11: 0, 22: 1}), t.frame({22: 1}), t.frame({11: 0, 22: 1}),
            t.frame({11: 9, 22: 7}), t.frame({22: 1}), t.frame({11: 3, 22: 2})]


def test_risk_cartesian_partition_preserves_all_zero_groups():
    assert risk_group(anchor()) == 'occupied/same_updated_rows'
    assert risk_group(anchor(lost=1, gained=1)) == 'occupied/row_replacement'
    assert risk_group(anchor(lost=1)) == 'occupied/fewer_updates'
    assert risk_group(anchor(occupied=False, gained=1)) == 'available/other'
    bad = anchor(); bad['accepted_count_change'] = 5
    with pytest.raises(ValueError, match='counts differ'):
        risk_group(bad)


def test_same_lineage_uses_future_immutable_observation_not_same_numeric_index():
    rows = [anchor()]; checks = temporal_sequence(sequence(), rows)
    a = rows[0]
    assert checks['frames'] == 6 and checks['age_checks'] > 0 and checks['counter_checks'] > 0
    assert a['history_anchored'] and a['previous_update_gap'] == 2
    assert a['selected_prefix'] == ((1, 0),) and a['competitor_prefix'] == ((1, 1), (2, 1))
    assert a['future'][0]['selected_observation'] == (4, 9)
    assert a['future'][0]['state'] == 'shared_stage_gate'
    assert a['future'][1]['state'] == 'selected_no_update'
    assert a['future'][2]['state'] == 'shared_stage_gate'
    assert a['future'][3]['state'] == 'sequence_end'
    assert prefix(a) == (1, 'selected_no_update')
    public = summarize(rows)
    assert public['all']['gate_support_resumes_after_first_stop'] == 1
    assert set(public['groups']) == set(GROUPS)
    assert public['groups']['available/other']['alternatives'] == 0
    assert all(v['denominator'] == 1 for v in public['all']['lags'].values())


def test_earlier_high_stage_competitor_is_not_negative_weak_geometry():
    t = Trace(); frame = t.frame({11: 4, 22: 8}, high=(22,))
    s = FrameView(frame).relation(11, 22)
    assert s['state'] == 'competitor_other_stage_update'
    assert s['selected_observation'] == (1, 4) and s['competitor_observation'] == (1, 8)


@pytest.mark.parametrize('present,observations,expected', [
    ((11,), {11: 0}, 'competitor_absent'),
    ((22,), {22: 0}, 'selected_absent'),
    ((11, 22), {22: 0}, 'selected_no_update')])
def test_absence_and_missing_update_stay_separate(present, observations, expected):
    t = Trace(); assert FrameView(t.frame(observations, present=present)).relation(11, 22)['state'] == expected


def test_original_stage_gates_signed_margin_and_active_role_are_separate():
    t = Trace(); frame = t.frame({11: 0, 22: 1}, cross=.05)
    assert FrameView(frame).relation(11, 22)['state'] == 'shared_stage_below_gate'
    frame['stages'][1]['similarity'][1][0] = .4
    s = FrameView(frame).relation(11, 22)
    assert s['state'] == 'shared_stage_gate' and not s['signed_gap_supported']
    frame['stages'][1]['similarity'][1][0] = .9
    s = FrameView(frame).relation(11, 22)
    assert s['signed_gap_supported'] and s['active_confirmed_competitor']


def test_native_id_changes_do_not_retarget_observation_history():
    frames = sequence()
    for stage in frames[3]['stages']:
        for snapshot in stage['tracks']:
            snapshot['tracker_id'] = 99999
    rows = [anchor()]; temporal_sequence(frames, rows)
    assert rows[0]['future'][0]['selected_observation'] == (4, 9)


def test_unanchored_history_is_counted_without_invented_birth_observation():
    t = Trace(); f = t.frame({11: 0, 22: 1})
    # First appearance may already be confirmed/missed, but its past is unknown.
    for stage in f['stages']:
        stage['tracks'][0]['age_since_update'] = 2
    rows = [anchor(frame=1)]; temporal_sequence([f], rows)
    assert not rows[0]['history_anchored'] and rows[0]['selected_prefix'] == ()
    assert rows[0]['future'][0]['state'] == 'sequence_end'
    assert summarize(rows)['all']['history_anchored'] == 0


@pytest.mark.parametrize('field,value,message', [('consecutive_updates', 42, 'Consecutive-update'),
                                                ('age_since_update', 42, 'age differs')])
def test_history_state_reconciliation_fails_closed(field, value, message):
    frames = sequence()
    for stage in frames[3]['stages']:
        stage['tracks'][0][field] = value
    with pytest.raises(ValueError, match=message):
        temporal_sequence(frames, [anchor()])


def test_token_reappearance_duplicate_observations_and_nonconsecutive_frames_rejected():
    t = Trace(); frames = [t.frame({11: 0, 22: 1}), t.frame({11: 0}, present=(11,)), t.frame({11: 0, 22: 1})]
    with pytest.raises(ValueError, match='reappeared'):
        temporal_sequence(frames, [])
    frames = sequence(); frames[1]['frame'] = 8
    with pytest.raises(ValueError, match='Nonconsecutive'):
        temporal_sequence(frames, [])
    f = Trace().frame({11: 0, 22: 0})
    with pytest.raises(ValueError, match='Duplicate detection'):
        FrameView(f)


def test_modified_prefix_cannot_bridge_lineage():
    ledger = HistoryLedger(); ledger.histories[11] = [(1, 2)]
    with pytest.raises(ValueError, match='prefix differs'):
        ledger.assert_prefix(11, [(1, 3)])


def test_summary_whitelist_omits_raw_keys_and_seal_mismatch_rejected(tmp_path, monkeypatch):
    rows = [anchor()]; temporal_sequence(sequence(), rows)
    rows[0]['private_sentinel'] = 'never publish this'
    public = json.dumps(summarize(rows))
    assert 'never publish this' not in public and 'selected_prefix' not in public and 'selected_observation' not in public
    assert HORIZON == 30 and LAGS == (1, 2, 5, 10, 30)
    import tools.diagnose_tracking_temporal_support as module
    monkeypatch.setattr(module, 'ROOT', tmp_path)
    seal = tmp_path/'artifacts/freeze.local.json'; seal.parent.mkdir(); seal.write_text('{"protocol_sha256":"wrong"}')
    protocol = tmp_path/'protocol.json'; protocol.write_text('{}')
    with pytest.raises(ValueError, match='seal differs'):
        analyze(protocol, seal, [])
    with pytest.raises(ValueError, match='ignored artifacts'):
        local_path(tmp_path/'public.json')
