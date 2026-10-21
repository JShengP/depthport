# SPDX-License-Identifier: AGPL-3.0-only
"""Unseen-source denominator, freeze, source-integrity and publication contracts."""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ARMS=('birth_continuation','past_competition_handoff')


def read(name):return json.loads((ROOT/f'docs/validation/{name}.json').read_bytes())


def test_separate_rules_code_and_previous_evidence_remain_frozen():
    p=read('v0.3-handoff-controls-protocol');r=read('v0.3-handoff-controls')
    assert hashlib.sha256((ROOT/'docs/validation/v0.3-handoff-controls-protocol.json').read_bytes()).hexdigest()==r['protocol_sha256']
    assert len(p['rule_sha256'])==2
    for group in ('implementation_sha256','source_records_sha256','rule_sha256'):
        for path,sha in p[group].items():assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==sha
    assert [read(n)['arm'] for n in ('v0.3-birth-continuation-rule','v0.3-past-handoff-rule')]==list(ARMS)
    assert p['original_archive_files']==r['sealed_original_files_rechecked']==434
    assert r['prior_records_unchanged'] and not r['prior_discovery_complete']
    assert not any(r['prior_formal_replication_flags'].values())
    assert r['original_failures_retained']==[f'KITTI-{i:04d}' for i in range(4)]


def test_complete_fixed_sources_preparation_and_native_first_seal():
    p=read('v0.3-handoff-controls-protocol');r=read('v0.3-handoff-controls')
    prep=read('v0.3-handoff-controls-preparation');refs=read('v0.3-handoff-controls-references')
    assert r['new_sources']==[s['name'] for s in p['new_sources']]==['KITTI-0010','KITTI-0011']
    assert [s['frames'] for s in p['new_sources']]==[294,373]
    assert r['unique_source_frames']==sum(s['frames'] for s in p['new_sources'])==667
    assert len(r['ledger'])==len(refs['ledger'])==len(prep['ledger'])==2
    assert [s['name'] for s in r['ledger']]==[s['name'] for s in prep['ledger']]==r['new_sources']
    assert prep['protocol_sha256']==refs['protocol_sha256']==r['protocol_sha256']
    assert refs['all_native_before_candidates']
    assert hashlib.sha256((ROOT/'docs/validation/v0.3-handoff-controls-references.json').read_bytes()).hexdigest()==r['references_sha256']
    for spec,row in zip(p['new_sources'],prep['ledger']):
        if row['status']=='completed':assert row['pixel_identical_frames']==row['frames']==spec['frames']
    assert r['all_scheduled_completed']==all(s['status']=='completed' for s in r['ledger'])


def test_repeats_full_native_outputs_and_input_receipts_reconcile():
    r=read('v0.3-handoff-controls')
    for row in r['ledger']:
        if row['status']!='completed':
            assert row['comparisons'] is None
            continue
        assert row['repeat_equal'] and row['native_instrumentation_equal']
        assert row['source_lock']['capped_frames']==0
        for arm in ('observed_native','projection',*ARMS):
            a,b=(row['passes'][f'{arm}-{i}'] for i in (0,1));assert a==b
            assert a['accepted_summary']['frames']==row['frames']
            assert a['accepted_summary']['input_receipt_sha256']==row['passes']['projection-0']['accepted_summary']['input_receipt_sha256']
            if arm=='observed_native':
                for name in ('predictions.local.json','native-output.local.json','final-state.local.pickle'):
                    assert a['sha256'][name]==row['native_reference']['sha256'][name]
        for arm in ARMS:
            c=row['comparisons'][arm];m=c['membership']
            assert c['all_observable_input_gates_pass']==all(c['observable_input_gates'].values())
            assert c['effective_candidate_exposure']==(row['passes'][arm+'-0']['counts']['actions']>0)
            assert c['legacy_strict_active_gate_pass']==m['original_membership_proxy_gates']['no_lost_active_update_pairs']
            for v in m['membership'].values():
                assert v['reference']==v['common']+v['lost'] and v['control']==v['common']+v['added']
            assert not c['identity_or_accuracy_accepted']
    for arm in ARMS:
        expected=r['all_scheduled_completed'] and all(s['comparisons'][arm]['effective_candidate_exposure']
            and s['comparisons'][arm]['all_observable_input_gates_pass'] for s in r['ledger'])
        assert r['candidate_replication_gates'][arm]==expected


def test_public_reports_exclude_raw_cases_and_do_not_claim_accuracy():
    forbidden={'bbox','objects','input','local_token','tracker_id','row','column','alternative_row',
               'predictions','state','covariance','similarity','caches','video','local_path'}
    def walk(v):
        if isinstance(v,dict):
            assert not (set(v)&forbidden)
            for child in v.values():walk(child)
        elif isinstance(v,list):
            for child in v:walk(child)
    for name in ('v0.3-handoff-controls','v0.3-handoff-controls-references','v0.3-handoff-controls-preparation'):walk(read(name))
    r=read('v0.3-handoff-controls')
    assert not any(r[k] for k in ('gt_read','accuracy_scoring','retuned','weak_stage_changed','defaults_changed','tracking_quality_accepted'))
