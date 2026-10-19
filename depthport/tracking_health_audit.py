# SPDX-License-Identifier: AGPL-3.0-only
"""Read-only health audit of immutable lifecycle records; raw cases stay local.

Coordinates describe hypotheses and observations, never GT identities. Full
source neighbours are retrospective context and cannot qualify a causal veto.
"""
from collections import Counter
import numpy as np
from depthport.tracking_lifecycle_probe import require

PHASES=('birth','prediction','accepted_high','accepted_weak')
KINDS=('any','high','weak')
EVENTS=('birth','expired','immature_unmatched','expired_and_immature','source_end')
COUNT_KEYS=('frames','inputs','input_nonfinite','input_nonfinite_confidence','input_nonpositive','births','accepted_high','accepted_weak',
    'accepted_nonpositive_input','accepted_from_nonpositive_prediction','accepted_nonpositive_posterior',
    'accepted_repaired_prediction','accepted_created_nonpositive','predicted_rows','nonpositive_predicted_rows',
    'posterior_rows','nonpositive_posterior_rows','prediction_positive_to_nonpositive',
    'prediction_nonpositive_to_positive','hypotheses_ever_nonpositive','hypotheses_width_nonpositive',
    'hypotheses_height_nonpositive','first_birth','first_prediction','first_accepted_high','first_accepted_weak',
    'first_prediction_with_prior_update','first_prediction_seed_only','nonpositive_removed','removed_expired',
    'removed_immature_unmatched','removed_expired_and_immature','source_end_censored','continuity_checks')


def dimensions(box):
    b=np.asarray(box)
    require(b.shape==(4,) and np.all(np.isfinite(b)),'Finite four-coordinate snapshot required')
    return (bool(b[2]<=b[0]),bool(b[3]<=b[1]))


def pattern(bits):
    return 'both' if all(bits) else 'width' if bits[0] else 'height' if bits[1] else 'positive'


def neighbours(flags,event):
    """One-based event; strict neighbours, same frame separate; censor at bounds."""
    n=len(flags);require(1<=event<=n,'Event outside full source')
    before=[i+1 for i,x in enumerate(flags[:event-1]) if x]
    after=[i+event+1 for i,x in enumerate(flags[event:]) if x]
    return {'at_event':bool(flags[event-1]),
        'before':('observed:'+str(event-before[-1])) if before else 'censored:'+str(event-1),
        'after':('observed:'+str(after[0]-event)) if after else 'censored:'+str(n-event)}


def empty_runs(flags):
    result=Counter();start=None
    for i,value in enumerate([*flags,True]):
        if not value and start is None:start=i
        elif value and start is not None:
            censor=('both' if start==0 and i==len(flags) else 'left' if start==0 else
                    'right' if i==len(flags) else 'interior')
            result[censor+':'+str(i-start)]+=1;start=None
    return dict(sorted(result.items()))


def _states(values):
    out={s['token']:s for s in values}
    require(len(out)==len(values),'Duplicate ownership token')
    return out


def audit(traces,iou):
    require([t['frame'] for t in traces]==list(range(1,len(traces)+1)),'Dense full source required')
    c=Counter({k:0 for k in COUNT_KEYS});c['frames']=len(traces)
    tracks={};previous={};first=[];events=[];predictions={};update_gaps=Counter();birth_gaps=Counter()
    first_phase=Counter({p:0 for p in PHASES});first_dimensions=Counter({p:0 for p in ('width','height','both')})
    first_role=Counter({p:0 for p in ('confirmed','tentative')})
    first_prior=Counter({p:0 for p in ('high','weak','seed_only')});first_gaps=Counter();dimension_phases=Counter({d+':'+p:0 for d in ('width','height') for p in PHASES})
    health_names=('accepted_positive','accepted_nonpositive','seed_positive','seed_nonpositive')
    prior_input_health=Counter({p:0 for p in health_names});prior_posterior_health=Counter({p:0 for p in health_names})
    frame_boxes=[];frame_indices=[]

    def observe(state,phase,frame,current=None):
        token=state['token'];history=tracks[token];bits=dimensions(state['bbox'])
        for j,label in enumerate(('width','height')):
            if bits[j] and not history['seen_dimensions'][j]:
                history['seen_dimensions'][j]=True;dimension_phases[label+':'+phase]+=1
                c['hypotheses_'+label+'_nonpositive']+=1
        if not any(bits) or history['first'] is not None:return
        prior=history['accepted'][-1] if history['accepted'] else None
        event={'frame':frame,'token':token,'phase':phase,'state':state,'birth':history['birth'],
            'prior_accepted':prior,'current_accepted':current,'dimensions':pattern(bits)}
        history['first']=event;first.append(event);c['hypotheses_ever_nonpositive']+=1;c['first_'+phase]+=1
        first_phase[phase]+=1;first_dimensions[pattern(bits)]+=1
        first_role['confirmed' if state['tracker_id']>=0 else 'tentative']+=1
        first_prior[prior['stage'] if prior else 'seed_only']+=1
        prefix='accepted_' if prior else 'seed_'
        input_box=prior['bbox'] if prior else history['birth']['state']['bbox']
        posterior_box=prior['posterior']['bbox'] if prior else input_box
        prior_input_health[prefix+('nonpositive' if any(dimensions(input_box)) else 'positive')]+=1
        prior_posterior_health[prefix+('nonpositive' if any(dimensions(posterior_box)) else 'positive')]+=1
        first_gaps[('accepted:' if prior else 'seed:')+str(frame-(prior['frame'] if prior else history['birth']['frame']))]+=1
        if phase=='prediction':c['first_prediction_with_prior_update' if prior else 'first_prediction_seed_only']+=1

    for t in traces:
        f=t['frame'];boxes=np.asarray(t['input_boxes'],dtype=np.float32).reshape(-1,4)
        scores=np.asarray(t['input_confidences'],dtype=np.float32)
        require(len(boxes)==len(scores),'Input score count differs')
        c['inputs']+=len(boxes);c['input_nonfinite']+=int(np.count_nonzero(~np.all(np.isfinite(boxes),axis=1)))
        c['input_nonfinite_confidence']+=int(np.count_nonzero(~np.isfinite(scores)))
        c['input_nonpositive']+=int(np.count_nonzero((boxes[:,2]<=boxes[:,0])|(boxes[:,3]<=boxes[:,1])))
        indices={'any':list(range(len(boxes))),'high':t['high_indices'],'weak':t['weak_indices']}
        require(sorted(indices['high']+indices['weak'])==indices['any'] and not set(indices['high'])&set(indices['weak']),'Input partition differs')
        require(indices['high']==np.flatnonzero(scores>=.6).tolist() and indices['weak']==np.flatnonzero(scores<.6).tolist(),'Original high/weak split differs')
        frame_boxes.append(boxes);frame_indices.append(indices)
        before=_states(t['before_update']);pred=_states(t['predicted']);pre=_states(t['before_lifecycle_prune']);after=_states(t['after_update'])
        require(before==previous,'Previous posterior / next pre-predict discontinuity')
        require(_states(t['before_predict'])==before and set(pred)==set(before),'Prediction ownership differs')
        require(t['after_budget_prune']==t['predicted'],'Fixed pre-association budget changed')
        c['continuity_checks']+=len(before)
        updates={}
        for stage in t['stages']:
            require(stage['gate']==.1,'Original native gate differs')
            for row,col in stage['matched']:
                token=stage['tracks'][row]['token'];index=stage['detection_indices'][col]
                require(token not in updates and token in pred,'One accepted update per owned hypothesis required')
                updates[token]={'frame':f,'stage':'high' if stage['name']=='high_all' else 'weak',
                    'detection_index':index,'bbox':boxes[index].tolist(),'posterior':pre[token]}
        for token,state in pred.items():
            require(state['age']==before[token]['age']+1 and state['age_since_update']==before[token]['age_since_update']+1,'Native fixed-step clock differs')
            predictions[(f,token)]=state;c['predicted_rows']+=1
            old_bits=dimensions(before[token]['bbox']);bits=dimensions(state['bbox'])
            c['nonpositive_predicted_rows']+=any(bits)
            c['prediction_positive_to_nonpositive']+=not any(old_bits) and any(bits)
            c['prediction_nonpositive_to_positive']+=any(old_bits) and not any(bits)
            # First prediction uses only accepted history strictly before this frame.
            observe(state,'prediction',f)
            if token in updates:
                u=updates[token];post=u['posterior'];c['accepted_'+u['stage']]+=1
                c['accepted_nonpositive_input']+=any(dimensions(u['bbox']))
                c['accepted_from_nonpositive_prediction']+=any(bits)
                post_bad=any(dimensions(post['bbox']));c['accepted_nonpositive_posterior']+=post_bad
                c['accepted_repaired_prediction']+=any(bits) and not post_bad
                c['accepted_created_nonpositive']+=not any(bits) and post_bad
                require(post['age_since_update']==0,'Accepted native update must reset clock')
                history=tracks[token]
                observe(post,'accepted_'+u['stage'],f,current=u)
                if history['accepted']:update_gaps[str(f-history['accepted'][-1]['frame'])]+=1
                else:birth_gaps[str(f-history['birth']['frame'])]+=1
                history['accepted'].append(u)
            else:require(pre[token]==state,'Unmatched posterior changed without a native update')
        born=set()
        for birth in t['births']:
            state=birth['state'];token=state['token'];index=birth['detection_index']
            require(token not in tracks and token not in pred and index in indices['high'],'Birth ownership/seed differs')
            require(np.array_equal(state['bbox'],boxes[index]) and state['age_since_update']==0,'Native seed state differs')
            entry={**birth,'frame':f};tracks[token]={'birth':entry,'accepted':[],'first':None,'seen_dimensions':[False,False],'end':None}
            born.add(token);c['births']+=1;observe(state,'birth',f);events.append(('birth',f,token))
        require(set(pre)==set(pred)|born,'Lifecycle pre-prune membership differs')
        c['posterior_rows']+=len(pre);c['nonpositive_posterior_rows']+=sum(any(dimensions(s['bbox'])) for s in pre.values())
        removed=_states([r['state'] for r in t['removals']])
        require(set(after).isdisjoint(removed) and set(after)|set(removed)==set(pre),'Native prune partition differs')
        require(all(after[k]==pre[k] for k in after) and all(removed[k]==pre[k] for k in removed),'Prune altered retained/removed snapshots')
        for removal in t['removals']:
            state=removal['state'];token=state['token'];kind=removal['reason']
            require(kind in EVENTS[1:4] and tracks[token]['end'] is None,'Unknown/repeated lifecycle removal')
            tracks[token]['end']={'frame':f,'kind':kind,'state':state};c['removed_'+kind]+=1
            c['nonpositive_removed']+=any(dimensions(state['bbox']));events.append((kind,f,token))
        previous=after
    for token,state in previous.items():
        tracks[token]['end']={'frame':len(traces),'kind':'source_end','state':state}
        events.append(('source_end',len(traces),token));c['source_end_censored']+=1
    require(all(h['end'] is not None for h in tracks.values()),'Unaccounted lifecycle end')
    streams={k:[bool(indices[k]) for indices in frame_indices] for k in KINDS}
    global_runs={k:empty_runs(flags) for k,flags in streams.items()}
    names=tuple(KINDS)+tuple(k+':'+level for k in KINDS for level in ('positive','gate'))
    contexts={e:{n:{'events':0,'at_event':0,'before':Counter(),'after':Counter()} for n in names} for e in EVENTS}
    predicted_names=tuple('prediction:'+k+':'+level for k in KINDS for level in ('positive','gate'))
    terminal={e:Counter({'hypotheses':0,'row_frames':0,'seed_only':0,**{k:0 for k in names+predicted_names}}) for e in EVENTS[1:]}
    terminal_gaps={e:Counter() for e in EVENTS[1:]};raw_context=[]
    for kind,frame,token in events:
        h=tracks[token];origin=h['birth'] if kind=='birth' or not h['accepted'] else h['accepted'][-1]
        anchor=origin['state']['bbox'] if origin is h['birth'] else origin['bbox']
        flags={k:list(v) for k,v in streams.items()}
        for k in KINDS:
            values=[]
            for boxes,indices in zip(frame_boxes,frame_indices):
                sub=boxes[indices[k]]
                values.append(float(np.max(iou.compute(np.asarray([anchor],dtype=np.float32),sub))) if len(sub) else None)
            for level in ('positive','gate'):
                flags[k+':'+level]=[s is not None and (s>0 if level=='positive' else s>=.1) for s in values]
        local={'kind':kind,'frame':frame,'token':token,'anchor_origin':'seed' if origin is h['birth'] else 'accepted',
               'anchor':anchor,'origin_frame':origin['frame'],'neighbours':{}}
        for name,values in flags.items():
            near=neighbours(values,frame);local['neighbours'][name]=near;dest=contexts[kind][name]
            dest['events']+=1;dest['at_event']+=near['at_event'];dest['before'][near['before']]+=1;dest['after'][near['after']]+=1
        raw_context.append(local)
        if kind=='birth':continue
        dest=terminal[kind];dest['hypotheses']+=1;dest['seed_only']+=not h['accepted']
        terminal_gaps[kind][str(frame-origin['frame'])]+=1
        for f in range(origin['frame']+1,frame+1):
            require((f,token) in predictions,'Missing prediction within terminal gap')
            dest['row_frames']+=1
            for name in names:dest[name]+=flags[name][f-1]
            predicted=predictions[(f,token)]['bbox']
            for k in KINDS:
                sub=frame_boxes[f-1][frame_indices[f-1][k]]
                score=float(np.max(iou.compute(np.asarray([predicted]),sub))) if len(sub) else None
                dest['prediction:'+k+':positive']+=score is not None and score>0
                dest['prediction:'+k+':gate']+=score is not None and score>=.1
    # Raw hypothesis/case data must never be placed in the public aggregate.
    result={'counts':dict(c),'first_phase':dict(first_phase),'first_dimensions':dict(first_dimensions),
        'first_role':dict(first_role),'first_prior_stage':dict(first_prior),'first_prior_gap_histogram':dict(sorted(first_gaps.items())),
        'first_prior_input_health':dict(prior_input_health),'first_prior_posterior_health':dict(prior_posterior_health),
        'dimension_first_phase':dict(dimension_phases),'accepted_interupdate_gap_histogram':dict(sorted(update_gaps.items())),
        'birth_to_first_update_gap_histogram':dict(sorted(birth_gaps.items())), 'global_empty_runs':global_runs,
        'contexts':contexts,'terminal':terminal,'terminal_gap_histograms':terminal_gaps}
    require(set(c)==set(COUNT_KEYS),'Public count whitelist differs')
    return result,{'first_nonpositive':first,'hypotheses':list(tracks.values()),'contexts':raw_context}
