# SPDX-License-Identifier: AGPL-3.0-only
import json
import os
from pathlib import Path
import numpy as np
import pytest
from depthport.tracking_past_support_control import ARMS
from depthport.tracking_past_exposure import COUNTS, counts, select, confirm, manifest, canonical, source_metadata
from depthport.video_tracking_benchmark import CACHE_FORMAT, sha256_file


def record(name, vetoes=None, phase='discovery'):
    vetoes = vetoes or {}
    return {'name':name,'phase':phase,'status':'completed','frames':10,'capped_frames':0,
        'unhooked_reference_equal':True,'arms':{a:{'repeat_equal':True,
        'counts':{k:(10 if k=='frames' else vetoes.get(a,0) if k in ('actual_vetoes','frames_with_veto') else 0) for k in COUNTS}} for a in ARMS}}


def test_actual_own_arm_triggers_select_independently_in_fixed_order():
    one=record('one',{ARMS[1]:1});two=record('two',{ARMS[2]:1,ARMS[3]:1});three=record('three',{a:9 for a in ARMS})
    # Huge hypothetical reference opportunities cannot select a treatment.
    one['arms'][ARMS[0]]['counts']['joint']=999
    assert select([three,two,one],['one','two','three']) == {ARMS[1]:'one',ARMS[2]:'two',ARMS[3]:'two'}
    assert all(v is None for v in select([record('zero')],['zero']).values())
    one['arms'][ARMS[1]]['counts']['HOTA']=1
    with pytest.raises(ValueError,match='Only frozen'):select([one],['one'])


def test_failed_incomplete_duplicate_reserved_unstable_and_capped_sources():
    failed=record('bad',{a:9 for a in ARMS});failed.update(status='failed',arms={})
    assert all(v is None for v in select([failed],['bad']).values())
    for rows,order in [([record('one')],['one','two']),([record('one'),record('one')],['one']),([record('r',phase='confirmation')],['r'])]:
        with pytest.raises(ValueError):select(rows,order)
    for field,value in [('capped_frames',1),('unhooked_reference_equal',False),('frames',11)]:
        row=record('one',{a:1 for a in ARMS});row[field]=value
        assert all(v is None for v in select([row],['one']).values())
    row=record('one',{a:1 for a in ARMS});row['arms'][ARMS[1]]['repeat_equal']=False
    assert select([row],['one'])[ARMS[1]] is None


def test_confirmation_cannot_rescue_missing_discovery_or_hide_any_failure():
    discovery={'selection':{a:'selected' for a in ARMS[1:]},'all_scheduled_completed':True}
    reserved=[record('r1',{a:1 for a in ARMS},'confirmation'),record('r2',{a:1 for a in ARMS},'confirmation')]
    assert all(r['exposure_replicated_in_both_reserved'] for r in confirm(discovery,reserved).values())
    discovery['selection'][ARMS[1]]=None
    assert not confirm(discovery,reserved)[ARMS[1]]['exposure_replicated_in_both_reserved']
    assert confirm(discovery,reserved)[ARMS[2]]['exposure_replicated_in_both_reserved']
    discovery['all_scheduled_completed']=False
    assert not any(r['exposure_replicated_in_both_reserved'] for r in confirm(discovery,reserved).values())
    discovery['all_scheduled_completed']=True;reserved[1].update(status='failed',arms={})
    assert not any(r['exposure_replicated_in_both_reserved'] for r in confirm(discovery,reserved).values())
    assert not any(r['exposure_replicated_in_both_reserved'] for r in confirm(discovery,reserved[:1]).values())


def test_role_qualification_counts_keep_empty_frames_and_no_raw_identifiers():
    empty={'deferred':[],'past_support_audit':[],'stages':[]}
    assert counts(empty)=={k:int(k=='frames') for k in COUNTS}
    competitors=[{'role':role,'past':{'qualified':role=='active'},'protection':{'protected':role=='active'}} for role in ('active','retained','unconfirmed')]
    trace={'deferred':[{'row':9,'column':4}],'past_support_audit':[{'veto':True,'competitors':competitors}]}
    result=counts(trace)
    assert result['joint']==result['past_qualified']==result['protected']==1
    assert all(result[k]==1 for k in ('active_alternatives','retained_alternatives','unconfirmed_alternatives','actual_vetoes'))
    assert set(result)==set(COUNTS) and all(type(v) is int for v in result.values())
    trace['deferred']=[]
    with pytest.raises(ValueError,match='Decision'):counts(trace)


def test_manifest_excludes_gt_scores_nested_fields_and_other_phase(tmp_path):
    protocol={'sequences':[{'name':'d','phase':'discovery','source_family':'m'}, {'name':'r','phase':'confirmation','source_family':'k'}]}
    base={'name':'d','video':'unopened','caches':['unopened'],'video_sha256':'a','cache_sha256':['b']}
    p=tmp_path/'inputs.json'
    for value in [{'format':'depthport.past-exposure-inputs.v1','sequences':[], 'gt':'unopened'},
                  {'format':'depthport.past-exposure-inputs.v1','sequences':[{**base,'HOTA':1}]}]:
        p.write_text(json.dumps(value))
        with pytest.raises(ValueError,match='GT-free'):manifest(p,protocol,'discovery')
    p.write_text(json.dumps({'format':'depthport.past-exposure-inputs.v1','sequences':[base]}))
    assert manifest(p,protocol,'discovery')['sequences']==[base]
    with pytest.raises(ValueError,match='order'):manifest(p,protocol,'confirmation')


def test_canonical_hash_only_renames_ids_and_never_drops_empty_frames():
    frames=[{'index':1,'objects':[]},{'index':2,'objects':[{'object_id':'private','class_id':0,'confidence':.2,'bbox':[1,2,3,4]}]}]
    encoded=canonical(frames);frames[1]['objects'][0]['object_id']='renamed'
    assert encoded==canonical(frames) and json.loads(encoded)[0]==[1,[]] and 'private' not in encoded


def test_source_failure_is_retained_with_safe_reason_not_private_exception(tmp_path, monkeypatch):
    from tools.select_tracking_past_exposure import inspect_source
    monkeypatch.setattr('tools.select_tracking_past_exposure.source_metadata', lambda *args: (_ for _ in ()).throw(ValueError('private-path-never-publish')))
    spec={'name':'broken','phase':'discovery','prior_use':'synthetic','frames':1,'fps':10}
    seq={'name':'broken','video':str(tmp_path/'private-path-never-publish'),'video_sha256':'0'*64}
    result=inspect_source(spec,seq,{}, {},tmp_path/'result')
    assert result['status']=='failed' and result['arms']=={}
    assert 'private-path' not in json.dumps(result)
    assert 'private-path' in (tmp_path/'result/failure.local.txt').read_text()


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Optional pinned NumPy 2 trackers')
@pytest.mark.parametrize('arm',ARMS)
def test_real_contested_histories_and_weak_inputs_continuous_across_shards(tmp_path,arm):
    import cv2
    from tools.select_tracking_past_exposure import run_sequence
    video=tmp_path/'source.avi';writer=cv2.VideoWriter(str(video),cv2.VideoWriter_fourcc(*'MJPG'),10,(64,64))
    assert writer.isOpened()
    for _ in range(7):writer.write(np.zeros((64,64,3),dtype=np.uint8))
    writer.release();h=sha256_file(video);box=[10.,10.,30.,40.]
    inputs=[[(box,.9),(box,.9)]]*3+[[([10.2,10.,30.2,40.],.9)],[(box,.2)],[],[(box,.2)]]
    def write(name,offset,items):
        p=tmp_path/name
        p.write_text(json.dumps({'format':CACHE_FORMAT,'video_sha256':h,'source_start_frame':offset+1,
            'width':64,'height':64,'fps':10,'detector':{'model':'fixed','frames_at_detection_cap':0},
            'frames':[{'index':i+1,'detections':[{'bbox':b,'class_id':0,'confidence':s} for b,s in row]} for i,row in enumerate(items)]}))
        return p
    full=write('full.json',0,inputs);one=write('a.json',0,inputs[:3]);two=write('b.json',3,inputs[3:])
    def source(paths):return {'name':'synthetic','video':str(video),'video_sha256':h,'caches':list(map(str,paths)),'cache_sha256':[sha256_file(p) for p in paths]}
    a,pa=run_sequence(source([full]),{'model':'fixed'},arm)
    b,pb=run_sequence(source([one,two]),{'model':'fixed'},arm)
    assert a==b and pa==pb and a['counts']['frames']==7
    assert a['counts']['actual_vetoes']>=1 if arm!=ARMS[0] else a['counts']['actual_vetoes']==0
    assert a['counts']['joint']>=1
    metadata=source_metadata(source([one,two]),{'frames':7,'fps':10},{'model':'fixed'})
    assert metadata['cache_shards']==2 and metadata['cached_detections']==9
    if arm==ARMS[0]:
        unhooked,_=run_sequence(source([full]),{'model':'fixed'},None)
        assert unhooked['prediction_sha256']==a['prediction_sha256']
