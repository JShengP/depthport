# SPDX-License-Identifier: AGPL-3.0-only
"""Post-hoc added-FN/IDSW contexts. No GT ever enters the tracking control.

Return raw cases separately from fixed-label aggregates. Cases, frame numbers,
identifiers and exact supporting deferral windows must remain local.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import math

from depthport.tracking_diagnostics import clear_trace, cache_index, box_ious, switch_context


def _cache_box(detection, scale):
    x, y, xx, yy = detection['bbox']
    return [x*scale+1, y*scale+1, (xx-x)*scale, (yy-y)*scale]


def _emitted(prediction, cache, scale):
    result = set()
    for frame in prediction['frames']:
        for obj in frame['objects']:
            key = (frame['index'], cache_index(_cache_box(obj, scale), obj['confidence'],
                cache['frames'][frame['index']-1]['detections'], scale))
            if key in result:
                raise ValueError('Duplicate emitted cache detection')
            result.add(key)
    return result


def _summary(cases, signals):
    result = {'total': len(cases),
              'categories': dict(sorted(Counter(c['category'] for c in cases).items())),
              'signals': {name: sum(bool(c[name]) for c in cases) for name in signals}}
    if cases and 'raw_support' in cases[0]:
        result['raw_support'] = dict(sorted(Counter(c['raw_support'] for c in cases).items()))
    return result


def analyse_added_errors(reference, candidate, rows, events, cache, scale,
                         candidate_prediction, candidate_frames, assign=None):
    """Immutable locations only; native IDs are never compared between arms.

    Reference-detection retention is not a causal attribution. Temporal proximity
    to a geometrically supporting deferral may overlap and is not ownership.
    """
    old = clear_trace(reference, assign); new = clear_trace(candidate, assign)
    ids = sorted({r['id'] for r in rows})
    lookup = {(r['frame'], r['id']): r for r in rows}
    by_frame = defaultdict(list)
    for row in rows:
        by_frame[row['frame']].append(row)
    emitted = _emitted(candidate_prediction, cache, scale)
    frames = {f['frame']: f for f in candidate_frames}
    if set(frames) != set(range(1, len(cache['frames'])+1)):
        raise ValueError('Dense candidate diagnostics required')
    deferred = set(); supported = defaultdict(list)
    for f, trace in frames.items():
        for edge in trace.get('deferred', []):
            stage = trace['stages'][1]
            index = stage['detection_indices'][edge['column']]
            if (f, index) in emitted or [edge['row'], edge['column']] in stage['matched']:
                raise ValueError('Deferred detection was still matched/emitted')
            deferred.add((f, index))
            box = _cache_box(cache['frames'][f-1]['detections'][index], scale)
            for row in by_frame[f]:
                if box_ious(row['bbox'], [box])[0] >= .5:
                    supported[row['id']].append(f)

    def context(f, gt):
        target = lookup[(f, ids[gt])]
        boxes = [_cache_box(d, scale) for d in cache['frames'][f-1]['detections']]
        overlaps = box_ious(target['bbox'], boxes)
        supported_dets = [i for i, value in enumerate(overlaps) if value >= .5]
        raw_support = ('strong' if any(cache['frames'][f-1]['detections'][i]['confidence'] >= .6
                                      for i in supported_dets) else 'weak_only' if supported_dets else 'none')
        return {'low_visibility': target['visibility'] <= .3,
                'current_gt_overlap': any(box_ious(target['bbox'], [r['bbox']])[0] >= .1
                    for r in by_frame[f] if r['id'] != target['id']),
                'near_crossing_event': any(target['id'] in e['ids'] and
                    e['start']-math.ceil(cache['fps']*.5) <= f <= e['end']+math.ceil(cache['fps']*.5)
                    for e in events['overlap_order_exchange']),
                'supporting_deferral_within_1s': any(0 <= f-t <= math.ceil(cache['fps'])
                    for t in supported[target['id']]), 'raw_support': raw_support}

    old_fn = {(f, int(g)) for f, (gids, matches) in
              enumerate(zip(reference['gt_ids'], old['matches']), 1) for g in gids if int(g) not in matches}
    new_fn = {(f, int(g)) for f, (gids, matches) in
              enumerate(zip(candidate['gt_ids'], new['matches']), 1) for g in gids if int(g) not in matches}
    fn = []
    for f, gt in sorted(new_fn-old_fn):
        matched = old['matches'][f-1][gt]; col = matched['col']
        index = cache_index(reference['tracker_dets'][f-1][col], reference['tracker_confidences'][f-1][col],
                            cache['frames'][f-1]['detections'], scale)
        key = (f, index)
        category = ('direct_current_deferral' if key in deferred else
                    'reference_detection_still_emitted' if key in emitted else
                    'reference_detection_not_emitted_without_current_deferral')
        fn.append({'frame': f, 'gt': gt, 'reference_detection_index': index,
                   'category': category, **context(f, gt)})

    old_switches = {(c['frame'], c['gt']) for c in old['switches']}
    switches = []
    for case in new['switches']:
        f, gt = case['frame'], case['gt']
        if (f, gt) in old_switches:
            continue
        details = switch_context(case, candidate, ids, rows, events, cache, scale)
        reference_match = old['matches'][f-1].get(gt)
        index = cache_index(candidate['tracker_dets'][f-1][case['col']],
            candidate['tracker_confidences'][f-1][case['col']], cache['frames'][f-1]['detections'], scale)
        ref_index = (cache_index(reference['tracker_dets'][f-1][reference_match['col']],
            reference['tracker_confidences'][f-1][reference_match['col']],
            cache['frames'][f-1]['detections'], scale) if reference_match else None)
        switches.append({**details, **context(f, gt),
            'reference_unmatched_at_switch': reference_match is None,
            'same_input_detection_as_reference': index == ref_index,
            'same_frame_has_any_deferral': bool(frames[f].get('deferred'))})
    fn_signals = ('low_visibility', 'current_gt_overlap', 'near_crossing_event', 'supporting_deferral_within_1s')
    switch_signals = fn_signals + ('reference_unmatched_at_switch', 'same_input_detection_as_reference',
        'same_frame_has_any_deferral', 'gap_has_no_raw_overlap', 'gap_has_partial_raw_overlap',
        'visible_gap_missing_raw_box', 'low_visibility_gap_missing_raw_box')
    # Group temporally contiguous added misses by GT within THIS sequence only.
    episodes = []
    for gt in sorted({c['gt'] for c in fn}):
        previous = None
        for case in (c for c in fn if c['gt'] == gt):
            if previous is None or case['frame'] != previous+1:
                episodes.append(0)
            episodes[-1] += 1; previous = case['frame']
    summary = {'added_fn': _summary(fn, fn_signals), 'added_idsw': _summary(switches, switch_signals),
               'added_fn_episodes': {'count': len(episodes), 'max_frames': max(episodes, default=0)}}
    return summary, {'added_fn': fn, 'added_idsw': switches}
