# SPDX-License-Identifier: AGPL-3.0-only
"""Read-only applicability funnel on sealed causal-control histories.

No tracking/inference, GT, new intervention, score cutoff or cross-arm joins.
Reconstruct original accepted assignments, then verify every recorded decision.
"""
from collections import Counter, defaultdict
import json
import numpy as np
from depthport.tracking_past_support_control import ARMS, protect_updates
from depthport.tracking_recovery_control import MARGIN, PARAMETERS

COUNT_KEYS = ('frames','input_detections','weak_detections','frames_with_weak_input',
    'frames_without_association','weak_stage_frames','weak_remaining_rows','missed_rows',
    'frames_with_missed_rows','missed_rows_with_weak_input','frames_missed_with_weak_input',
    'missed_rows_no_gate_column','missed_rows_gate_unselected','opportunities','opportunity_frames',
    'no_active_row','active_rows_below_gate','active_gate_outside_margin','active_competition',
    'active_alternatives','retained_alternatives','unconfirmed_alternatives',
    'past_supported','past_missing','past_ineligible','protection_pass','protection_occupied',
    'protection_displaced','joint_alternatives','opportunities_past','opportunities_protected',
    'opportunities_joint','audited_candidate_edges','actual_vetoes','veto_frames','age_checks','accepted_observations')
PAST_REASONS = ('past_accepted_active_support','missing_recorded_history','past_stage_comparison_missing',
    'past_competitor_without_observation','past_retained','past_unconfirmed','past_below_gate','past_gap_not_supported')
MISSING = frozenset(('missing_recorded_history','past_stage_comparison_missing','past_competitor_without_observation'))
PROTECTION = ('preserves_other_updates','competitor_occupied','displaces_other_update')
COMPETITION = ('no_active_row','active_rows_below_gate','active_gate_outside_margin','active_competition')


def require(ok, text):
    if not ok:
        raise ValueError(text)


def role(t):
    return 'unconfirmed' if t['tracker_id'] < 0 else 'active' if t['age_since_update'] == 1 else 'retained'


def normal(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'))


def matrix(stage):
    shape=(len(stage['tracks']),len(stage['detection_indices']))
    s=np.asarray(stage['similarity'],dtype=np.float32).reshape(shape)
    require(np.isfinite(s).all() and np.all((s>=0)&(s<=1)), 'Invalid recorded similarity')
    require(normal(s.tolist())==normal(stage['similarity']), 'Recorded values not lossless float32')
    return s


def assignment(s, gate):
    from scipy.optimize import linear_sum_assignment
    if 0 in s.shape:
        return []
    rows,cols=linear_sum_assignment(s,maximize=True)
    return [(int(r),int(c)) for r,c in zip(rows,cols) if s[r,c]>=np.float32(gate)]


class GapLedger:
    def __init__(self,arm):
        require(arm in ARMS,'Unknown causal arm');self.arm=arm;self.number=0
        self.counts=Counter();self.past=Counter();self.protection=Counter();self.cross=Counter();self.missing_history=Counter()
        self.history=defaultdict(list);self.context={};self.previous=set();self.seen=set()

    def past_evidence(self,rt,qt):
        r,q=rt['token'],qt['token']
        if role(qt)!='active':
            return {'qualified':False,'reason':'current_'+role(qt)}
        if not self.history[r] or not self.history[q]:
            return {'qualified':False,'reason':'missing_recorded_history'}
        context=self.context[r];require(context['key'][0]<self.number,'Future support used')
        old=context['competitors'].get(q)
        if old is None:
            return {'qualified':False,'reason':'past_stage_comparison_missing'}
        if old['role']!='active':
            return {'qualified':False,'reason':'past_'+old['role']}
        if old['accepted_key'] is None:
            return {'qualified':False,'reason':'past_competitor_without_observation'}
        if not old['gate_supported']:
            return {'qualified':False,'reason':'past_below_gate'}
        if not old['gap_supported']:
            return {'qualified':False,'reason':'past_gap_not_supported'}
        require(old['accepted_key'] in self.history[q] and context['key']==self.history[r][-1], 'Immutable observation history differs')
        return {'qualified':True,'reason':'past_accepted_active_support',
                'selected_observation':context['key'],'competitor_observation':old['accepted_key']}

    def commit(self,stage,s):
        refs=stage['tracks'];observations={refs[r]['token']:(self.number,stage['detection_indices'][c]) for r,c in stage['matched']}
        pending={}
        for r,c in stage['matched']:
            pending[refs[r]['token']]={'key':observations[refs[r]['token']], 'competitors':{
                t['token']:{'role':role(t),'accepted_key':observations.get(t['token']),
                    'gate_supported':float(s[q,c])>=stage['gate'],
                    'gap_supported':float(s[q,c])>=stage['gate'] and float(s[r,c])-float(s[q,c])<=MARGIN}
                for q,t in enumerate(refs) if q!=r}}
        for token,key in observations.items():
            require(key not in self.accepted_keys and (not self.history[token] or self.history[token][-1][0]<self.number), 'Duplicate/noncausal accepted observation')
            self.accepted_keys.add(key);self.history[token].append(key);self.context[token]=pending[token]
            self.counts['accepted_observations']+=1

    def frame(self,frame,detections,write=None):
        self.number+=1;require(frame['frame']==self.number,'Frame coverage differs');c=self.counts;c['frames']+=1
        scores=np.asarray([x['confidence'] for x in detections],dtype=np.float32)
        high=np.flatnonzero(scores>=np.float32(PARAMETERS['high_conf_det_threshold'])).tolist()
        weak=np.flatnonzero(scores<np.float32(PARAMETERS['high_conf_det_threshold'])).tolist()
        c['input_detections']+=len(scores);c['weak_detections']+=len(weak);c['frames_with_weak_input']+=bool(weak)
        stages=frame['stages'];self.accepted_keys=set()
        if not stages:
            require(not detections and not frame['deferred'] and not frame['past_support_audit'],'Missing association with recorded data')
            c['frames_without_association']+=1;self.previous=set();return
        require([s['name'] for s in stages]==['high_all','weak_remaining'],'Unexpected stage order')
        first,stage=stages;require(first['detection_indices']==high and stage['detection_indices']==weak,'Cache float32 split differs')
        s0,s=matrix(first),matrix(stage)
        present={t['token']:t for t in first['tracks']};require(len(present)==len(first['tracks']),'Duplicate token')
        for token,t in present.items():
            if token in self.seen:
                require(token in self.previous,'Pruned ownership token reappeared')
            if self.history[token]:
                require(t['age_since_update']==self.number-self.history[token][-1][0],'Accepted-observation age differs')
                c['age_checks']+=1
        require(all(t==present.get(t['token']) for t in stage['tracks']),'Remaining snapshot differs')
        require(set(map(tuple,first['matched']))==set(assignment(s0,first['gate'])),'High assignment differs')
        self.commit(first,s0)
        removed={(e['row'],e['column']) for e in frame['deferred']};actual=set(map(tuple,stage['matched']))
        original=assignment(s,stage['gate'])
        require(not (actual&removed) and actual|removed==set(original),'Original weak matching reconstruction differs')
        require(set(stage['unmatched_rows'])==set(range(s.shape[0]))-{r for r,_ in actual}
                and set(stage['unmatched_columns'])==set(range(s.shape[1]))-{col for _,col in actual},'Accepted/unmatched partition differs')
        refs=stage['tracks'];missed=[r for r,t in enumerate(refs) if t['tracker_id']>=0 and t['age_since_update']>=2]
        c['weak_stage_frames']+=1;c['weak_remaining_rows']+=len(refs);c['missed_rows']+=len(missed);c['frames_with_missed_rows']+=bool(missed)
        if weak:
            c['missed_rows_with_weak_input']+=len(missed);c['frames_missed_with_weak_input']+=bool(missed)
            for r in missed:
                if not np.any(s[r]>=np.float32(stage['gate'])):c['missed_rows_no_gate_column']+=1
                elif r not in dict(original):c['missed_rows_gate_unselected']+=1
        opportunities=[(r,col) for r,col in original if r in missed]
        c['opportunities']+=len(opportunities);c['opportunity_frames']+=bool(opportunities)
        audit={(e['row'],e['column']):e for e in frame['past_support_audit']}
        require(len(audit)==len(frame['past_support_audit']),'Duplicate audit edge')
        expected_audit=set();expected_removed=set()
        for r,col in opportunities:
            active=[q for q,t in enumerate(refs) if q!=r and role(t)=='active']
            gated=[q for q in active if s[q,col]>=np.float32(stage['gate'])]
            eligible=[q for q,t in enumerate(refs) if q!=r and s[q,col]>=np.float32(stage['gate']) and s[r,col]-s[q,col]<=np.float32(MARGIN)]
            active_eligible=[q for q in eligible if role(refs[q])=='active']
            state=COMPETITION[0 if not active else 1 if not gated else 2 if not active_eligible else 3];c[state]+=1
            chosen=[];past_any=protected_any=joint_any=False
            if eligible:
                expected_audit.add((r,col));edge=audit[(r,col)]
                require([q['row'] for q in edge['competitors']]==eligible,'Recorded competition differs')
                for q,record in zip(eligible,edge['competitors']):
                    t=refs[q];kind=role(t);require(record['role']==kind,'Role differs');c[kind+'_alternatives']+=1
                    past=self.past_evidence(refs[r],t)
                    require(normal(past)==normal(record['past']),'Recorded past support differs')
                    protection=(protect_updates(s,stage['gate'],r,q,col,original) if kind=='active'
                                else {'protected':False,'reason':'not_active','lost_other_updates':None})
                    require(normal(protection)==normal(record['protection']),'Recorded update protection differs')
                    accepted=bool(kind=='active' and (self.arm==ARMS[1] and past['qualified'] or self.arm==ARMS[2] and protection['protected'] or self.arm==ARMS[3] and past['qualified'] and protection['protected']))
                    require(record['selected']==accepted,'Recorded competitor selection differs')
                    if accepted:chosen.append(q)
                    if kind=='active':
                        reason=past['reason'];require(reason in PAST_REASONS,'Unknown past reason');self.past[reason]+=1
                        category='supported' if past['qualified'] else 'missing' if reason in MISSING else 'ineligible'
                        c['past_'+category]+=1;self.protection[protection['reason']]+=1;self.cross[(category,protection['reason'])]+=1
                        pk={'preserves_other_updates':'pass','competitor_occupied':'occupied','displaces_other_update':'displaced'}[protection['reason']]
                        c['protection_'+pk]+=1;past_any|=past['qualified'];protected_any|=protection['protected'];joint_any|=past['qualified'] and protection['protected']
                        c['joint_alternatives']+=bool(past['qualified'] and protection['protected'])
                        if reason=='missing_recorded_history':
                            missing='both' if not self.history[refs[r]['token']] and not self.history[t['token']] else 'selected' if not self.history[refs[r]['token']] else 'competitor'
                            self.missing_history[missing]+=1
                require(edge['veto']==bool(chosen),'Recorded edge decision differs')
                if chosen:
                    expected_removed.add((r,col));raw=next(e for e in frame['deferred'] if (e['row'],e['column'])==(r,col))
                    require(raw['competitor_rows']==chosen,'Deferred competitor list differs')
            c['opportunities_past']+=past_any;c['opportunities_protected']+=protected_any;c['opportunities_joint']+=joint_any
            if write:write({'frame':self.number,'selected_token':refs[r]['token'],'column':col,'state':state,'active_competitors':len(active),'gate_competitors':len(gated),'eligible_active_competitors':len(active_eligible),'past_any':bool(past_any),'protected_any':bool(protected_any),'joint_any':bool(joint_any),'veto':bool(chosen)})
        require(set(audit)==expected_audit and removed==expected_removed,'Audit/veto completeness differs')
        c['audited_candidate_edges']+=len(audit);c['actual_vetoes']+=len(removed);c['veto_frames']+=bool(removed);self.commit(stage,s)
        self.previous=set(present);self.seen.update(present)

    def summary(self):
        c={k:int(self.counts[k]) for k in COUNT_KEYS}
        require(c['missed_rows_with_weak_input']==c['missed_rows_no_gate_column']+c['missed_rows_gate_unselected']+c['opportunities'],'Weak opportunity partition differs')
        require(sum(c[k] for k in COMPETITION)==c['opportunities'],'Competition partition differs')
        require(c['active_alternatives']==c['past_supported']+c['past_missing']+c['past_ineligible']==sum(c['protection_'+k] for k in ('pass','occupied','displaced')),'Alternative partitions differ')
        return {'counts':c,'past_reasons':{k:self.past[k] for k in PAST_REASONS},
                'missing_history_side':{k:self.missing_history[k] for k in ('selected','competitor','both')},
                'protection_reasons':{k:self.protection[k] for k in PROTECTION},
                'past_protection_cross':{a+'/'+b:self.cross[(a,b)] for a in ('supported','missing','ineligible') for b in PROTECTION}}
