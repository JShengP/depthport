# SPDX-License-Identifier: AGPL-3.0-only
"""Synthetic ground-truth tests; never interpreted as measured MOT quality."""
import json
import subprocess
import sys
from pathlib import Path

import pytest
from depthport.tracking_eval import (evaluate, TrackingEvaluationError,
                                     _assignment, GT_FORMAT, PRED_FORMAT)


def gt_frame(index, objects, tags=None, evaluated=True):
    return {'index':index,'objects':objects,'tags':tags or [],'evaluated':evaluated}


def truth(gt_id='a', box=(0,0,10,10), class_id=0, tags=None):
    return {'gt_id':gt_id, 'class_id':class_id, 'bbox':list(box), 'tags':tags or []}


def pred(obj_id='obj-0001', box=(0,0,10,10), class_id=0):
    return {'object_id':obj_id,'class_id':class_id,'bbox':list(box)}


def reports(pred_frames, gt_frames, sid='a'*32):
    return ({'format':PRED_FORMAT,'session_id':sid,
             'frames':[{'index':i,'objects':v} for i,v in pred_frames]},
            {'format':GT_FORMAT,'session_id':sid,'frames':gt_frames})


def test_exact_identical_one_id_has_no_failures():
    r,g=reports([(1,[pred()]),(2,[pred(box=(2,0,12,10))])],
        [gt_frame(1,[truth()]),gt_frame(2,[truth(box=(2,0,12,10))])])
    q=evaluate(r,g)
    assert q['summary']==dict(tp=2,fp=0,fn=0,id_switches=0,fragmentations=0,
                              precision=1.,recall=1.,f1=1.)
    assert q['evaluated_frames']==2
    assert not q['events']


def test_identity_switch_on_reappearance_and_occlusion_scenario():
    r,g=reports([(1,[pred()]),(2,[]),(3,[pred('obj-0009')])],
        [gt_frame(1,[truth()]),gt_frame(2,[],tags=['occlusion'],evaluated=False),
         gt_frame(3,[truth(tags=['occlusion'])],tags=['occlusion'])])
    q=evaluate(r,g)
    assert q['summary']['id_switches']==1
    assert q['summary']['fragmentations']==0
    assert q['skipped_frames']==1
    assert q['by_scenario']['occlusion']['id_switches']==1
    assert [e['kind'] for e in q['events']]==['id_switch']


def test_missed_visible_detection_and_fragmentation():
    r,g=reports([(1,[pred()]),(2,[]),(3,[pred()])],
        [gt_frame(1,[truth()]),gt_frame(2,[truth(tags=['occlusion'])],tags=['occlusion']),
         gt_frame(3,[truth(tags=['occlusion'])],tags=['occlusion'])])
    q=evaluate(r,g)
    assert q['summary']['tp']==2 and q['summary']['fn']==1
    assert q['summary']['fragmentations']==1
    assert q['summary']['id_switches']==0
    assert q['by_scenario']['occlusion']['fn']==1


def test_two_crossing_same_class_id_swap():
    boxes1=[(0,0,12,12),(20,0,32,12)]
    boxes2=[(5,0,17,12),(15,0,27,12)]
    r,g=reports([(1,[pred('p1',boxes1[0]),pred('p2',boxes1[1])]),
                 (2,[pred('p2',boxes2[0]),pred('p1',boxes2[1])])],
                [gt_frame(1,[truth('A',boxes1[0]),truth('B',boxes1[1])]),
                 gt_frame(2,[truth('A',boxes2[0]),truth('B',boxes2[1])],tags=['crossing'])])
    q=evaluate(r,g)
    assert q['summary']['tp']==4 and q['summary']['id_switches']==2
    assert q['by_scenario']['crossing']['id_switches']==2


def test_false_positive_and_false_negative_class_gating():
    r,g=reports([(1,[pred('p',class_id=1)])],
                [gt_frame(1,[truth(class_id=0)],tags=['normal'])])
    q=evaluate(r,g)
    assert q['summary']['tp']==0 and q['summary']['fp']==1 and q['summary']['fn']==1
    assert q['summary']['precision']==0 and q['summary']['recall']==0


def test_empty_ground_truth_frame_counts_fp_not_fn():
    r,g=reports([(1,[pred()])],[gt_frame(1,[],tags=['entry_exit'])])
    q=evaluate(r,g)
    assert q['summary']['fp']==1 and q['summary']['fn']==0
    assert q['summary']['recall'] is None
    assert q['by_scenario']['entry_exit']['fp']==1


def test_optimal_assignment_not_naive_row_greedy():
    assert _assignment([[0.1,0.2,1.,1.],[0.11,0.9,1.,1.]])[:2]==[1,0]


def test_sparse_annotations_evaluate_only_present_frames():
    r,g=reports([(1,[pred()]),(2,[pred('p2')]),(3,[])],
                [gt_frame(1,[truth()]),gt_frame(3,[])])
    q=evaluate(r,g)
    assert q['evaluated_frames']==2 and q['summary']['tp']==1


@pytest.mark.parametrize('change',[
    'session_mismatch','unknown_index','duplicate_gt_index','duplicate_pred_id',
    'bad_bbox','bad_tags','no_evaluated','bad_pred_class','bad_gt_class',
])
def test_invalid_inputs_fail_closed(change):
    r,g=reports([(1,[pred()])],[gt_frame(1,[truth()])])
    if change=='session_mismatch':g['session_id']='b'*32
    elif change=='unknown_index':g['frames'][0]['index']=5
    elif change=='duplicate_gt_index':g['frames'].append(gt_frame(1,[truth()]))
    elif change=='duplicate_pred_id':r['frames'][0]['objects'].append(pred())
    elif change=='bad_bbox':g['frames'][0]['objects'][0]['bbox']=[0,0,float('nan'),3]
    elif change=='bad_tags':g['frames'][0]['tags']=['not-a-scenario']
    elif change=='no_evaluated':g['frames'][0]['evaluated']=False
    elif change=='bad_pred_class':r['frames'][0]['objects'][0]['class_id']=True
    elif change=='bad_gt_class':g['frames'][0]['objects'][0]['class_id']=-1
    with pytest.raises(TrackingEvaluationError):evaluate(r,g)


def test_cli_writes_local_json_report(tmp_path):
    r,g=reports([(1,[pred()])],[gt_frame(1,[truth()])])
    a=tmp_path/'tracking.json'; b=tmp_path/'gt.json'; out=tmp_path/'outputs'/'evaluation.json'
    a.write_text(json.dumps(r));b.write_text(json.dumps(g))
    cli=Path(__file__).resolve().parents[1]/'tools/evaluate_tracking.py'
    result=subprocess.run([sys.executable,str(cli),'--tracking',str(a),
        '--ground-truth',str(b),'--output',str(out)],capture_output=True,text=True)
    assert result.returncode==0, result.stderr
    q=json.loads(out.read_text()); assert q['summary']['tp']==1
    assert 'IDSW=0' in result.stdout


def test_cli_rejects_bad_json_and_symlink(tmp_path):
    cli=Path(__file__).resolve().parents[1]/'tools/evaluate_tracking.py'
    f=tmp_path/'bad.json';f.write_text('{bad')
    result=subprocess.run([sys.executable,str(cli),'--tracking',str(f),
        '--ground-truth',str(f)],capture_output=True,text=True)
    assert result.returncode==2 and 'Invalid tracking evaluation' in result.stderr
    link=tmp_path/'link.json';link.symlink_to(f)
    result=subprocess.run([sys.executable,str(cli),'--tracking',str(link),
        '--ground-truth',str(f)],capture_output=True,text=True)
    assert result.returncode==2


def test_real_tracker_fake_detector_report_contract(tmp_path):
    # Uses genuine SessionStore and tracking application path, but fake image
    # detector and synthetic depths. This is not AI model validation.
    from tests.test_tracking import new_store, moving_detector
    from depthport.tracking import analyse_session
    store, sid=new_store(tmp_path)
    moving_detector.index=-1
    report=analyse_session(store,sid,detector=moving_detector)
    frames=[]
    for f in report['frames']:
        item=f['objects'][0]
        frames.append(gt_frame(f['index'],[truth('A',item['bbox'],item['class_id'])]))
    q=evaluate(report,{'format':GT_FORMAT,'session_id':sid,'frames':frames})
    assert q['summary']['tp']==3 and q['summary']['id_switches']==0


def test_ground_truth_cannot_relabel_identity_class_across_frames():
    r,g=reports([(1,[pred()]),(2,[pred()])],
                [gt_frame(1,[truth()]),gt_frame(2,[truth(class_id=5)])])
    with pytest.raises(TrackingEvaluationError,match='may not change class'):
        evaluate(r,g)

def test_unrecognized_sampling_protocol_rejected():
    r,g=reports([(1,[pred()])],[gt_frame(1,[truth()])])
    g['sampling']='camera_30fps_verified_without_evidence'
    with pytest.raises(TrackingEvaluationError,match='sampling'):
        evaluate(r,g)
