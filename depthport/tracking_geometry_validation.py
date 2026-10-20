# SPDX-License-Identifier: AGPL-3.0-only
"""GT-free per-scene proxy harm gates; no accuracy/identity acceptance claim."""
from collections import Counter
from depthport.tracking_lifecycle_probe import require

COUNTS=('frames','births','confirmed_observations','accepted_high','accepted_weak',
    'predictions','nonpositive_predictions','nonpositive_accepted_posteriors','nonpositive_pre_predict','candidate_rows',
    'applied_rows','applied_axes','active_confirmed','active_tentative','retained_confirmed',
    'retained_tentative','shadow_operations','numerical_failures')


def positive(box):return box[2]>box[0] and box[3]>box[1]


def summarize(lifecycle,numerical,geometry):
    require(len(lifecycle)==len(numerical)==len(geometry),'Full aligned histories required')
    c=Counter({k:0 for k in COUNTS});birth_keys={};events={k:set() for k in ('weak','active','confirmed','births')}
    for trace,num,guard in zip(lifecycle,numerical,geometry):
        f=trace['frame'];require(f==num['frame']==guard['frame']==c['frames']+1,'Dense aligned frames required');c['frames']+=1
        for birth in trace['births']:
            token=birth['state']['token'];key=(f,birth['detection_index']);require(token not in birth_keys,'Repeated lineage')
            birth_keys[token]=key;events['births'].add(key);c['births']+=1
        before={s['token']:s for s in trace['before_update']};post={s['token']:s for s in trace['before_lifecycle_prune']}
        c['predictions']+=len(trace['predicted']);c['nonpositive_predictions']+=sum(not positive(s['bbox']) for s in trace['predicted'])
        require([r['token'] for r in guard['rows']]==[s['token'] for s in trace['before_predict']],'Geometry ownership differs')
        for row in guard['rows']:
            c['nonpositive_pre_predict']+=not row['prepositive']
            c['candidate_rows']+=bool(row['candidate_axes'])
            if row['applied']:
                c['applied_rows']+=1;c['applied_axes']+=len(row['candidate_axes'])
                c[('active' if row['active'] else 'retained')+('_confirmed' if row['confirmed'] else '_tentative')]+=1
        for stage in trace['stages']:
            phase='high' if stage['name']=='high_all' else 'weak'
            for r,col in stage['matched']:
                token=stage['tracks'][r]['token'];index=stage['detection_indices'][col];event=(f,index)
                c['accepted_'+phase]+=1;c['nonpositive_accepted_posteriors']+=not positive(post[token]['bbox'])
                if phase=='weak':events['weak'].add(event)
                if before[token]['age_since_update']==0:events['active'].add((f,*birth_keys[token],index,phase))
                if post[token]['tracker_id']>=0:events['confirmed'].add(event);c['confirmed_observations']+=1
        c['shadow_operations']+=len(num['operations'])
        for operation in num['operations']:c['numerical_failures']+=sum(not ok for ok in operation['checks'].values())
    return dict(c),{k:sorted(v) for k,v in events.items()}


def compare(reference,control,ref_events,control_events):
    lost={k:len(set(map(tuple,ref_events[k]))-set(map(tuple,control_events[k]))) for k in ('weak','active','confirmed')}
    newbirths=len(set(map(tuple,control_events['births']))-set(map(tuple,ref_events['births'])))
    gates={'numerical':control['numerical_failures']==0,
        'positive_predictions':control['nonpositive_predictions']==0,
        'positive_accepted_posteriors':control['nonpositive_accepted_posteriors']==0,
        'no_lost_weak_accepted_inputs':lost['weak']==0,'no_lost_active_update_pairs':lost['active']==0,
        'no_lost_confirmed_output_inputs':lost['confirmed']==0,'no_new_birth_events':newbirths==0}
    exposure=control['applied_rows']>0
    reduction=reference['nonpositive_predictions']-control['nonpositive_predictions']
    return {'lost_baseline_weak_inputs':lost['weak'],'lost_baseline_active_update_pairs':lost['active'],
        'lost_baseline_confirmed_inputs':lost['confirmed'],'new_birth_events':newbirths,
        'added_confirmed_inputs':len(set(map(tuple,control_events['confirmed']))-set(map(tuple,ref_events['confirmed']))),
        'nonpositive_prediction_reduction':reduction,'proxy_harm_gates':gates,'all_proxy_harm_gates_pass':all(gates.values()),
        'effective_exposure':exposure,'geometry_reduction_exposed':bool(exposure and reduction>0),
        'tracking_accuracy_accepted':False}
