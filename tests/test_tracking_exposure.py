# SPDX-License-Identifier: AGPL-3.0-only
import json
import os
from pathlib import Path
import numpy as np
import pytest
from depthport.tracking_exposure import COUNT_KEYS,SCAN_ARMS,exposure_counts,selection,load_inputs,iter_caches,validate_cohort
from depthport.video_tracking_benchmark import CACHE_FORMAT,sha256_file


def row(name,phase='discovery',veto=0,repeat=True):
    return {'name':name,'phase':phase,'status':'completed','arms':{a:{'repeat_equal':repeat,
        'counts':{k:(veto if k in ('actual_vetoes','frames_with_veto') else 99) for k in COUNT_KEYS}} for a in SCAN_ARMS[1:]}}


def test_selection_uses_own_actual_vetoes_not_reference_opportunities_or_scores():
    a=row('first',veto=0);b=row('second',veto=1);c=row('third',veto=12)
    assert set(selection([c,a,b],['first','second','third']).values())=={'second'}
    assert set(selection([a],['first']).values())=={None}
    b['arms'][SCAN_ARMS[1]]['counts']['actual_vetoes']=0
    assert selection([a,b],['first','second'])[SCAN_ARMS[1]] is None
    with pytest.raises(ValueError,match='Only frozen'):
        b['arms'][SCAN_ARMS[2]]['counts']['HOTA']=1
        selection([a,b],['first','second'])


def test_confirmation_and_incomplete_ledgers_cannot_select_discovery():
    with pytest.raises(ValueError,match='Confirmation'):
        selection([row('reserved','confirmation',veto=3)],['reserved'])
    for records,order in [([row('one')],['one','two']),([row('one'),row('one')],['one'])]:
        with pytest.raises(ValueError):selection(records,order)
    r=row('failed',veto=1);r['status']='failed'
    assert set(selection([r],['failed']).values())=={None}
    assert set(selection([row('unstable',veto=1,repeat=False)],['unstable']).values())=={None}


def test_counts_separate_occupied_available_and_equivalent_without_identifiers():
    t={'deferred':[{'row':2,'column':3}], 'competition_audit':[{'competitors':[
        {'assigned_elsewhere':True,'equivalent':True}, {'assigned_elsewhere':False,'equivalent':False}]}]}
    r=exposure_counts(t)
    assert r['actual_vetoes']==1 and r['frames_with_veto']==1
    assert r['available_edges']==1 and r['equivalent_edges']==1
    assert r['occupied_alternatives']==1 and r['available_alternatives']==1
    assert set(r)==set(COUNT_KEYS) and all(type(v) is int for v in r.values())


def cache_file(tmp_path,name,start=1,frames=2,video_hash='a'*64,detector=None):
    p=tmp_path/name;d={'format':CACHE_FORMAT,'video_sha256':video_hash,'source_start_frame':start,
        'width':64,'height':64,'fps':30,'detector':detector or {'model':'fixed'},
        'frames':[{'index':i+1,'detections':[]} for i in range(frames)]}
    p.write_text(json.dumps(d));return p


def test_shards_reject_gaps_changes_and_digest_mismatch(tmp_path):
    one=cache_file(tmp_path,'one.json');two=cache_file(tmp_path,'two.json',start=3)
    seq={'video_sha256':'a'*64,'caches':[str(one),str(two)],'cache_sha256':[sha256_file(one),sha256_file(two)]}
    assert sum(len(c['frames']) for c in iter_caches(seq,{'model':'fixed'}))==4
    for bad in [cache_file(tmp_path,'gap.json',start=4),cache_file(tmp_path,'source.json',start=3,video_hash='b'*64),
                cache_file(tmp_path,'model.json',start=3,detector={'model':'changed'})]:
        seq['caches'][1]=str(bad);seq['cache_sha256'][1]=sha256_file(bad)
        with pytest.raises(ValueError):list(iter_caches(seq,{'model':'fixed'}))
    seq['cache_sha256'][1]='c'*64
    with pytest.raises(ValueError,match='Immutable'):list(iter_caches(seq,{'model':'fixed'}))


def test_gt_paths_rejected_at_root_and_per_sequence_before_open(tmp_path):
    protocol={'sequences':[{'name':'one','frames':2,'phase':'discovery','source_family':'a'},
        {'name':'holdout','frames':2,'phase':'confirmation','source_family':'b'}],'detector_settings':{'model':'fixed'}}
    p=tmp_path/'manifest.json'
    for m in [{'format':'depthport.exposure-inputs.v1','sequences':[],'gt':'never-open'},
        {'format':'depthport.exposure-inputs.v1','sequences':[{'name':'one','gt':'never-open'},{'name':'holdout'}]}]:
        p.write_text(json.dumps(m))
        with pytest.raises(ValueError,match='GT-free'):load_inputs(p,protocol)


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Optional pinned NumPy 2 trackers')
@pytest.mark.parametrize('arm',SCAN_ARMS)
def test_real_tracker_state_and_hashes_continue_across_shards(tmp_path,arm):
    import cv2
    from tools.select_tracking_exposure import run_sequence
    video=tmp_path/'source.avi';writer=cv2.VideoWriter(str(video),cv2.VideoWriter_fourcc(*'MJPG'),30,(64,64))
    assert writer.isOpened()
    for _ in range(8):writer.write(np.zeros((64,64,3),dtype=np.uint8))
    writer.release();h=sha256_file(video)
    # Confirmation before a boundary, weak continuation after it, then a gap/recovery.
    scores=[.9,.9,.2,.2,None,.2,.2,.2]
    def write(name,offset,subset):
        p=cache_file(tmp_path,name,start=offset+1,frames=len(subset),video_hash=h)
        r=json.loads(p.read_text())
        for f,score in zip(r['frames'],subset):
            f['detections']=[] if score is None else [{'bbox':[10.,10.,30.,40.],'class_id':0,'confidence':score}]
        p.write_text(json.dumps(r));return p
    full=write('full.json',0,scores);a=write('a.json',0,scores[:3]);b=write('b.json',3,scores[3:])
    def spec(paths):return {'video':str(video),'video_sha256':h,'caches':list(map(str,paths)),
        'cache_sha256':[sha256_file(p) for p in paths]}
    x,pred=run_sequence(spec([full]),{'model':'fixed'},arm)
    y,pred_split=run_sequence(spec([a,b]),{'model':'fixed'},arm)
    assert x==y and pred==pred_split
    from tools.validate_tracking_exclusive import run_arm
    from tools.validate_mot_tracking import canonical_predictions
    import hashlib
    original,trace_hash=run_arm(video,json.loads(full.read_text()),arm)
    assert x['trace_sha256']==trace_hash
    assert x['prediction_sha256']==hashlib.sha256(canonical_predictions(original).encode()).hexdigest()
    ids=[f['objects'][0]['object_id'] for f in pred if f['objects']]
    assert len(set(ids))==1 and len(ids)==6


def test_cohort_rejects_family_leak_and_reordered_holdout():
    a={'name':'one','phase':'discovery','source_family':'street'}
    b={'name':'two','phase':'confirmation','source_family':'square'}
    validate_cohort([a,b])
    for seqs in [[a,{**b,'source_family':'street'}],[b,a],[a,a,b],[a]]:
        with pytest.raises(ValueError):validate_cohort(seqs)
