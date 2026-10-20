#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Trace frozen recovery outputs/weak-state histories and exact HOTA decisions.

No tracking, inference, retuning or input mutation. Full diagnostic cases,
solver matrices, GT/ID bridges and event locations MUST remain local.
"""
from __future__ import annotations
import argparse
from collections import Counter
import configparser
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from depthport.video_tracking_benchmark import read_cache, sha256_file
from depthport.tracking_recovery_control import ARMS
from depthport.tracking_history_diagnostics import prediction_keys, bridge_prefix, column_context, forced_competitor_cost, HOTAAssignmentProbe, hota_match_changes
from depthport.tracking_recovery_diagnostics import analyse_added_errors
from depthport.tracking_diagnostics import clear_trace, cache_index
from depthport.mot_scenarios import read_mot_gt, scenario_events
from tools.validate_mot_tracking import TRACKEVAL_COMMIT, source_coordinate_scale, canonical_predictions, metric_summary, frame_matches, write_mot_predictions
from tools.diagnose_tracking_association import read_json


def columns(data,cache,scale):
    return {(f+1,j):(f+1,cache_index(box,score,cache['frames'][f]['detections'],scale))
            for f,(boxes,scores) in enumerate(zip(data['tracker_dets'],data['tracker_confidences']))
            for j,(box,score) in enumerate(zip(boxes,scores))}


def describe_histories(data,predictions,frames,cache,scale,cases):
    reference,candidate=ARMS
    keyed={a:prediction_keys(predictions[a],cache,scale) for a in ARMS}
    cols={a:columns(data[a],cache,scale) for a in ARMS}
    clear={a:clear_trace(data[a]) for a in ARMS}
    roots=[];deferral_counts=Counter();forced_samples={}
    for frame in frames[candidate]:
        for edge in frame['deferred']:
            stage=frame['stages'][1];track=stage['tracks'][edge['row']]
            bridged=bridge_prefix(track['tracker_id'],frame['frame'],keyed[candidate],keyed[reference])
            key=(frame['frame'],stage['detection_indices'][edge['column']])
            used={r:c for r,c in stage['matched']}
            all_busy=all(i in used and used[i]!=edge['column'] for i in edge['competitor_rows'])
            official_col=next((j for (ff,j),value in cols[reference].items() if ff==key[0] and value==key),None)
            status=('not_emitted' if key not in keyed[reference][0] else 'excluded' if official_col is None else
                    'tp' if any(mt['col']==official_col for mt in clear[reference]['matches'][key[0]-1].values()) else 'fp')
            deferral_counts['total']+=1;deferral_counts['all_competitors_already_assigned_elsewhere']+=all_busy
            deferral_counts['reference_'+status]+=1
            deferral_counts['reference_'+status+'_all_competitors_busy']+=all_busy
            alternatives=[forced_competitor_cost(stage['similarity'],stage['gate'],i,edge['column']) for i in edge['competitor_rows']]
            best=min(alternatives,key=lambda c:c['similarity_sum_loss'])
            forced_samples.setdefault(status,[]).append(best['similarity_sum_loss'])
            roots.append({'frame':frame['frame'],'candidate_native':track['tracker_id'],
                'detection_key':key,'all_competitors_busy':all_busy,'reference_clear_status':status,
                'best_forced_competitor':best,
                'reference_native':bridged,'equal_prior_observation_history':bridged is not None,
                'reference_updates_bridged_hypothesis':bridged is not None and keyed[reference][0].get(key)==bridged,
                'age_before_deferral':track['age_since_update']})
    fn_counts=Counter();root_ages=[];raw_fn=[]
    independent=frame_matches(data[candidate],list(range(data[candidate]['num_gt_ids'])))
    # Official CLEAR keeps continuity state over empty frames; reproduce that lookup.
    previous={};before=[]
    for f,matched in enumerate(clear[candidate]['matches']):
        before.append(previous)
        if len(data[candidate]['gt_ids'][f]) and len(data[candidate]['tracker_ids'][f]):
            previous=matched
    for case in cases['added_fn']:
        f,g=case['frame'],case['gt'];key=(f,case['reference_detection_index'])
        old_native=keyed[reference][0][key]
        matched_roots=[r for r in roots if r['frame']<=f and r['reference_native']==old_native
                       and r['reference_updates_bridged_hypothesis']]
        root=max(matched_roots,key=lambda r:r['frame']) if matched_roots else None
        stage=frames[candidate][f-1]['stages'][1]
        ctx=column_context(stage,key[1],root['candidate_native'] if root else None)
        details={**case,'root':root,'column':ctx}
        fn_counts[case['category']]+=1
        if case['category']=='reference_detection_not_emitted_without_current_deferral':
            fn_counts['unemitted_exact_prefix_bridged_root']+=root is not None
            fn_counts['unemitted_root_still_in_weak_stage']+=bool(root and ctx['target_present'])
            fn_counts['unemitted_root_below_gate']+=bool(root and ctx['target_present'] and not ctx['target_admissible'])
            fn_counts['unemitted_no_admissible_row']+=ctx['admissible_rows']==0
            fn_counts['unemitted_admissible_rows_all_assigned_elsewhere']+=ctx['admissible_rows']>0 and ctx['admissible_unmatched_rows']==0
            if root and ctx['target_present']:
                root_ages.append(ctx['target_age'])
        if case['category']=='reference_detection_still_emitted':
            j=next((j for (ff,j),value in cols[candidate].items() if ff==f and value==key),None)
            owner=next((gg for gg,mt in clear[candidate]['matches'][f-1].items() if mt['col']==j),None)
            continuity=owner is not None and before[f-1].get(owner,{}).get('tid')==clear[candidate]['matches'][f-1][owner]['tid']
            details.update(candidate_preprocessed_column=j,official_owner=owner,owner_has_continuity_bonus=continuity,
                           independent_iou_matches_original_gt=g in independent[f])
            fn_counts['retained_survives_official_preprocessing']+=j is not None
            fn_counts['retained_matches_other_gt']+=owner is not None and owner!=g
            fn_counts['retained_other_gt_has_continuity_bonus']+=bool(owner is not None and owner!=g and continuity)
            fn_counts['retained_original_gt_matches_without_continuity']+=g in independent[f]
        raw_fn.append(details)
    switches=[]
    def native_at(arm,f,g):
        mt=clear[arm]['matches'][f-1].get(g)
        return keyed[arm][0][cols[arm][(f,mt['col'])]] if mt else None
    for case in cases['added_idsw']:
        f,g=case['frame'],case['gt']
        nearby=[c for c in clear[reference]['switches'] if c['gt']==g and 0<f-c['frame']<=cache['fps']]
        prev=max(nearby,key=lambda c:c['frame']) if nearby else None
        same_transition=False
        if prev:
            cut=prev['frame']
            current=native_at(candidate,f,g);old=native_at(candidate,case['previous_frame'],g)
            same_transition=(bridge_prefix(current,cut,keyed[candidate],keyed[reference])==native_at(reference,cut,g)
                and bridge_prefix(old,cut,keyed[candidate],keyed[reference])==native_at(reference,prev['previous_frame'],g))
        switches.append({**case,'earlier_reference_switch':prev,
            'same_transition_by_equal_prefix_keys':same_transition,
            'shift_frames':f-prev['frame'] if prev and same_transition else None})
    chains=[]
    for root in roots:
        linked=[c for c in raw_fn if c['category']=='reference_detection_not_emitted_without_current_deferral'
                and c['root'] is root]
        if not linked:continue
        end=max(c['frame'] for c in linked);owners=set()
        for f in range(root['frame'],end+1):
            for g,mt in clear[reference]['matches'][f-1].items():
                if keyed[reference][0][cols[reference][(f,mt['col'])]]==root['reference_native']:owners.add(g)
        chains.append({'added_fn':len(linked),'reference_distinct_gt_owners':len(owners),
                       'candidate_root_present_at_every_miss':all(c['column']['target_present'] for c in linked)})
    return ({'deferrals':dict(sorted(deferral_counts.items())),
            'forced_competitor_loss':{k:{'n':len(v),'min':min(v),'mean':sum(v)/len(v),'max':max(v)} for k,v in sorted(forced_samples.items())},
            'added_fn_history':dict(sorted(fn_counts.items())),
            'unemitted_bridged_chains':chains,
            'unemitted_bridged_root_age':{'n':len(root_ages),'min':min(root_ages) if root_ages else None,'max':max(root_ages) if root_ages else None},
            'added_switches':len(switches),
            'added_switches_are_later_same_prefix_transition':sum(c['same_transition_by_equal_prefix_keys'] for c in switches),
            'switch_shift_frames':[c['shift_frames'] for c in switches if c['shift_frames'] is not None]},
            {'roots':roots,'added_fn':raw_fn,'added_idsw':switches})


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--study',nargs=3,action='append',required=True,metavar=('MANIFEST','RECORD','RUNS'))
    for k in ('trackeval-root','work-dir','output'):
        p.add_argument('--'+k,type=Path,required=True)
    a=p.parse_args(argv)
    if a.work_dir.is_symlink() or a.output.is_symlink():p.error('Non-symlink local destinations required')
    evaluator=a.trackeval_root.resolve()
    if subprocess.check_output(['git','-C',str(evaluator),'rev-parse','HEAD'],text=True).strip()!=TRACKEVAL_COMMIT or subprocess.run(['git','-C',str(evaluator),'diff','--quiet','HEAD']).returncode:p.error('Clean pinned evaluator required')
    import numpy as np
    for k,v in [('int',int),('float',float),('bool',bool)]:
        if k not in np.__dict__:setattr(np,k,v)
    sys.path.insert(0,str(evaluator));import trackeval
    metrics=[trackeval.metrics.CLEAR({'PRINT_CONFIG':False}),trackeval.metrics.Identity({'PRINT_CONFIG':False}),trackeval.metrics.HOTA({'PRINT_CONFIG':False})]
    # Both old frozen implementation manifests must still match; no tracker runs.
    for file in ('v0.3-recovery-deferral-protocol.json','v0.3-recovery-moving-protocol.json'):
        protocol=read_json(ROOT/'docs/validation'/file)
        for name,digest in protocol['implementation_sha256'].items():
            if sha256_file(ROOT/name)!=digest:p.error('Frozen tracking/study code changed: '+name)
    report={'format':'depthport.recovery-history-diagnosis.v1','checked_on':'2026-10-19',
        'scope':'Post-hoc diagnosis of already-known failures. No tracking, inference, tuning or input mutation; not independent validation.',
        'analysis_sha256':{f:sha256_file(ROOT/f) for f in ('depthport/tracking_history_diagnostics.py','tools/diagnose_tracking_recovery_history.py')},
        'evaluator_commit':TRACKEVAL_COMMIT,'sequences':[]}
    for manifest_file,record_file,runs in a.study:
        manifest=read_json(Path(manifest_file));record=read_json(Path(record_file));runs=Path(runs)
        if record['format']=='depthport.recovery-deferral-acceptance.v1':
            benchmark='MOT20';specs=[record['sequence']];seqs=[manifest]
        elif record['format']=='depthport.recovery-moving-replication.v1':
            benchmark='MOT17';specs=record['sequences'];seqs=manifest['sequences']
        else:p.error('Unsupported frozen study record')
        for spec,seq in zip(specs,seqs):
            name=spec['name'];cache=read_cache(Path(seq['detections']));n=len(cache['frames'])
            for k in ('video','detections','gt','seqinfo'):
                if sha256_file(Path(seq[k]))!=spec[k+'_sha256']:p.error('Input differs from record')
            local=runs/name if benchmark=='MOT17' else runs
            methods=spec['methods'] if benchmark=='MOT17' else record['methods']
            predictions={};frames={};data={};col_keys={};scores={};probes={};results={}
            output=a.work_dir/name;output.mkdir(parents=True,exist_ok=True)
            cfg=configparser.ConfigParser();cfg.read(seq['seqinfo']);scale=source_coordinate_scale(cache,cfg['Sequence'])
            if sha256_file(runs/'mot-gt'/name/'gt/gt.txt')!=spec['gt_sha256']:p.error('Evaluator GT mismatch')
            ds=trackeval.datasets.MotChallenge2DBox({'GT_FOLDER':str(runs/'mot-gt'),'TRACKERS_FOLDER':str(runs/'mot-trackers'),
                'SKIP_SPLIT_FOL':True,'BENCHMARK':benchmark,'SPLIT_TO_EVAL':'train','SEQ_INFO':{name:n},'TRACKERS_TO_EVAL':list(ARMS),'PRINT_CONFIG':False})
            for arm in ARMS:
                pred=read_json(local/(arm+'-predictions.local.json'));predictions[arm]=pred
                if hashlib.sha256(canonical_predictions(pred).encode()).hexdigest()!=methods[arm]['canonical_predictions_sha256']:p.error('Prediction hash mismatch')
                mot_check=output/(arm+'-mot.local.txt');write_mot_predictions(pred,mot_check,scale)
                if mot_check.read_bytes()!=(runs/'mot-trackers'/arm/'data'/(name+'.txt')).read_bytes():p.error('Evaluator predictions differ from recorded output')
                trace=local/(arm+'-trace.local.jsonl')
                if sha256_file(trace)!=methods[arm]['local_trace_sha256']:p.error('Trace hash mismatch')
                frames[arm]=[json.loads(line) for line in trace.read_text().splitlines()]
                d=ds.get_preprocessed_seq_data(ds.get_raw_seq_data(arm,name),'pedestrian');data[arm]=d
                scores[arm]={m.get_name():m.eval_sequence(d) for m in metrics}
                if any(abs(v-methods[arm]['metrics'][k])>1e-12 for k,v in metric_summary(scores[arm]).items()):p.error('Official scores differ')
                with HOTAAssignmentProbe(metrics[2],d) as probe:
                    observed=metrics[2].eval_sequence(d)
                if any(not np.array_equal(v,observed[k]) for k,v in scores[arm]['HOTA'].items()):p.error('Observation changed HOTA result')
                probes[arm]=probe;col_keys[arm]=columns(d,cache,scale)
                (output/(arm+'-hota-solver.local.json')).write_text(json.dumps([
                    {k:v.tolist() if isinstance(v,np.ndarray) else v for k,v in c.items()} for c in probe.calls],allow_nan=False))
            rows=read_mot_gt(Path(seq['gt']),n);events=scenario_events(rows,cache['fps'])
            if any(d['num_gt_dets']!=len(rows) or d['num_gt_ids']!=len({r['id'] for r in rows}) for d in data.values()):p.error('GT map/cardinality mismatch')
            _,cases=analyse_added_errors(data[ARMS[0]],data[ARMS[1]],rows,events,cache,scale,predictions[ARMS[1]],frames[ARMS[1]])
            histories,raw_history=describe_histories(data,predictions,frames,cache,scale,cases)
            hota,raw_hota=hota_match_changes(data[ARMS[0]],data[ARMS[1]],probes[ARMS[0]],probes[ARMS[1]],
                col_keys[ARMS[0]],col_keys[ARMS[1]],metrics[2].array_labels,scores[ARMS[0]]['HOTA'],scores[ARMS[1]]['HOTA'])
            unique_lost={ (c['frame'],c['gt']):c for c in raw_hota }
            low_ious=[c['reference_iou'] for c in unique_lost.values()]
            lost_origins=Counter();lost_contexts=Counter();raw_origins=[];reference_observation_map=prediction_keys(predictions[ARMS[0]],cache,scale)[0]
            for c in unique_lost.values():
                key=tuple(c['reference_key']);ref_native=reference_observation_map[key]
                roots=[r for r in raw_history['roots'] if r['frame']<=c['frame'] and r['reference_native']==ref_native
                       and r['reference_updates_bridged_hypothesis']]
                root=max(roots,key=lambda r:r['frame']) if roots else None
                label=('same_frame_deferral' if root and root['frame']==c['frame'] else
                       'later_on_bridged_deferred_hypothesis' if root else 'no_exact_prefix_bridge')
                lost_origins[label]+=1
                stage=frames[ARMS[1]][c['frame']-1]['stages'][1]
                context=column_context(stage,key[1],root['candidate_native'] if root else None)
                if label=='later_on_bridged_deferred_hypothesis':
                    lost_contexts['later_root_present']+=context['target_present']
                    lost_contexts['later_root_below_gate']+=context['target_present'] and not context['target_admissible']
                    lost_contexts['later_root_admissible_assigned_elsewhere']+=context['target_admissible'] and context['target_assigned_other_column']
                raw_origins.append({**c,'root':root,'column':context})
            (output/'history-cases.local.json').write_text(json.dumps(raw_history,allow_nan=False))
            (output/'hota-changes.local.json').write_text(json.dumps(raw_hota,allow_nan=False))
            (output/'hota-lost-origins.local.json').write_text(json.dumps(raw_origins,allow_nan=False))
            report['sequences'].append({'name':name,'source_terms':record['source_terms'],
                'input_record_sha256':sha256_file(Path(record_file)),'official_scores_reproduced':True,
                'observed_hota_all_fields_exact':True,'history':histories,'hota_threshold_changes':hota,
                'hota_unique_lost_gt_frames':len(unique_lost),
                'hota_lost_reference_iou_range':{'min':min(low_ious) if low_ious else None,'max':max(low_ious) if low_ious else None},
                'hota_lost_origins':dict(sorted(lost_origins.items())),
                'hota_lost_later_state_contexts':dict(sorted(lost_contexts.items())),
                'reference_hota':float(scores[ARMS[0]]['HOTA']['HOTA'].mean()),
                'candidate_hota':float(scores[ARMS[1]]['HOTA']['HOTA'].mean())})
            print(name+': immutable inputs, official metrics and observed solver checked',flush=True)
    report['public_scope']='Reviewed fixed-label counts and threshold-level aggregates only; raw matrices, GT/frame/ID bridges, cases and paths stay local.'
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    return 0


if __name__=='__main__':raise SystemExit(main())
