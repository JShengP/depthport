# SPDX-License-Identifier: AGPL-3.0-only
"""Fixed aggregate-only lifecycle counters; per-row geometry stays local."""
from collections import Counter
import numpy as np
from depthport.tracking_lifecycle_probe import require

COUNT_KEYS = ('frames','inputs','high_inputs','weak_inputs','weak_input_frames','birth_candidates','births',
    'births_rejected_activation','confirmed_promotions','high_updates','weak_updates','weak_confirmed_updates',
    'missed_rows','missed_rows_with_weak_input','missed_rows_without_weak_input',
    'missed_weak_rows_gate_supported','missed_weak_rows_zero_overlap','missed_weak_rows_positive_below_gate',
    'missed_weak_rows_invalid_prediction','missed_weak_rows_without_last_accepted_update',
    'missed_weak_rows_prediction_better','missed_weak_rows_prediction_equal','missed_weak_rows_prediction_worse',
    'missed_weak_rows_last_update_gate_supported','missed_weak_rows_best_horizontal_disjoint',
    'missed_weak_rows_best_vertical_disjoint','weak_frames_with_remaining_rows',
    'weak_frames_all_rows_consumed_high','weak_frames_no_hypothesis_never_born',
    'weak_frames_no_hypothesis_after_removal','removed_expired','removed_immature_unmatched',
    'removed_expired_and_immature','expired_confirmed','expired_unconfirmed',
    'removed_with_weak_input','retained_at_source_end','confirmed_at_source_end',
    'stage_geometry_checks','old_stage_checks','no_association_frames')


class UpstreamLedger:
    def __init__(self):
        self.counts = Counter({k:0 for k in COUNT_KEYS})
        self.accepted = {}
        self.births = 0
        self.removal_ages = Counter()
        self.expiry_last_update_gap = Counter()

    def add(self, trace, old, iou, local_rows):
        c = self.counts; c['frames'] += 1
        boxes = np.array(trace['input_boxes'],dtype=np.float32).reshape(-1,4)
        weak = trace['weak_indices']; c['inputs'] += len(boxes)
        c['high_inputs'] += len(trace['high_indices']); c['weak_inputs'] += len(weak)
        c['weak_input_frames'] += bool(weak)
        require(trace['frame'] == old['frame'] and len(trace['stages']) == len(old['stages']), 'Old trace frame/stages differ')
        if not trace['stages']:
            c['no_association_frames'] += 1
        for stage, prior in zip(trace['stages'],old['stages']):
            for key in ('name','gate','detection_indices','similarity','matched','unmatched_rows','unmatched_columns'):
                require(stage[key] == prior[key], 'Original association differs: '+key)
            require(len(stage['tracks']) == len(prior['tracks']), 'Original row count differs')
            for state, before in zip(stage['tracks'],prior['tracks']):
                for key in ('token','tracker_id','age_since_update','consecutive_updates'):
                    require(state[key] == before[key], 'Original ownership/state differs: '+key)
            c['old_stage_checks'] += 1
            predicted = np.array([s['bbox'] for s in stage['tracks']]).reshape(-1,4)
            recomputed = iou.compute(predicted, boxes[stage['detection_indices']])
            similarity = np.array(stage['similarity']).reshape(len(predicted),len(stage['detection_indices']))
            require(np.array_equal(recomputed,similarity), 'Recorded prediction geometry does not reproduce native IoU')
            c['stage_geometry_checks'] += 1
            if stage['name'] == 'weak_remaining':
                if weak:
                    if stage['tracks']:
                        c['weak_frames_with_remaining_rows'] += 1
                    elif trace['after_budget_prune']:
                        c['weak_frames_all_rows_consumed_high'] += 1
                    else:
                        c['weak_frames_no_hypothesis_never_born' if not self.births else
                          'weak_frames_no_hypothesis_after_removal'] += 1
                for row,state in enumerate(stage['tracks']):
                    if state['tracker_id'] < 0 or state['age_since_update'] < 2:
                        continue
                    c['missed_rows'] += 1
                    if not weak:
                        c['missed_rows_without_weak_input'] += 1; continue
                    c['missed_rows_with_weak_input'] += 1
                    values = similarity[row]; best = int(np.argmax(values)); score = float(values[best])
                    box = np.array(state['bbox']); det = boxes[weak[best]]
                    valid = bool(box[2] > box[0] and box[3] > box[1])
                    c['missed_weak_rows_invalid_prediction'] += not valid
                    c['missed_weak_rows_gate_supported'] += score >= stage['gate']
                    c['missed_weak_rows_zero_overlap'] += score == 0
                    c['missed_weak_rows_positive_below_gate'] += 0 < score < stage['gate']
                    horizontal = bool(box[2] <= det[0] or det[2] <= box[0])
                    vertical = bool(box[3] <= det[1] or det[3] <= box[1])
                    c['missed_weak_rows_best_horizontal_disjoint'] += horizontal
                    c['missed_weak_rows_best_vertical_disjoint'] += vertical
                    past = self.accepted.get(state['token'])
                    last_score = None
                    if past is None:
                        c['missed_weak_rows_without_last_accepted_update'] += 1
                    else:
                        last_score = float(np.max(iou.compute(np.array([past['bbox']],dtype=np.float32),boxes[weak])))
                        c['missed_weak_rows_last_update_gate_supported'] += last_score >= stage['gate']
                        c['missed_weak_rows_prediction_better' if score > last_score else
                          'missed_weak_rows_prediction_equal' if score == last_score else
                          'missed_weak_rows_prediction_worse'] += 1
                    local_rows.append({'frame':trace['frame'],'token':state['token'],'state':state,
                        'best_cache_index':weak[best],'best_similarity':score,'best_box':det.tolist(),
                        'last_accepted_update':past,'last_update_best_similarity':last_score,
                        'horizontal_disjoint':horizontal,'vertical_disjoint':vertical})
            # Update in exact high-then-weak order, only after pre-decision diagnosis.
            for row,col in stage['matched']:
                state = stage['tracks'][row]; index = stage['detection_indices'][col]
                c['high_updates' if stage['name']=='high_all' else 'weak_updates'] += 1
                c['weak_confirmed_updates'] += stage['name']=='weak_remaining' and state['tracker_id']>=0
                self.accepted[state['token']] = {'frame':trace['frame'],'detection_index':index,'bbox':boxes[index].tolist()}
        c['birth_candidates'] += len(trace['birth_candidates']); c['births'] += len(trace['births'])
        c['births_rejected_activation'] += sum(not x['eligible'] for x in trace['birth_candidates'])
        self.births += len(trace['births'])
        before = {s['token']:s for stage in trace['stages'] for s in stage['tracks']}
        for state in trace['after_update']:
            previous = before.get(state['token'])
            c['confirmed_promotions'] += bool(previous and previous['tracker_id']<0<=state['tracker_id'])
        for removal in trace['removals']:
            state = removal['state']; reason = removal['reason']
            c['removed_'+reason] += 1
            c['removed_with_weak_input'] += bool(weak)
            self.removal_ages[reason+':'+str(int(state['age_since_update']))] += 1
            if 'expired' in reason:
                c['expired_confirmed' if state['tracker_id']>=0 else 'expired_unconfirmed'] += 1
                last = self.accepted.get(state['token'])
                self.expiry_last_update_gap['missing' if last is None else str(trace['frame']-last['frame'])] += 1
        c['retained_at_source_end'] = len(trace['after_update'])
        c['confirmed_at_source_end'] = sum(s['tracker_id']>=0 for s in trace['after_update'])

    def result(self):
        require(set(self.counts)==set(COUNT_KEYS),'Aggregate counter whitelist differs')
        return {'counts':dict(self.counts),'removal_age_histogram':dict(sorted(self.removal_ages.items())),
                'expiry_last_update_gap_histogram':dict(sorted(self.expiry_last_update_gap.items()))}
