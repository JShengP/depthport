# SPDX-License-Identifier: AGPL-3.0-only
"""GT-free actual-projection exposure strata; no quality-based selection."""
from collections import Counter
from depthport.tracking_lifecycle_probe import require
from depthport.tracking_geometry_validation import COUNTS, positive

ROLES = ('active_confirmed', 'active_tentative', 'retained_confirmed', 'retained_tentative')
GROUPS = (*ROLES, 'active', 'retained', 'unconfirmed', 'any')


def frame_counts(trace, numerical, guard):
    require(trace['frame'] == numerical['frame'] == guard['frame'], 'Aligned histories required')
    require([r['token'] for r in guard['rows']] == [s['token'] for s in trace['before_predict']], 'Ownership differs')
    c = Counter({k: 0 for k in COUNTS})
    c.update(frames=1, births=len(trace['births']), predictions=len(trace['predicted']),
             nonpositive_predictions=sum(not positive(s['bbox']) for s in trace['predicted']),
             shadow_operations=len(numerical['operations']))
    post = {s['token']: s for s in trace['before_lifecycle_prune']}
    for stage in trace['stages']:
        phase = 'high' if stage['name'] == 'high_all' else 'weak'
        for r, _ in stage['matched']:
            state = post[stage['tracks'][r]['token']]
            c['accepted_'+phase] += 1
            c['confirmed_observations'] += state['tracker_id'] >= 0
            c['nonpositive_accepted_posteriors'] += not positive(state['bbox'])
    for op in numerical['operations']:
        c['numerical_failures'] += sum(not ok for ok in op['checks'].values())
    for row in guard['rows']:
        c['nonpositive_pre_predict'] += not row['prepositive']
        c['candidate_rows'] += bool(row['candidate_axes'])
        if row['applied']:
            require(row['candidate_axes'] and row['prepositive'], 'Actual valid projection required')
            c['applied_rows'] += 1
            c['applied_axes'] += len(row['candidate_axes'])
            c[('active' if row['active'] else 'retained')+('_confirmed' if row['confirmed'] else '_tentative')] += 1
    rows = {k: c[k] for k in ROLES}
    rows.update(active=c['active_confirmed']+c['active_tentative'],
                retained=c['retained_confirmed']+c['retained_tentative'],
                unconfirmed=c['active_tentative']+c['retained_tentative'], any=c['applied_rows'])
    require(sum(c[k] for k in ROLES) == c['applied_rows'], 'Role partition differs')
    return dict(c), rows, {k: int(v > 0) for k, v in rows.items()}


def eligible(record, group):
    if record['status'] != 'completed':
        return False
    v = record['projection']
    return bool(record['repeat_equal'] and record['native_reference_equal']
                and record['source_lock']['capped_frames'] == 0
                and v['counts']['frames'] == record['frames']
                and v['counts']['numerical_failures'] == 0
                and v['counts']['nonpositive_predictions'] == 0
                and v['counts']['nonpositive_accepted_posteriors'] == 0
                and v['rows'][group] > 0 and v['exposed_frames'][group] > 0)


def select(ledger, order):
    require([r['name'] for r in ledger] == order and len(set(order)) == len(order), 'Complete unique ordered ledger required')
    require(all(r['phase'] == 'discovery' for r in ledger), 'Confirmation cannot select discovery')
    return {g: next((r['name'] for r in ledger if eligible(r, g)), None) for g in GROUPS}


def confirm(discovery, ledger):
    require(all(r['phase'] == 'confirmation' for r in ledger), 'Reserved phase required')
    complete = discovery['all_scheduled_completed'] and all(r['status'] == 'completed' for r in ledger)
    return {g: {'discovery_selection': discovery['selection'][g],
                'exposed_reserved_sources': [r['name'] for r in ledger if eligible(r, g)],
                'replicated_in_both_reserved': bool(complete and len(ledger) == 2
                    and discovery['selection'][g] is not None and all(eligible(r, g) for r in ledger))}
            for g in GROUPS}
