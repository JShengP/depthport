# SPDX-License-Identifier: AGPL-3.0-only
"""Published audit against independent original source receipts and denominator contracts."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import pytest
ROOT=Path(__file__).resolve().parents[1]
PREFIX='docs/validation/v0.3-handoff-reachability'


def read(path):return json.loads((ROOT/path).read_bytes())
def sha(path):return hashlib.sha256((ROOT/path).read_bytes()).hexdigest()


def test_public_method_and_original_rules_remain_immutable():
    p=read(PREFIX+'-protocol.json');d=read(PREFIX+'.json')
    assert d['protocol_sha256']==sha(PREFIX+'-protocol.json')
    for group in ('implementation_sha256','source_records_sha256','rule_sha256'):
        for path,digest in p[group].items():assert sha(path)==digest
    old=read('docs/validation/v0.3-handoff-controls-protocol.json')
    assert p['parameters']==old['parameters'] and p['margin']==old['margin']
    assert p['native_gate']==.1


@pytest.mark.parametrize('name',[f'KITTI-{i:04d}' for i in range(12,19)])
def test_every_actual_arm_repeat_reconciles_to_original_full_receipts(name):
    d=read(PREFIX+'.json');r=next(s for s in d['ledger'] if s['name']==name)
    parent=read('docs/validation/v0.3-handoff-exposure-'+r['phase']+'.json')
    original=next(s for s in parent['ledger'] if s['name']==name)
    assert r['frames']==original['frames'] and set(r['trials'])=={f'{a}-{t}' for a in ('birth_continuation','past_competition_handoff') for t in (0,1)}
    if r['status']!='completed':
        assert r['audit'] is None
        assert all(t['status'] in ('completed','failed','not_run') for t in r['trials'].values())
        return
    assert r['archived_repeats_equal']
    for arm,a in r['audit'].items():
        assert a['accepted_summary']==original['passes'][arm+'-0']['accepted_summary']
        assert a['counters']['frames']==r['frames']
        assert a['weak_stage_calls']==original['passes'][arm+'-0']['counts']['weak_stages']
        assert a['counters']['broad_weak_blocked_rows']==original['passes'][arm+'-0']['counts']['weak_blocked_rows']
        assert not a['current_or_future_used_as_prior'] and not a['identity_or_quality_accepted']
        for t in (0,1):
            trial=r['trials'][f'{arm}-{t}'];old=original['passes'][f'{arm}-{t}']
            assert trial['status']=='completed' and trial['frames']==r['frames']
            assert trial['original_trace_sha256']==old['sha256']['trace.local.jsonl.gz']
        a0,a1=(r['trials'][f'{arm}-{t}'] for t in (0,1))
        assert a0==a1
        assert (a['birth_by_role'] is None)==(arm!='birth_continuation')
        assert (a['handoff'] is None)==(arm!='past_competition_handoff')


def test_missing_prerequisites_exclusions_and_formed_proposals_have_distinct_units():
    d=read(PREFIX+'.json')
    for r in d['ledger']:
        if r['audit'] is None:continue
        for arm,a in r['audit'].items():
            c=a['counters']
            assert c['frames']==c['high_stage_frames']+c['no_high_stage_frames']
            assert sum(a['availability_masks'].values())==c['high_stage_frames']
            for name,denominator in (('high_rows','high_rows'),('free_rows','high_free_rows')):
                assert sum(a['roles'][name].values())==sum(a['row_qualification_masks'][name].values())==c[denominator]
            assert sum(a['roles']['qualified_free_rows'].values())==a['row_qualification_masks']['free_rows']['111']
            if arm=='birth_continuation':
                for b in a['birth_by_role'].values():
                    assert b['current_gate']==b['weak_excluded_preproposal_edges']+b['no_weak']
                    assert b['no_weak']==b['ambiguous_nonproposal_edges']+b['qualified_proposals']
                    assert b['qualified_proposals']==b['rule_action_edges'] and b['rejected_qualified_proposals']==0
            else:
                h=a['handoff']
                assert sum(a['handoff_pair_roles'].values())==h['selected_free_triples']
                assert sum(a['handoff_nonproposal_priority'].values())+h['no_weak']==h['selected_free_triples']
                assert h['current_margin']==h['no_weak']+h['weak_excluded_preproposal_edges']
                assert h['unique_alternative_proposals']==h['claim_conflict_proposals']+h['rule_action_edges']
                assert h['selected_zero_alternative']+h['selected_multiple_alternatives']+h['unique_alternative_proposals']==c['high_matched_pairs']


def test_all_sources_zeros_old_failures_and_false_acceptance_gates_stay_visible():
    p=read(PREFIX+'-protocol.json');d=read(PREFIX+'.json')
    assert [(r['name'],r['phase'],r['frames']) for r in d['ledger']]==[(r['name'],r['phase'],r['frames']) for r in p['sources']]
    assert sum(r['frames'] for r in d['ledger'])==d['unique_source_frames']==1593
    assert len(d['ledger'])*4==d['scheduled_histories']==28
    assert 4*d['unique_source_frames']==d['scheduled_trace_frames']==6372
    assert d['all_scheduled_completed']==all(r['status']=='completed' for r in d['ledger'])
    assert d['original434_unchanged'] and d['earlier772_unchanged'] and d['seven_source_raw_unchanged'] and d['prior_records_unchanged']
    old=read('docs/validation/v0.3-handoff-exposure-confirmation.json')
    for field in ('prior_formal_replication_flags','prior_candidate_replication_gates'):
        assert d[field]==old[field] and not any(d[field].values())
    assert d['prior_confirmation_gates']==old['confirmation_gates'] and not any(d['prior_confirmation_gates'].values())
    assert d['original_failures_retained']==read('docs/validation/v0.3-handoff-audit.json')['original_failures_retained']
    assert not any(d[k] for k in ('gt_read','accuracy_scoring','inference','tracking_rerun','solver_rerun','retuned','weak_stage_changed','defaults_changed','tracking_quality_accepted','independent_confirmation'))


def test_public_aggregate_contains_no_raw_observations_or_host_paths():
    forbidden={'bbox','input_boxes','input_confidences','local_token','tracker_id','token','row','column','alternative_row','similarity','covariance','context','last_keys','local_path','predicates'}
    def walk(v):
        if isinstance(v,dict):
            assert not set(v)&forbidden
            for item in v.values():walk(item)
        elif isinstance(v,list):
            for item in v:walk(item)
        elif isinstance(v,str):assert '/home/' not in v and 'rtsp://' not in v
    walk(read(PREFIX+'.json'))
