# SPDX-License-Identifier: AGPL-3.0-only
"""Read-only causal-predicate audit of sealed zero-action candidate histories.

No tracker, state update, solver, inference, GT or future observations. Pure
geometry is injected; production uses the pinned original IoU implementation.
Raw row/edge/prefix records are local, aggregate counters are public.
"""
from collections import Counter
import hashlib
import numpy as np
from depthport.tracking_accepted_events import AcceptedLedger, encoded, require

ROLES=('active_confirmed','retained_confirmed','active_tentative','retained_tentative')
ROW_BITS=('confirmed','accepted_before','positive_prediction')
BIRTH_STEPS=('free_pairs','confirmed','accepted_before','positive_prediction','activation','current_gate','no_weak')
HANDOFF_STEPS=('selected_free_triples','both_qualified','both_active','both_previous_acceptance',
               'selected_previous_high_context','competitor_in_context','past_active_confirmed',
               'past_gate','past_margin','distinct_previous_inputs','current_gate','current_margin','no_weak')


def native_iou(a,b):
    from trackers.utils.iou import IoU
    return IoU().compute(a,b)


def role(state):
    return ('active' if state['age_since_update']==0 else 'retained')+'_'+('confirmed' if state['tracker_id']>=0 else 'tentative')


def zero(keys):return Counter({k:0 for k in keys})


def inspect_stage(life,last,contexts,activation,margin,iou):
    """Calculate predicates BEFORE current-frame acceptance/context commit.

    This fixed study already publishes zero actions. Recorded matches therefore
    are native accepted matches; an unexpected nonzero action fails at caller,
    never guessed by rerunning a solver or silently coerced to zero.
    """
    f=life['frame'];pre={s['token']:s for s in life['before_update']}
    for key in last.values():require(key[0]<f,'Current/future accepted observation forbidden')
    for ctx in contexts.values():require(ctx['frame']<f and ctx['key'][0]<f,'Current/future context forbidden')
    if not life['stages']:
        require(not pre and not life['input_boxes'],'Only native empty frame bypasses stages')
        return {'no_stage':True,'rows':[],'birth':[],'handoff':[],'birth_actions':[],'handoff_actions':[],
                'birth_graph':[],'handoff_graph':[],'handoff_proposals':[],'claim_conflicts':[]}
    high=life['stages'][0];require(high['name']=='high_all','First stage must be high')
    tracks=high['tracks'];tokens=[s['token'] for s in tracks];gate=high['gate']
    require(tokens==[s['token'] for s in life['before_update']] and high['tracks']==life['predicted'], 'Original high-stage rows differ')
    require(all(pre[t]['tracker_id']==s['tracker_id'] and s['age_since_update']==pre[t]['age_since_update']+1
                for t,s in zip(tokens,tracks)),'Use pre-predict roles, not incremented stage age')
    boxes=np.asarray(life['input_boxes'],dtype=np.float32).reshape(-1,4)
    predicted=np.asarray([s['bbox'] for s in tracks],dtype=np.float64).reshape(-1,4)
    high_ids=high['detection_indices'];weak_ids=life['weak_indices']
    require(high_ids==life['high_indices'],'Original high columns differ')
    s=np.asarray(high['similarity'],dtype=np.float64).reshape(len(tracks),len(high_ids))
    computed=iou(predicted.copy(),boxes[high_ids].copy())
    weak=iou(predicted.copy(),boxes[weak_ids].copy())
    require(computed.shape==s.shape and np.isfinite(computed).all() and np.array_equal(computed,s),'Exact high IoU differs')
    require(weak.shape==(len(tracks),len(weak_ids)) and np.isfinite(weak).all(),'Finite full weak geometry required')
    matched=[tuple(x) for x in high['matched']];free_rows=high['unmatched_rows'];free_cols=high['unmatched_columns']
    require(len(set(r for r,c in matched))==len(matched)==len(set(c for r,c in matched))
        and set(free_rows)==set(range(len(tracks)))-{r for r,c in matched}
        and set(free_cols)==set(range(len(high_ids)))-{c for r,c in matched},'Complete one-to-one original partition required')
    require(all(s[r,c]>=gate for r,c in matched),'Native accepted high below gate')
    rows=[]
    for r,t in enumerate(tokens):
        box=tracks[r]['bbox'];bits=[pre[t]['tracker_id']>=0,t in last,box[2]>box[0] and box[3]>box[1]]
        rows.append({'index':r,'token':t,'role':role(pre[t]),'mask':''.join(str(int(b)) for b in bits),
            'qualified':all(bits),'weak_blocked':bool(np.any(weak[r]>=gate)),'free':r in free_rows})
    birth=[];birth_graph=[]
    for r in free_rows:
        for c in free_cols:
            a=rows[r];confidence=float(life['input_confidences'][high_ids[c]])
            flags=[True,*[v=='1' for v in a['mask']],confidence>=activation,bool(s[r,c]>=gate),not a['weak_blocked']]
            birth.append({'r':r,'c':c,'role':a['role'],'flags':flags,'score':float(s[r,c])})
            if all(flags):birth_graph.append((r,c))
    row_degree=Counter(r for r,c in birth_graph);col_degree=Counter(c for r,c in birth_graph)
    birth_actions=[(r,c) for r,c in birth_graph if row_degree[r]==col_degree[c]==1]
    handoff=[];handoff_graph=[]
    for r,c in matched:
        for q in free_rows:
            rt,qt=tokens[r],tokens[q];rk,qk=last.get(rt),last.get(qt);ctx=contexts.get(rt)
            current_ctx=bool(ctx and ctx['frame']==f-1 and ctx['key']==rk)
            other=ctx['comparisons'].get(qt) if current_ctx else None
            flags=[True,rows[r]['qualified'] and rows[q]['qualified'],
                rows[r]['role']=='active_confirmed' and rows[q]['role']=='active_confirmed',
                bool(rk and qk and rk[0]==qk[0]==f-1),current_ctx,other is not None,
                bool(other and other['active_confirmed']),bool(other and other['gate']),bool(other and other['gap']),
                bool(rk and qk and rk[:2]!=qk[:2]),bool(s[q,c]>=gate),bool(s[r,c]-s[q,c]<=margin),not rows[q]['weak_blocked']]
            handoff.append({'r':r,'c':c,'q':q,'role_pair':[rows[r]['role'],rows[q]['role']],
                'flags':flags,'last_keys':[rk,qk],'context':ctx,'selected_score':float(s[r,c]),'alternative_score':float(s[q,c])})
            if all(flags):handoff_graph.append((r,c,q))
    alternatives=Counter((r,c) for r,c,q in handoff_graph)
    proposals=[(r,c,q) for r,c,q in handoff_graph if alternatives[r,c]==1]
    claims=Counter(q for r,c,q in proposals)
    conflicts=[x for x in proposals if claims[x[2]]>1]
    actions=[x for x in proposals if claims[x[2]]==1]
    return {'no_stage':False,'rows':rows,'high_columns':len(high_ids),'weak_columns':len(weak_ids),
        'free_rows':list(free_rows),'free_columns':list(free_cols),'matched':matched,
        'activation_columns':sum(float(life['input_confidences'][i])>=activation for i in high_ids),
        'birth':birth,'birth_graph':birth_graph,'birth_actions':birth_actions,'handoff':handoff,
        'handoff_graph':handoff_graph,'handoff_proposals':proposals,'claim_conflicts':conflicts,'handoff_actions':actions}


class ReachabilityAudit:
    def __init__(self,arm,activation,high_threshold,gate,margin,iou=native_iou):
        require(arm in ('birth_continuation','past_competition_handoff'),'Actual candidate stream required')
        self.arm=arm;self.activation=activation;self.high_threshold=high_threshold;self.gate=gate;self.margin=margin;self.iou=iou
        self.ledger=AcceptedLedger();self.last={};self.contexts={};self.receipt=hashlib.sha256()
        self.counters=zero(('frames','high_stage_frames','no_high_stage_frames','high_rows','high_columns','weak_columns',
            'high_matched_pairs','high_free_rows','high_free_columns','activation_columns',
            'high_free_activation_columns','broad_weak_blocked_rows','free_weak_blocked_rows'))
        self.availability=zero(f'{i:04b}' for i in range(16))
        self.roles={k:{r:0 for r in ROLES} for k in ('high_rows','free_rows','qualified_free_rows','weak_blocked_rows')}
        self.masks={k:{f'{i:03b}':0 for i in range(8)} for k in ('high_rows','free_rows')}
        self.birth={r:zero((*BIRTH_STEPS,'weak_excluded_preproposal_edges','ambiguous_nonproposal_edges',
            'qualified_proposals','rejected_qualified_proposals','rule_action_edges')) for r in ('active_confirmed','retained_confirmed','tentative')}
        self.handoff=zero((*HANDOFF_STEPS,'weak_excluded_preproposal_edges','selected_zero_alternative',
            'selected_multiple_alternatives','unique_alternative_proposals','claim_conflict_proposals','rule_action_edges'))
        self.pair_roles={a+'__'+b:0 for a in ROLES for b in ROLES}
        self.terminal=zero('not_proposed_at_'+s for s in HANDOFF_STEPS[1:])
        self.weak_calls=0

    def add(self,record):
        require(set(record)=={'lifecycle','numerical','geometry','candidate'},'Exact original candidate trace required')
        life=record['lifecycle'];c=record['candidate'];f=life['frame']
        require(f==self.ledger.frames+1 and life['before_update']==self.ledger.previous,'Dense full prefix required')
        require(c['frame']==f and c['arm']==self.arm and c['actions']==[],'Previously published zero-action contract differs')
        require(all(s['token'] in self.ledger.births for s in life['before_update']),'Unknown predecision birth evidence')
        expected_high=[i for i,n in enumerate(life['input_confidences']) if np.float32(n)>=self.high_threshold]
        require(expected_high==life['high_indices'],'Original confidence partition differs')
        require(all(s['gate']==self.gate for s in life['stages']),'Frozen native gate required')
        info=inspect_stage(life,self.last,self.contexts,self.activation,self.margin,self.iou)
        self.counters['frames']+=1
        if info['no_stage']:
            self.counters['no_high_stage_frames']+=1
        else:
            self.counters['high_stage_frames']+=1
            for k,v in (('high_rows',len(info['rows'])),('high_columns',info['high_columns']),('weak_columns',info['weak_columns']),
                        ('high_matched_pairs',len(info['matched'])),('high_free_rows',len(info['free_rows'])),
                        ('high_free_columns',len(info['free_columns'])),('activation_columns',info['activation_columns'])):self.counters[k]+=v
            high=life['stages'][0]
            self.counters['high_free_activation_columns']+=sum(float(life['input_confidences'][high['detection_indices'][i]])>=self.activation for i in info['free_columns'])
            availability=''.join(str(int(bool(x))) for x in (info['rows'],info['high_columns'],info['free_rows'],info['free_columns']))
            self.availability[availability]+=1
            for row in info['rows']:
                r=row['role'];self.roles['high_rows'][r]+=1;self.masks['high_rows'][row['mask']]+=1
                if row['free']:
                    self.roles['free_rows'][r]+=1;self.masks['free_rows'][row['mask']]+=1
                    self.roles['qualified_free_rows'][r]+=row['qualified']
                    self.counters['free_weak_blocked_rows']+=row['weak_blocked']
                self.roles['weak_blocked_rows'][r]+=row['weak_blocked'];self.counters['broad_weak_blocked_rows']+=row['weak_blocked']
            require(sum(row['weak_blocked'] for row in info['rows'])==c['weak_blocked_rows'],'Original broad weak-block receipt differs')
            for edge in info['birth']:
                role_here=edge['role'] if edge['role'].endswith('_confirmed') else 'tentative';b=self.birth[role_here]
                for i,k in enumerate(BIRTH_STEPS):b[k]+=all(edge['flags'][:i+1])
                b['weak_excluded_preproposal_edges']+=all(edge['flags'][:-1]) and not edge['flags'][-1]
            for r,col in info['birth_graph']:
                b=self.birth[info['rows'][r]['role']]
                if (r,col) in info['birth_actions']:b['qualified_proposals']+=1;b['rule_action_edges']+=1
                else:b['ambiguous_nonproposal_edges']+=1
            for edge in info['handoff']:
                self.pair_roles['__'.join(edge['role_pair'])]+=1
                for i,k in enumerate(HANDOFF_STEPS):self.handoff[k]+=all(edge['flags'][:i+1])
                failed=next((i for i,v in enumerate(edge['flags']) if not v),None)
                if failed is not None:self.terminal['not_proposed_at_'+HANDOFF_STEPS[failed]]+=1
                self.handoff['weak_excluded_preproposal_edges']+=all(edge['flags'][:-1]) and not edge['flags'][-1]
            by_pair=Counter((r,col) for r,col,q in info['handoff_graph'])
            self.handoff['selected_zero_alternative']+=sum(by_pair[x]==0 for x in info['matched'])
            self.handoff['selected_multiple_alternatives']+=sum(by_pair[x]>1 for x in info['matched'])
            self.handoff['unique_alternative_proposals']+=len(info['handoff_proposals'])
            self.handoff['claim_conflict_proposals']+=len(info['claim_conflicts']);self.handoff['rule_action_edges']+=len(info['handoff_actions'])
            # On actual candidate streams only; other predicate group is descriptive.
            actions=info['birth_actions'] if self.arm=='birth_continuation' else info['handoff_actions']
            require(not actions,'Reconstructed actions disagree with original zero-action record')
            # Original weak stage uses precisely the high-unmatched rows, before any weak update.
            require(len(life['stages'])==2,'Pinned high/weak stages required')
            weak=life['stages'][1]
            require([s['token'] for s in weak['tracks']]==[high['tracks'][i]['token'] for i in info['free_rows']], 'Original weak rows differ')
            boxes=np.asarray(life['input_boxes'],dtype=np.float32).reshape(-1,4)
            predicted=np.asarray([s['bbox'] for s in high['tracks']],dtype=np.float64).reshape(-1,4)
            raw=self.iou(predicted[info['free_rows']].copy(),boxes[life['weak_indices']].copy())
            require(np.array_equal(raw,np.asarray(weak['similarity']).reshape(len(weak['tracks']),len(weak['detection_indices']))),'Exact original weak matrix differs')
        self.weak_calls+=int(len(life['stages'])==2)
        require(c['weak_stages']==int(len(life['stages'])==2) and c['protected_other_updates_lost']==0,'Original weak/protection receipt differs')
        self.receipt.update(encoded(info))
        # Build pending contexts from archived accepted high results, then commit
        # all high+weak accepted observations only after decisions above.
        pending={}
        if life['stages']:
            high=life['stages'][0];pre={s['token']:s for s in life['before_update']}
            mat=np.asarray(high['similarity']).reshape(len(high['tracks']),len(high['detection_indices']))
            for r,col in high['matched']:
                token=high['tracks'][r]['token'];key=(f,high['detection_indices'][col],'high')
                pending[token]={'frame':f,'key':key,'comparisons':{t['token']:{
                    'active_confirmed':role(pre[t['token']])=='active_confirmed',
                    'gate':bool(mat[q,col]>=high['gate']),'gap':bool(mat[r,col]-mat[q,col]<=self.margin)}
                    for q,t in enumerate(high['tracks']) if q!=r}}
        events=self.ledger.add({k:record[k] for k in ('lifecycle','numerical','geometry')})
        for event in events:
            if event['kind']=='accepted':self.last[event['local_token']]=(*event['input'],event['stage'])
        self.contexts.update(pending)
        return {'frame':f,'predicates':info}

    def summary(self):
        require(self.counters['frames']==self.counters['high_stage_frames']+self.counters['no_high_stage_frames']
            and sum(self.availability.values())==self.counters['high_stage_frames'],'Frame denominators differ')
        require(sum(self.roles['high_rows'].values())==sum(self.masks['high_rows'].values())==self.counters['high_rows']
            and sum(self.roles['free_rows'].values())==sum(self.masks['free_rows'].values())==self.counters['high_free_rows'], 'Row denominators differ')
        for b in self.birth.values():
            require(b['current_gate']==b['no_weak']+b['weak_excluded_preproposal_edges'],'Birth weak partition differs')
            require(b['no_weak']==b['qualified_proposals']+b['ambiguous_nonproposal_edges'],'Birth graph partition differs')
            require(b['qualified_proposals']==b['rule_action_edges'] and b['rejected_qualified_proposals']==0,'No post-proposal birth veto exists')
        h=self.handoff
        require(h['current_margin']==h['no_weak']+h['weak_excluded_preproposal_edges'],'Handoff weak partition differs')
        require(h['unique_alternative_proposals']==h['claim_conflict_proposals']+h['rule_action_edges'],'Handoff proposal partition differs')
        require(sum(self.terminal.values())+h['no_weak']==h['selected_free_triples'],'Prerequisite terminal partition differs')
        require(h['selected_zero_alternative']+h['selected_multiple_alternatives']+h['unique_alternative_proposals']==self.counters['high_matched_pairs'],'Selected high partition differs')
        return {'counters':dict(self.counters),'availability_masks':dict(self.availability),'roles':self.roles,'row_qualification_masks':self.masks,
            'birth_by_role':({r:dict(v) for r,v in self.birth.items()} if self.arm=='birth_continuation' else None),
            'handoff':(dict(h) if self.arm=='past_competition_handoff' else None),
            'handoff_pair_roles':(self.pair_roles if self.arm=='past_competition_handoff' else None),
            'handoff_nonproposal_priority':(dict(self.terminal) if self.arm=='past_competition_handoff' else None),'weak_stage_calls':self.weak_calls,
            'accepted_summary':self.ledger.summary(),'audit_receipt_sha256':self.receipt.hexdigest(),
            'current_or_future_used_as_prior':False,'identity_or_quality_accepted':False}
