# SPDX-License-Identifier: AGPL-3.0-only
"""Opt-in benchmark birth veto; upstream association/weak continuation stay intact.

The hook targets Roboflow trackers 2.6.1 only. It is not used by the Session
worker or application defaults, and does not use annotations or evaluator IDs.
"""
from __future__ import annotations

from depthport.tracking import _iou


def admission_configurations():
    """Frozen factorial controls around the prior activation-only candidate."""
    common = {'track_activation_threshold': .3, 'high_conf_det_threshold': .6,
              'lost_track_buffer': 30, 'minimum_consecutive_frames': 2}
    profiles = {
        'default': {**common, 'track_activation_threshold': .7},
        'activation_control': dict(common),
        'confirm3': {**common, 'minimum_consecutive_frames': 3},
        'confirm5': {**common, 'minimum_consecutive_frames': 5},
        'competition': {**common, 'birth_competition_iou': .5},
        'confirm3_competition': {**common, 'minimum_consecutive_frames': 3,
                                 'birth_competition_iou': .5},
    }
    return {backend + '__' + name: {'backend': backend, 'profile': name,
                                   'parameters': dict(params)}
            for name, params in profiles.items() for backend in ('bytetrack', 'botsort')}


def admission_error_locations(data, cache, scale):
    """Private pairing keys; caller must reconcile counts with official CLEAR."""
    from depthport.tracking_diagnostics import clear_trace, cache_index
    trace = clear_trace(data)
    fp = set()
    for case in trace['false_positives']:
        f, col = case['frame'], case['col']
        index = cache_index(data['tracker_dets'][f-1][col],
                            data['tracker_confidences'][f-1][col],
                            cache['frames'][f-1]['detections'], scale)
        fp.add((f, index))
    fn = {(f, int(g)) for f, (gids, matched) in
          enumerate(zip(data['gt_ids'], trace['matches']), 1) for g in gids if int(g) not in matched}
    switches = {(c['frame'], c['gt']) for c in trace['switches']}
    locations = {'FP': fp, 'FN': fn, 'IDSW': switches}
    for kind, field in [('FP', 'CLR_FP'), ('FN', 'CLR_FN'), ('IDSW', 'IDSW')]:
        if len(locations[kind]) != trace['summary'][field]:
            raise ValueError('Non-unique error location')
    return locations, trace['summary']


def paired_error_counts(reference, candidate):
    return {kind: {'added': len(candidate[kind] - reference[kind]),
                   'removed': len(reference[kind] - candidate[kind]),
                   'shared': len(candidate[kind] & reference[kind]),
                   'net_change': len(candidate[kind]) - len(reference[kind])}
            for kind in ('FP', 'FN', 'IDSW')}


class BirthCompetitionMixin:
    def __init__(self, *args, birth_competition_iou, **kwargs):
        super().__init__(*args, **kwargs)
        self.birth_competition_iou = birth_competition_iou
        self.birth_admission_counts = {
            'eligible_births': 0, 'vetoed_matched_track': 0,
            'vetoed_unmatched_retained_track': 0,
        }

    def _spawn_new_tracks(self, detection_boxes, confidences, unmatched_high_local,
                          high_indices, out_det_indices, out_tracker_ids, **kwargs):
        # Called AFTER upstream high/low (and BoT-SORT unconfirmed) association.
        # Confirmed retained tracks already have their current-frame CMC applied.
        # Do not include new tentative births in the competitor set this frame.
        competitors = [(t.get_state_bbox(), t.time_since_update == 0)
                       for t in self.tracks if t.tracker_id >= 0]
        for local_index in unmatched_high_local:
            index = int(high_indices[local_index])
            eligible = float(confidences[index]) >= self.track_activation_threshold
            if eligible:
                self.birth_admission_counts['eligible_births'] += 1
                overlaps = [(float(_iou(detection_boxes[index], box)), matched)
                            for box, matched in competitors]
                # Prefer matched competitors on equal overlaps; input-order stable.
                best = max(overlaps, default=(0., False))
                if best[0] >= self.birth_competition_iou:
                    key = ('vetoed_matched_track' if best[1]
                           else 'vetoed_unmatched_retained_track')
                    self.birth_admission_counts[key] += 1
                    out_det_indices.append(index)
                    out_tracker_ids.append(-1)
                    continue
            # One candidate at a time retains upstream detection-output order.
            super()._spawn_new_tracks(detection_boxes, confidences, [local_index],
                                     high_indices, out_det_indices, out_tracker_ids,
                                     **kwargs)


def competition_tracker_class(upstream_class):
    """Local subclass, never a global monkeypatch or vendored upstream update."""
    return type('BirthControlled' + upstream_class.__name__,
                (BirthCompetitionMixin, upstream_class),
                # Do not replace upstream CLI registry entries or expose tuning.
                {'tracker_id': None, 'search_space': {}})
