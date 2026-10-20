# SPDX-License-Identifier: AGPL-3.0-only
import copy
import gzip
import json
import os
import pytest
from depthport.tracking_geometry_exposure import GROUPS, ROLES, frame_counts, select, confirm
from depthport.tracking_geometry_validation import COUNTS, summarize
from tools.select_tracking_geometry_exposure import validate_cache


def record(name, phase='discovery', role='retained_confirmed', count=1):
    c={k:0 for k in COUNTS};c.update(frames=5,applied_rows=count);c[role]=count
    rows={g:0 for g in GROUPS};rows[role]=rows['any']=count
    return {'name':name,'phase':phase,'status':'completed','repeat_equal':True,'native_reference_equal':True,
            'frames':5,'source_lock':{'capped_frames':0},
            'projection':{'counts':c,'rows':rows,'exposed_frames':{g:int(v>0) for g,v in rows.items()}}}


def test_selection_uses_first_actual_role_exposure_not_larger_or_hypothetical_counts():
    a=record('zero',count=0);a['projection']['counts']['candidate_rows']=900
    b=record('first');c=record('larger',count=20)
    result=select([a,b,c],['zero','first','larger'])
    assert result['retained_confirmed']=='first' and result['active_confirmed'] is None
    assert result['any']=='first'


@pytest.mark.parametrize('bad',['failed','repeat','native','cap','numerical','prediction','posterior','frame'])
def test_unknown_or_incomplete_exposure_cannot_select(bad):
    r=record('scene')
    if bad=='failed':r['status']='failed';r.pop('projection')
    elif bad=='repeat':r['repeat_equal']=False
    elif bad=='native':r['native_reference_equal']=False
    elif bad=='cap':r['source_lock']['capped_frames']=1
    elif bad=='frame':r['projection']['exposed_frames']['retained_confirmed']=0
    else:r['projection']['counts'][{'numerical':'numerical_failures','prediction':'nonpositive_predictions','posterior':'nonpositive_accepted_posteriors'}[bad]]=1
    assert select([r],['scene'])['retained_confirmed'] is None


@pytest.mark.parametrize('mode',['missing','duplicate','reordered','reserved'])
def test_complete_ledger_order_and_phase_enforced(mode):
    rows=[record('a'),record('b')];order=['a','b']
    if mode=='missing':rows.pop()
    elif mode=='duplicate':rows[1]['name']='a'
    elif mode=='reordered':rows.reverse()
    else:rows[1]['phase']='confirmation'
    with pytest.raises(ValueError):select(rows,order)


@pytest.mark.parametrize('mode',['zero','failure','no_discovery','missing_source','positive'])
def test_confirmation_requires_each_source_and_discovery_exposure(mode):
    d={'all_scheduled_completed':True,'selection':select([record('seen')],['seen'])}
    rows=[record('new1','confirmation'),record('new2','confirmation')]
    if mode=='zero':rows[1]=record('new2','confirmation',count=0)
    elif mode=='failure':rows[1]['status']='failed'
    elif mode=='no_discovery':d['selection']['retained_confirmed']=None
    elif mode=='missing_source':rows.pop()
    result=confirm(d,rows)['retained_confirmed']
    assert result['replicated_in_both_reserved']==(mode=='positive')


def test_actual_rows_partition_and_overlapping_group_frames_count_once():
    trace={'frame':1,'before_predict':[{'token':i} for i in range(5)],'predicted':[],
           'births':[],'before_lifecycle_prune':[],'stages':[]}
    rows=[]
    for i,(active,confirmed) in enumerate([(True,True),(True,False),(False,True),(False,False),(True,False)]):
        rows.append(dict(token=i,active=active,confirmed=confirmed,prepositive=True,candidate_axes=[0,1],applied=True))
    c,r,e=frame_counts(trace,{'frame':1,'operations':[]},{'frame':1,'rows':rows})
    assert [c[k] for k in ROLES]==[1,2,1,1] and c['applied_axes']==10
    assert r['any']==5 and r['unconfirmed']==3 and r['active']==3 and r['retained']==2
    assert all(v==1 for v in e.values())
    for row in rows:row['applied']=False
    c,r,e=frame_counts(trace,{'frame':1,'operations':[]},{'frame':1,'rows':rows})
    assert c['candidate_rows']==5 and c['applied_rows']==0 and not any(r.values()) and not any(e.values())


def test_cache_shard_offset_allowed_but_gt_keys_still_rejected():
    c={'format':'depthport.video-detections.v1','video_sha256':'a'*64,'width':10,'height':10,'fps':10,
       'source_start_frame':1801,'detector':{'confidence':.1,'frames_at_detection_cap':0},'frames':[]}
    validate_cache(c,{'confidence':.1});c['labels']=[]
    with pytest.raises(ValueError):validate_cache(c,{'confidence':.1})


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Pinned native NumPy2 research environment')
@pytest.mark.parametrize('fps',[10,30])
def test_streamed_native_replay_matches_batch_summarizer_full_bytes_and_repeats(tmp_path,fps):
    import cv2
    import numpy as np
    from depthport.video_tracking_benchmark import sha256_file
    from tools.select_tracking_geometry_exposure import replay
    video=tmp_path/'source.avi';writer=cv2.VideoWriter(str(video),cv2.VideoWriter_fourcc(*'FFV1'),fps,(64,64))
    for _ in range(12):writer.write(np.zeros((64,64,3),dtype=np.uint8))
    writer.release();detector={'confidence':.1};cache_paths=[]
    for start,end in ((1,7),(7,13)):
        frames=[{'index':i-start+1,'detections':[{'bbox':[10,10,30,50],'class_id':0,'confidence':.9 if i<3 else .2}]} for i in range(start,end)]
        c={'format':'depthport.video-detections.v1','video_sha256':sha256_file(video),'width':64,'height':64,'fps':fps,
           'source_start_frame':start,'detector':dict(detector,frames_at_detection_cap=0),'frames':frames}
        path=tmp_path/(str(start)+'.json');path.write_text(json.dumps(c));cache_paths.append(path)
    seq={'video':str(video),'video_sha256':sha256_file(video),'caches':list(map(str,cache_paths)),
         'cache_sha256':[sha256_file(p) for p in cache_paths]};spec={'frames':12,'fps':fps}
    native=replay(seq,spec,detector,str(tmp_path/'native'),'native')
    ref=replay(seq,spec,detector,str(tmp_path/'ref'),'reference')
    guard=replay(seq,spec,detector,str(tmp_path/'guard'),'projection')
    repeat=replay(seq,spec,detector,str(tmp_path/'repeat'),'projection')
    assert native['sha256']==ref['sha256']==guard['sha256'] and guard==repeat
    with gzip.open(tmp_path/'guard'/'trace.local.jsonl.gz','rt') as stream:rows=[json.loads(s) for s in stream]
    counts,_=summarize([r['lifecycle'] for r in rows],[r['numerical'] for r in rows],[r['geometry'] for r in rows])
    assert counts==guard['counts'] and counts['accepted_weak']==10 and counts['frames']==12
    assert guard['rows']['any']==0 and not any(guard['exposed_frames'].values())
