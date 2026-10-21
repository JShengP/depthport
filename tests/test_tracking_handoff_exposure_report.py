# SPDX-License-Identifier: AGPL-3.0-only
"""Complete-source provenance, selection independence and zero/failure accounting."""
from pathlib import Path
import hashlib
import json
from depthport.tracking_handoff_selection import GROUPS, exposure, select, confirmation
ROOT=Path(__file__).resolve().parents[1]
PREFIX='docs/validation/v0.3-handoff-exposure-'


def read(suffix):return json.loads((ROOT/(PREFIX+suffix+'.json')).read_bytes())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def test_rules_implementation_history_and_original_harm_contracts_remain_frozen():
    p=read('protocol');old=json.loads((ROOT/'docs/validation/v0.3-handoff-controls-protocol.json').read_bytes())
    for group in ('implementation_sha256','source_records_sha256','rule_sha256'):
        for path,digest in p[group].items():assert sha(ROOT/path)==digest
    assert p['parent_protocol_sha256']==sha(ROOT/'docs/validation/v0.3-handoff-controls-protocol.json')
    for key in ('rule_sha256','parameters','margin','detector_settings','runtime'):
        assert p[key]==old[key]
    assert p['definitions']['harm_per_scene']==old['definitions']['harm_per_scene']


def test_full_fixed_phase_ledgers_inputs_and_references_reconcile():
    p=read('protocol');frames=[]
    for phase,names in (('discovery',[f'KITTI-{i:04d}' for i in range(12,17)]),('confirmation',['KITTI-0017','KITTI-0018'])):
        d=read(phase);refs=read(phase+'-references');prep=read(phase+'-preparation')
        specs=[s for s in p['new_sources'] if s['phase']==phase]
        assert [s['name'] for s in specs]==[s['name'] for s in d['ledger']]==[s['name'] for s in refs['ledger']]==[s['name'] for s in prep['ledger']]==names
        assert d['protocol_sha256']==refs['protocol_sha256']==prep['protocol_sha256']==sha(ROOT/(PREFIX+'protocol.json'))
        assert d['references_sha256']==sha(ROOT/(PREFIX+phase+'-references.json'))
        assert refs['all_native_before_candidates']
        assert d['all_scheduled_completed']==all(r['status']=='completed' for r in d['ledger'])
        assert d['unique_source_frames']==sum(s['frames'] for s in specs)
        frames.append(d['unique_source_frames'])
        for row,pre in zip(d['ledger'],prep['ledger']):
            if row['status']!='completed':assert row['comparisons'] is None;continue
            assert row['repeat_equal'] and row['native_instrumentation_equal'] and row['source_lock']['capped_frames']==0
            assert row['frames']==pre['pixel_identical_frames']
            for arm in ('observed_native','projection','birth_continuation','past_competition_handoff'):
                a,b=(row['passes'][f'{arm}-{i}'] for i in (0,1));assert a==b
                assert a['accepted_summary']['frames']==row['frames']
                if arm=='observed_native':
                    for name in ('predictions.local.json','native-output.local.json','final-state.local.pickle'):
                        assert a['sha256'][name]==row['native_reference']['sha256'][name]
    assert frames==[1109,484]


def test_actual_role_selection_harm_independence_and_no_retroactive_confirmation():
    d=read('discovery');c=read('confirmation')
    assert d['selected']==select(d['ledger'])==c['discovery_selected']
    assert c['discovery_sha256']==sha(ROOT/(PREFIX+'discovery.json'))
    assert c['confirmation_gates']==confirmation(d['ledger'],c['ledger'])
    for report in (d,c):
        for group in GROUPS:
            assert report['role_exposures'][group]==[{'name':r['name'],'count':exposure(r,group)} for r in report['ledger']]
        assert report['original434_unchanged'] and report['prior_raw_unchanged']
        assert not any(report[k] for k in ('gt_read','accuracy_scoring','retuned','weak_stage_changed','defaults_changed','tracking_quality_accepted'))
        assert not any(report['prior_candidate_replication_gates'].values())
        assert not any(report['prior_formal_replication_flags'].values())


def test_reviewed_evidence_has_no_raw_event_state_or_host_paths():
    forbidden={'bbox','objects','input','local_token','tracker_id','row','column','alternative_row','predictions','state','covariance','similarity','caches','video','local_path'}
    def walk(v):
        if isinstance(v,dict):
            assert not set(v)&forbidden
            for x in v.values():walk(x)
        elif isinstance(v,list):
            for x in v:walk(x)
        elif isinstance(v,str):assert '/home/' not in v and 'rtsp://' not in v
    for phase in ('discovery','confirmation'):
        for suffix in ('','-references','-preparation'):walk(read(phase+suffix))
