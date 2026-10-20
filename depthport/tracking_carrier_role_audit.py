# SPDX-License-Identifier: AGPL-3.0-only
"""Read sealed output carriers and histories; never execute a tracker/evaluator."""
from collections import Counter
import hashlib
import json
import math
import re
import numpy as np
from depthport.tracking_lifecycle_probe import require
from depthport.tracking_geometry_exposure import frame_counts, GROUPS
from depthport.tracking_geometry_validation import COUNTS

ROLE_COUNTS = ('frames','births','tentative_prediction_rows','tentative_active_pre',
    'tentative_retained_pre','tentative_zero_velocity_pre','tentative_after_predict_age_one',
    'tentative_candidate_rows','tentative_applied_rows','tentative_high_promotions',
    'tentative_weak_promotions','tentative_unmatched_removed','tentative_weak_stage_rows',
    'source_end_tentative_censored','end_frame_tentative_rows')


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Duplicate JSON key')
            result[key] = value
        return result
    def constant(_):
        raise ValueError('Nonfinite JSON constant')
    return json.loads(text, object_pairs_hook=pairs, parse_constant=constant)


def encoded(value):
    # Original native writer recipe, no sort, ID relabelling or number coercion.
    return (json.dumps(value, allow_nan=False)+'\n').encode()


def frames_contract(frames, count):
    require(isinstance(frames,list) and len(frames)==count, 'Full frame list required')
    for i, frame in enumerate(frames,1):
        require(isinstance(frame,dict) and set(frame)=={'index','objects'} and type(frame['index']) is int
                and frame['index']==i and isinstance(frame['objects'],list), 'Dense strict frame schema required')
        ids = set()
        for obj in frame['objects']:
            require(isinstance(obj,dict) and set(obj)=={'bbox','confidence','class_id','object_id'}, 'Strict output schema required')
            require(type(obj['class_id']) is int and obj['class_id']==0 and isinstance(obj['object_id'],str)
                and re.fullmatch(r'bytetrack-(0|[1-9][0-9]*)',obj['object_id']) is not None
                and obj['object_id'] not in ids, 'Original person class and unique native IDs required')
            ids.add(obj['object_id']); box = obj['bbox']; confidence = obj['confidence']
            require(isinstance(box,list) and len(box)==4 and all(type(x) in (int,float) and math.isfinite(x) for x in box)
                and box[2]>box[0] and box[3]>box[1], 'Finite positive output box required')
            require(type(confidence) in (int,float) and math.isfinite(confidence) and 0<=confidence<=1, 'Finite output confidence required')
    return frames


def carrier_audit(original_bytes, native_bytes, video_sha256, count):
    original = strict_json(original_bytes); native = strict_json(native_bytes)
    require(isinstance(original,dict) and set(original)=={'format','session_id','sampling','tracker','source','frames'}, 'Exact Session carrier schema required')
    expected = {'format':'depthport.semantic-tracking.v1', 'session_id':'video-'+video_sha256[:24],
        'sampling':'dense_video', 'tracker':'bytetrack', 'source':'offline_video_fixed_detection_cache'}
    require({k:original[k] for k in expected}==expected, 'Derived immutable carrier metadata differs')
    old = frames_contract(original['frames'],count); new = frames_contract(native,count)
    old_payload = encoded(old); new_payload = encoded(new)
    restored = encoded(dict(expected, frames=new))
    result = {'whole_archive_bytes_equal':original_bytes==native_bytes,
        'ordered_payload_encoding_equal':old_payload==new_payload,
        'native_writer_encoding_exact':new_payload==native_bytes,
        'derived_carrier_reconstruction_exact':restored==original_bytes,
        'frames':count, 'observations':sum(len(f['objects']) for f in new),
        'metadata_contract_valid':True, 'payload_sha256':hashlib.sha256(new_payload).hexdigest(),
        'reconstructed_carrier_sha256':hashlib.sha256(restored).hexdigest(),
        'original_failure_changed':False, 'original_replication_changed':False}
    result['carrier_contract_compatible'] = all(result[k] for k in
        ('ordered_payload_encoding_equal','native_writer_encoding_exact','derived_carrier_reconstruction_exact'))
    raw = {'expected_metadata':expected, 'original_metadata':{k:original[k] for k in expected},
           'frames':[{'index':a['index'],'old_objects':a['objects'],'new_objects':b['objects'],
                      'ordered_encoding_equal':encoded(a)==encoded(b)} for a,b in zip(old,new)]}
    return result, raw


def state_mean(snapshot):
    field = snapshot['kf']['state']
    require(field['dtype']=='float64' and field['shape']==[8,1], 'Pinned state representation required')
    x = np.asarray(field['values'],dtype=np.float64)
    require(x.shape==(8,1) and np.all(np.isfinite(x))
        and hashlib.sha256(x.tobytes(order='C')).hexdigest()==field['bytes_sha256'], 'State array seal differs')
    return x[:,0]


class RoleAudit:
    """Inductive lifecycle/seed audit over an existing full source history."""
    def __init__(self):
        self.counts = Counter({k:0 for k in ROLE_COUNTS})
        self.native_counts = Counter({k:0 for k in COUNTS})
        self.rows = Counter({k:0 for k in GROUPS}); self.exposed = self.rows.copy()
        self.births = {}; self.states = {}; self.previous = []; self.accepted = set()

    def add(self, record):
        require(set(record)=={'lifecycle','numerical','geometry'}, 'Strict sealed trace root required')
        life, num, guard = (record[k] for k in ('lifecycle','numerical','geometry'))
        f = life['frame']; require(f==self.counts['frames']+1, 'Dense source history required')
        c, rows, exposed = frame_counts(life,num,guard)
        self.native_counts.update(c); self.rows.update(rows); self.exposed.update(exposed)
        self.counts['frames'] += 1
        require(life['before_update']==self.previous, 'Between-frame native lifecycle continuity differs')
        require(life['before_predict']==life['before_update'], 'Pre-predict native roles differ')
        pre = {s['token']:s for s in life['before_predict']}
        predicted = {s['token']:s for s in life['predicted']}
        post = {s['token']:s for s in life['before_lifecycle_prune']}
        after = {s['token']:s for s in life['after_update']}
        require(len(pre)==len(life['before_predict']) and list(predicted)==list(pre), 'Unique predicted ownership required')
        matched = [(stage,stage['tracks'][r]['token'],stage['detection_indices'][col])
                   for stage in life['stages'] for r,col in stage['matched']]
        require(len({token for _,token,_ in matched})==len(matched), 'At most one native accepted update per frame')
        ops = {(op['token'],op['operation']):op for op in num['operations']}
        expected = [(token,'predict') for token in pre]+[(token,'update') for _,token,_ in matched]
        require(len(ops)==len(num['operations']) and list(ops)==expected, 'Original operation ordering differs')
        by_guard = {r['token']:r for r in guard['rows']}; raw = []
        matched_by = {token:stage['name'] for stage,token,_ in matched}
        removed = {r['state']['token']:r for r in life['removals']}
        for token, before in pre.items():
            require(token in self.births and by_guard[token]['before']==self.states[token], 'Immutable seed/state continuity differs')
            grow = by_guard[token]; operation = ops[(token,'predict')]
            require(grow['projected']==operation['before'], 'Observed native predict prestate differs')
            require(predicted[token]['age']==before['age']+1 and predicted[token]['age_since_update']==before['age_since_update']+1,
                    'Original native clocks differ')
            require(np.array_equal(state_mean(operation['after'])[:4],predicted[token]['bbox']), 'Native predicted mean differs')
            require(grow['active']==(before['age_since_update']==0) and grow['confirmed']==(before['tracker_id']>=0), 'Recorded role definition differs')
            if before['tracker_id']==-1:
                seed = self.births[token]; x = state_mean(grow['before'])
                self.counts['tentative_prediction_rows'] += 1
                self.counts['tentative_active_pre'] += before['age_since_update']==0
                self.counts['tentative_retained_pre'] += before['age_since_update']>0
                zero = bool(np.array_equal(x[4:],np.zeros(4)))
                self.counts['tentative_zero_velocity_pre'] += zero
                require(f==seed['frame']+1 and token not in self.accepted and before['age']==0
                    and before['age_since_update']==0 and before['consecutive_updates']==1 and zero
                    and np.array_equal(x[:4],seed['bbox']), 'Birth-only tentative induction violated')
                require(x[2]>x[0] and x[3]>x[1] and np.array_equal(state_mean(operation['after']),x), 'Positive stationary seed predict differs')
                self.counts['tentative_candidate_rows'] += bool(grow['candidate_axes'])
                self.counts['tentative_applied_rows'] += grow['applied']
                require(not grow['candidate_axes'] and not grow['applied'] and grow['before']==grow['projected'], 'Birth-only seed must not trigger geometry projection')
                require(predicted[token]['tracker_id']==-1 and predicted[token]['age_since_update']==1
                    and predicted[token]['consecutive_updates']==1, 'Post-predict transient tentative differs')
                self.counts['tentative_after_predict_age_one'] += 1
                weak = next((s for s in life['stages'] if s['name']=='weak_remaining'),None)
                self.counts['tentative_weak_stage_rows'] += weak is not None and any(s['token']==token for s in weak['tracks'])
                if token in matched_by:
                    phase = matched_by[token]; require(phase in ('high_all','weak_remaining'), 'Native acceptance stage differs')
                    require(post[token]['tracker_id']>=0 and post[token]['age_since_update']==0
                        and post[token]['consecutive_updates']==2 and token in after, 'First high/weak update must immediately promote')
                    self.counts['tentative_'+('high' if phase=='high_all' else 'weak')+'_promotions'] += 1
                    outcome = 'promoted_'+phase
                else:
                    require(post[token]['tracker_id']==-1 and post[token]['age_since_update']==1
                        and post[token]['consecutive_updates']==1 and token not in after
                        and token in removed and removed[token]['reason']=='immature_unmatched', 'Unmatched tentative must prune in the same frame')
                    self.counts['tentative_unmatched_removed'] += 1; outcome = 'immature_unmatched'
                raw.append({'frame':f,'token':token,'birth_frame':seed['frame'],'pre':before,
                            'mean':x.tolist(),'post_predict':predicted[token],'post':post[token],'outcome':outcome})
            else:
                require(before['tracker_id']>=0 and post[token]['tracker_id']==before['tracker_id'], 'Native confirmed ID cannot revert or change')
            self.states[token] = operation['after']
        for stage, token, _ in matched:
            update = ops[(token,'update')]
            require(update['before']==self.states[token] and update['phase']==stage['name'], 'Original accepted update history differs')
            require(np.array_equal(state_mean(update['after'])[:4],post[token]['bbox']), 'Accepted posterior differs')
            self.states[token] = update['after']; self.accepted.add(token)
        require([b['state']['token'] for b in life['births']]==[b['token'] for b in num['births']], 'Complete birth ownership differs')
        for birth, internal in zip(life['births'],num['births']):
            state = birth['state']; token = state['token']; x = state_mean(internal['state'])
            require(token not in self.births and token not in pre and token not in self.states, 'Immutable birth token reused')
            require(birth['reason']=='unmatched_high_above_activation' and birth['detection_index'] in life['high_indices'], 'Only original unmatched-high seed allowed')
            require(state['tracker_id']==-1 and state['age']==0 and state['age_since_update']==0
                and state['consecutive_updates']==1 and token in after, 'Original tentative seed counters differ')
            require(np.array_equal(x[:4],state['bbox']) and np.array_equal(x[4:],np.zeros(4))
                and x[2]>x[0] and x[3]>x[1], 'Positive zero-velocity seed required')
            self.births[token] = {'frame':f,'bbox':state['bbox']}
            self.states[token] = internal['state']; self.counts['births'] += 1
            raw.append({'frame':f,'token':token,'phase':'birth','state':state,'mean':x.tolist()})
        for token, state in after.items():
            if state['tracker_id']==-1:
                require(self.births[token]['frame']==f and token not in self.accepted, 'Only current fresh births may survive unconfirmed')
                self.counts['end_frame_tentative_rows'] += 1
        self.previous = life['after_update']
        return raw

    def result(self):
        censored = [s for s in self.previous if s['tracker_id']==-1]
        self.counts['source_end_tentative_censored'] = len(censored)
        require(self.counts['births']==self.counts['tentative_prediction_rows']+len(censored), 'Every seed needs next-frame resolution or explicit end censoring')
        require(self.counts['tentative_prediction_rows']==self.counts['tentative_high_promotions']
            +self.counts['tentative_weak_promotions']+self.counts['tentative_unmatched_removed'], 'Complete tentative outcome partition required')
        return {'counts':dict(self.counts), 'original_native_counts':dict(self.native_counts),
                'original_projection_rows':dict(self.rows), 'original_exposed_frames':dict(self.exposed),
                'tentative_histories_observed':self.counts['tentative_prediction_rows']>0,
                'induction_checks_pass':True, 'empirical_projection_safety_accepted':False}, censored
