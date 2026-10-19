# SPDX-License-Identifier: AGPL-3.0-only
"""Bounded, model-free evaluation of saved tracking reports against manual GT.

This is an experimental frame-level diagnostic, NOT TrackEval/CLEAR/HOTA or
an online tracking runtime. Nothing is uploaded and no model is executed.
"""
from __future__ import annotations

import math
from collections import defaultdict

GT_FORMAT = 'depthport.tracking-ground-truth.v1'
PRED_FORMAT = 'depthport.semantic-tracking.v1'
EVAL_FORMAT = 'depthport.tracking-evaluation.v1'
MAX_FRAMES = 24
MAX_ANNOTATIONS_PER_FRAME = 64
MAX_PREDICTIONS_PER_FRAME = 64
VALID_TAGS = frozenset({'normal', 'entry_exit', 'occlusion', 'crossing', 'fast_motion',
                        'low_confidence', 'lighting_change', 'camera_motion'})


class TrackingEvaluationError(ValueError):
    """Invalid manual annotation or incompatible tracking report."""


def _box(value, *, name):
    if not isinstance(value, (list, tuple)) or len(value) != 4 or any(
        type(q) not in (float, int) or not math.isfinite(q) for q in value
    ):
        raise TrackingEvaluationError(f'{name}: bbox must have four finite numbers')
    x0, y0, x1, y1 = map(float, value)
    if not x0 < x1 or not y0 < y1 or x0 < 0 or y0 < 0:
        raise TrackingEvaluationError(f'{name}: bbox must be positive and ordered')
    return [x0, y0, x1, y1]


def _class_id(value, *, name):
    if type(value) is not int or value < 0 or value > 10000:
        raise TrackingEvaluationError(f'{name}: class_id must be nonnegative integer')
    return value


def _tags(value, *, name):
    if not isinstance(value, list) or len(value) > len(VALID_TAGS) or any(
        not isinstance(q, str) or q not in VALID_TAGS for q in value
    ):
        raise TrackingEvaluationError(f'{name}: unsupported or invalid scenario tags')
    return sorted(set(value))


def _iou(a, b):
    x0 = max(a[0], b[0]); y0 = max(a[1], b[1])
    x1 = min(a[2], b[2]); y1 = min(a[3], b[3])
    inter = max(0., x1-x0) * max(0., y1-y0)
    area_a = (a[2]-a[0]) * (a[3]-a[1])
    area_b = (b[2]-b[0]) * (b[3]-b[1])
    denom = area_a + area_b - inter
    return inter / denom if denom else 0.


def _assignment(costs):
    """Rectangular min-cost Hungarian assignment, rows <= columns (stdlib)."""
    rows = len(costs)
    if rows == 0:
        return []
    cols = len(costs[0])
    if cols < rows or any(len(row) != cols for row in costs):
        raise TrackingEvaluationError('Invalid assignment cost shape')
    u = [0.] * (rows+1); v = [0.] * (cols+1)
    p = [0] * (cols+1); way = [0] * (cols+1)
    for i in range(1, rows+1):
        p[0] = i; j0 = 0; best = [math.inf]*(cols+1); used = [False]*(cols+1)
        while True:
            used[j0] = True
            i0 = p[j0]; delta = math.inf; j1 = 0
            for j in range(1, cols+1):
                if used[j]:
                    continue
                cur = costs[i0-1][j-1] - u[i0] - v[j]
                if cur < best[j]:
                    best[j] = cur; way[j] = j0
                if best[j] < delta:
                    delta = best[j]; j1 = j
            for j in range(cols+1):
                if used[j]:
                    u[p[j]] += delta; v[j] -= delta
                else:
                    best[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]; p[j0] = p[j1]; j0 = j1
            if j0 == 0:
                break
    result = [-1] * rows
    for j in range(1, cols+1):
        if p[j]:
            result[p[j]-1] = j-1
    return result


def _match(truth, preds, threshold):
    """Optimal IoU assignment against dummy unmatched slots, class-gated."""
    n, m = len(truth), len(preds)
    if not n:
        return []
    cost = []
    for t in truth:
        line = []
        for p in preds:
            overlap = _iou(t['bbox'], p['bbox']) if t['class_id'] == p['class_id'] else 0.
            line.append(1. - overlap if overlap >= threshold else 2.)
        line.extend([1.] * n)  # unmatched GT costs 1
        cost.append(line)
    assigned = _assignment(cost)
    return [(i, j, _iou(truth[i]['bbox'], preds[j]['bbox']))
            for i, j in enumerate(assigned) if j < m and cost[i][j] < 1.]


def _ratio(a, b):
    return round(a / b, 6) if b else None


def _scores(c):
    tp, fp, fn = c['tp'], c['fp'], c['fn']
    p = _ratio(tp, tp+fp); r = _ratio(tp, tp+fn)
    f1 = round(2*p*r/(p+r), 6) if p is not None and r is not None and p+r else (0. if p is not None and r is not None else None)
    return {**c, 'precision': p, 'recall': r, 'f1': f1}


def _counter():
    return {'tp': 0, 'fp': 0, 'fn': 0, 'id_switches': 0, 'fragmentations': 0}


def evaluate(tracking_report: dict, ground_truth: dict, *, iou_threshold: float = 0.5,
             max_frames: int = MAX_FRAMES) -> dict:
    """Evaluate indexed saved frames with visible, manually annotated objects.

    GT with evaluated=false is explicitly excluded (uncertain/full occlusion);
    a GT ID which reappears is linked to its last matched predicted ID.
    GT absent in an *evaluated* frame is NOT automatically an ignored object.
    """
    if type(max_frames) is not int or not 1 <= max_frames <= 1800:
        raise TrackingEvaluationError('Invalid evaluation max_frames cap')
    if (not isinstance(iou_threshold, (int, float)) or type(iou_threshold) is bool or
        not math.isfinite(iou_threshold) or not 0 < iou_threshold <= 1):
        raise TrackingEvaluationError('IoU threshold must be finite and in (0,1]')
    if not isinstance(tracking_report, dict) or tracking_report.get('format') != PRED_FORMAT:
        raise TrackingEvaluationError('Unsupported tracking report format')
    if not isinstance(ground_truth, dict) or ground_truth.get('format') != GT_FORMAT:
        raise TrackingEvaluationError('Unsupported ground-truth format')
    if (tracking_report.get('session_id') != ground_truth.get('session_id') or
        not isinstance(tracking_report.get('session_id'), str)):
        raise TrackingEvaluationError('Ground truth session ID must match tracking report')
    raw_predictions = tracking_report.get('frames')
    raw_gt = ground_truth.get('frames')
    if not isinstance(raw_predictions, list) or not 1 <= len(raw_predictions) <= max_frames:
        raise TrackingEvaluationError(f'Tracking report needs 1..{max_frames} frames')
    if not isinstance(raw_gt, list) or not 1 <= len(raw_gt) <= max_frames:
        raise TrackingEvaluationError(f'Ground truth needs 1..{max_frames} indexed frames')
    sampling = ground_truth.get('sampling', 'unspecified')
    if sampling not in ('unspecified', 'manual_sparse', 'dense_video',
                        'synthetic_example_not_real_video'):
        raise TrackingEvaluationError('Unknown ground truth sampling protocol')
    pred_by_index = {}
    for i, frame in enumerate(raw_predictions):
        if not isinstance(frame, dict) or type(frame.get('index')) is not int or frame['index'] < 1:
            raise TrackingEvaluationError('Invalid saved tracking frame index')
        idx = frame['index']
        if idx in pred_by_index:
            raise TrackingEvaluationError('Duplicate tracking frame index')
        objects = frame.get('objects')
        if not isinstance(objects, list) or len(objects) > MAX_PREDICTIONS_PER_FRAME:
            raise TrackingEvaluationError('Tracking frame has invalid prediction count')
        seen = set(); cleaned = []
        for j, p in enumerate(objects):
            if not isinstance(p, dict):
                raise TrackingEvaluationError('Invalid predicted object')
            oid = p.get('object_id')
            if not isinstance(oid, str) or not 1 <= len(oid) <= 80:
                raise TrackingEvaluationError('Predicted object must have ID')
            if oid in seen:
                raise TrackingEvaluationError('Duplicate predicted object ID in frame')
            seen.add(oid)
            cleaned.append({'object_id': oid, 'class_id': _class_id(p.get('class_id'),name='pred'),
                            'bbox': _box(p.get('bbox'),name='pred')})
        pred_by_index[idx] = cleaned
    annotated = {}; evaluated = 0; skipped = 0
    global_class_by_gt_id = {}
    for frame in raw_gt:
        if not isinstance(frame, dict) or type(frame.get('index')) is not int:
            raise TrackingEvaluationError('Invalid GT frame index')
        idx = frame['index']
        if idx in annotated or idx not in pred_by_index:
            raise TrackingEvaluationError('GT frame index is duplicated or not in tracking report')
        tags = _tags(frame.get('tags',[]),name='frame')
        to_evaluate = frame.get('evaluated', True)
        if type(to_evaluate) is not bool:
            raise TrackingEvaluationError('Frame evaluated must be boolean')
        items = frame.get('objects')
        if not isinstance(items, list) or len(items) > MAX_ANNOTATIONS_PER_FRAME:
            raise TrackingEvaluationError('GT must have an objects list (<=64)')
        truth = []; ids = set()
        for item in items:
            if not isinstance(item, dict):
                raise TrackingEvaluationError('Invalid ground-truth object')
            gid = item.get('gt_id')
            if not isinstance(gid, str) or not 1 <= len(gid) <= 80 or gid in ids:
                raise TrackingEvaluationError('Invalid/duplicate GT ID within frame')
            ids.add(gid)
            cls = _class_id(item.get('class_id'),name='gt')
            if gid in global_class_by_gt_id and global_class_by_gt_id[gid] != cls:
                raise TrackingEvaluationError('One GT ID may not change class across frames')
            global_class_by_gt_id[gid] = cls
            truth.append({'gt_id':gid, 'class_id':cls,
                          'bbox':_box(item.get('bbox'),name='gt'),
                          'tags':_tags(item.get('tags',[]),name='object')})
        annotated[idx] = {'gt':truth,'tags':tags,'evaluated':to_evaluate}
        if to_evaluate:
            evaluated += 1
        else:
            skipped += 1
    if not evaluated:
        raise TrackingEvaluationError('No evaluated ground-truth frames')

    counts = _counter()
    scenario = defaultdict(_counter)
    events = []
    previous_id = {}       # GT -> last matched prediction ID
    previous_visible_match = {}  # GT -> matched in last visible annotated occurrence
    per_frame = []
    # Temporal identity metrics require chronological session frame ordering.
    for idx in sorted(annotated):
        ann = annotated[idx]
        if not ann['evaluated']:
            continue
        gt, preds = ann['gt'], pred_by_index[idx]
        matches = _match(gt, preds, iou_threshold)
        matched_gt = {g for g,_,_ in matches}; matched_pred = {p for _,p,_ in matches}
        c = _counter(); c.update(tp=len(matches),fp=len(preds)-len(matched_pred),fn=len(gt)-len(matched_gt))
        for j, t in enumerate(gt):
            tag_set = set(ann['tags']) | set(t['tags'])
            for tag in tag_set:
                scenario[tag]['tp' if j in matched_gt else 'fn'] += 1
            if j not in matched_gt:
                if len(events) < 300:
                    events.append({'kind':'fn','frame_index':idx,'gt_id':t['gt_id'],'tags':sorted(tag_set)})
                previous_visible_match[t['gt_id']] = False
        for gi, pi, iou in matches:
            g, p = gt[gi], preds[pi]
            gid, pid = g['gt_id'], p['object_id']
            tag_set = set(ann['tags']) | set(g['tags'])
            if gid in previous_id and previous_id[gid] != pid:
                c['id_switches'] += 1
                for tag in tag_set:
                    scenario[tag]['id_switches'] += 1
                if len(events) < 300:
                    events.append({'kind':'id_switch','frame_index':idx,'gt_id':gid,
                                   'previous_object_id':previous_id[gid],
                                   'object_id':pid,'tags':sorted(tag_set)})
            if gid in previous_visible_match and not previous_visible_match[gid]:
                c['fragmentations'] += 1
                for tag in tag_set:
                    scenario[tag]['fragmentations'] += 1
            previous_id[gid] = pid
            previous_visible_match[gid] = True
        for pi,p in enumerate(preds):
            if pi not in matched_pred:
                if len(events) < 300:
                    events.append({'kind':'fp','frame_index':idx,'object_id':p['object_id'],
                                   'tags':ann['tags']})
                for tag in ann['tags']:
                    scenario[tag]['fp'] += 1
        for k in counts:
            counts[k] += c[k]
        per_frame.append({'index':idx,'tags':ann['tags'],**_scores(c)})
    summary = _scores(counts)
    return {'format':EVAL_FORMAT,'tracking_report_format':PRED_FORMAT,
            'ground_truth_format':GT_FORMAT,'session_id':tracking_report['session_id'],
            'iou_threshold':float(iou_threshold),'sampling_protocol_declared':sampling,
            'annotation_frames':len(annotated),'evaluated_frames':evaluated,'skipped_frames':skipped,
            'ground_truth_instances':counts['tp']+counts['fn'],
            'summary':summary, 'by_scenario':{k:_scores(v) for k,v in sorted(scenario.items())},
            'per_frame':per_frame,'events':events,
            'metric_note':'Experimental per-frame class-gated optimal IoU assignment; not official CLEAR MOT, IDF1 or HOTA. '
                          'ID switches compare last matched predicted ID for the same manually labeled GT ID; '
                          'fragmentation counts visible GT unmatched then rematched. '
                          'Fully occluded/unassessable frames should be tagged evaluated=false; they are excluded. '
                          'Use dense sequential annotated frames for tracker comparison. '
                          '2D tracking quality is NOT metric 3D accuracy; camera XYZ is not a world trajectory.'}
