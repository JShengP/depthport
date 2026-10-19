# SPDX-License-Identifier: AGPL-3.0-only
"""Independent whole-matrix maximize-then-gate reconstruction. No GT/control."""
from collections import Counter
import numpy as np
from depthport.tracking_lifecycle_probe import require


def solve(matrix,gate):
    from scipy.optimize import linear_sum_assignment
    rows,cols=linear_sum_assignment(matrix,maximize=True)
    raw=list(zip(rows.tolist(),cols.tolist()))
    accepted=[(r,c) for r,c in raw if matrix[r,c]>=gate]
    return raw,accepted


def forced(matrix,row,col):
    """Full-cardinality one-to-one alternative, not installed in tracking."""
    from scipy.optimize import linear_sum_assignment
    rr=[r for r in range(matrix.shape[0]) if r!=row]
    cc=[c for c in range(matrix.shape[1]) if c!=col]
    r,c=linear_sum_assignment(matrix[np.ix_(rr,cc)],maximize=True)
    return [(row,col)]+[(rr[i],cc[j]) for i,j in zip(r,c)]


def explain(matrix,gate,row,tracks):
    matrix=np.asarray(matrix,dtype=float).reshape(len(tracks),-1)
    require(np.all(np.isfinite(matrix)) and 0<=row<len(tracks),'Finite owned matrix required')
    raw,accepted=solve(matrix,gate);byrow=dict(raw);bycol={c:r for r,c in raw}
    require(row not in dict(accepted),'Audit row already accepted')
    candidates=np.flatnonzero(matrix[row]>=gate).tolist();require(candidates,'No gate exposure')
    objective=float(sum(matrix[r,c] for r,c in raw));alternatives=[]
    for col in candidates:
        alt=forced(matrix,row,col);kept=[(r,c) for r,c in alt if matrix[r,c]>=gate]
        owner=bycol.get(col);loss=objective-float(sum(matrix[r,c] for r,c in alt))
        alternatives.append({'column':col,'owner':owner,'owner_accepted':(owner,col) in accepted,
            'owner_role':'unused' if owner is None else ('active' if tracks[owner]['age_since_update']==1 else 'retained'),
            'owner_confirmed':None if owner is None else tracks[owner]['tracker_id']>=0,
            'pairs':alt,'objective_loss':loss,'accepted_count_delta':len(kept)-len(accepted),
            'lost_accepted_rows':sorted(set(dict(accepted))-set(dict(kept)))})
    return {'row':row,'raw_pairs':raw,'accepted_pairs':accepted,'raw_objective':objective,
        'raw_row_status':'unassigned_rectangular' if row not in byrow else 'assigned_below_gate',
        'raw_column':byrow.get(row),'alternatives':alternatives}


def audit(traces,health):
    counts=Counter({k:0 for k in ('high_stages','cases','candidate_edges','unassigned_rectangular',
        'assigned_below_gate','owner_accepted','owner_unused','owner_active','owner_retained',
        'owner_confirmed','owner_tentative','objective_loss_positive','objective_loss_zero',
        'objective_loss_negative','forced_acceptance_fewer','forced_acceptance_equal',
        'forced_acceptance_more','forced_loses_accepted_row')});cases=[]
    eligible=set()
    for h in health['hypotheses']:
        if h['end']['kind']!='expired':continue
        origin=h['accepted'][-1]['frame'] if h['accepted'] else h['birth']['frame']
        for f in range(origin+1,h['end']['frame']+1):eligible.add((f,h['birth']['state']['token']))
    for t in traces:
        for stage in t['stages']:
            if stage['name']!='high_all':continue
            counts['high_stages']+=1
            m=np.asarray(stage['similarity']).reshape(len(stage['tracks']),len(stage['detection_indices']))
            raw,accepted=solve(m,stage['gate'])
            require([list(x) for x in accepted]==stage['matched'],'Original maximize-then-gate differs')
            require(sorted(set(range(len(m)))-set(dict(accepted)))==stage['unmatched_rows'] and
                sorted(set(range(m.shape[1]))-set(c for r,c in accepted))==stage['unmatched_columns'],'Original partitions differ')
            for r,track in enumerate(stage['tracks']):
                if (t['frame'],track['token']) not in eligible or not np.any(m[r]>=stage['gate']):continue
                value=explain(m,stage['gate'],r,stage['tracks']);counts['cases']+=1;counts[value['raw_row_status']]+=1
                value.update(frame=t['frame'],token=track['token'],matrix=m.tolist(),tracks=stage['tracks'])
                for alt in value['alternatives']:
                    counts['candidate_edges']+=1;counts['owner_accepted']+=alt['owner_accepted']
                    counts['owner_'+alt['owner_role']]+=1
                    if alt['owner'] is not None:counts['owner_confirmed' if alt['owner_confirmed'] else 'owner_tentative']+=1
                    loss=alt['objective_loss'];counts['objective_loss_'+('positive' if loss>0 else 'negative' if loss<0 else 'zero')]+=1
                    delta=alt['accepted_count_delta'];counts['forced_acceptance_'+('more' if delta>0 else 'fewer' if delta<0 else 'equal')]+=1
                    counts['forced_loses_accepted_row']+=bool(alt['lost_accepted_rows'])
                cases.append(value)
    return dict(counts),cases
