# SPDX-License-Identifier: AGPL-3.0-only
"""Aggregate only numerical replay evidence; coordinates/cases remain local."""
from collections import Counter
import numpy as np
from depthport.tracking_estimator_shadow import array
from depthport.tracking_lifecycle_probe import require


def audit(records,health,lifecycle):
    require([r['frame'] for r in records]==[t['frame'] for t in lifecycle],'Dense numerical coverage required')
    counts=Counter({k:0 for k in ('frames','births','predictions','updates_high','updates_weak',
        'shadow_operation_equal','first_cases','first_width','first_height','first_both',
        'first_previous_positive','first_negative_dimension_velocity','first_velocity_unchanged_since_update',
        'first_matches_last_posterior_linear_projection','first_inherited_shrink','first_update_introduced_shrink')})
    checks=Counter();failures=Counter();ops={};births={};cases=[]
    for record,trace in zip(records,lifecycle):
        f=record['frame'];counts['frames']+=1
        require([b['token'] for b in record['births']]==[b['state']['token'] for b in trace['births']],'Numerical births differ')
        for b in record['births']:births[b['token']]=b;counts['births']+=1
        seen=[]
        for op in record['operations']:
            key=(f,op['token'],op['operation']);require(key not in ops,'Repeated operation')
            ops[key]=op;seen.append((op['token'],op['operation']))
            counts['predictions' if op['operation']=='predict' else 'updates_high' if op['phase']=='high_all' else 'updates_weak']+=1
            counts['shadow_operation_equal']+=1
            for name,ok in op['checks'].items():checks[name]+=1;failures[name]+=not ok
        expected=[(s['token'],'predict') for s in trace['before_predict']]
        expected += [(s['tracks'][r]['token'],'update') for s in trace['stages'] for r,c in s['matched']]
        require(seen==expected,'Numerical native operation ordering differs')
        for state in trace['predicted']:
            require(np.array_equal(array(ops[(f,state['token'],'predict')]['after'],'state')[:4,0],state['bbox']),'Predicted geometry differs')
        for stage in trace['stages']:
            for r,c in stage['matched']:
                token=stage['tracks'][r]['token'];op=ops[(f,token,'update')]
                post=next(s for s in trace['before_lifecycle_prune'] if s['token']==token)
                require(np.array_equal(array(op['after'],'state')[:4,0],post['bbox']),'Accepted posterior differs')
    for event in health['first_nonpositive']:
        require(event['phase']=='prediction' and event['prior_accepted'] is not None,'Previously defined first population differs')
        f=event['frame'];token=event['token'];op=ops[(f,token,'predict')];prior=event['prior_accepted']
        update=ops[(prior['frame'],token,'update')];gap=f-prior['frame']
        before=array(op['before'],'state').ravel();after=array(op['after'],'state').ravel()
        last=array(update['after'],'state').ravel();old=array(update['before'],'state').ravel()
        require(np.array_equal(after[:4],event['state']['bbox']) and np.array_equal(last[:4],prior['posterior']['bbox']),'First/prior health event differs')
        bits=after[[2,3]]<=after[[0,1]];dims=after[[2,3]]-after[[0,1]]
        previous=before[[2,3]]-before[[0,1]];velocity=after[[6,7]]-after[[4,5]]
        lastdims=last[[2,3]]-last[[0,1]];oldvelocity=old[[6,7]]-old[[4,5]]
        unchanged=all(np.array_equal(array(ops[(i,token,'predict')]['after'],'state')[4:,0],last[4:]) for i in range(prior['frame']+1,f+1))
        # Fixed absolute tolerance for rearranged scalar subtraction; native
        # operation/shadow arrays are exact, not tolerance-based acceptance.
        projected=lastdims+gap*(last[[6,7]]-last[[4,5]])
        linear=bool(np.all(np.abs(projected-dims)<=1e-10))
        counts['first_cases']+=1;counts['first_'+('both' if all(bits) else 'width' if bits[0] else 'height')]+=1
        counts['first_previous_positive']+=bool(np.all(previous>0))
        counts['first_negative_dimension_velocity']+=bool(np.all(velocity[bits]<0))
        counts['first_velocity_unchanged_since_update']+=unchanged
        counts['first_matches_last_posterior_linear_projection']+=linear
        counts['first_inherited_shrink']+=bool(np.all(oldvelocity[bits]<0))
        counts['first_update_introduced_shrink']+=bool(np.any(oldvelocity[bits]>=0) and np.all(velocity[bits]<0))
        cases.append({'health_event':event,'prediction':op,'last_update':update,'gap':gap,
            'previous_dimensions':previous.tolist(),'dimensions':dims.tolist(),'dimension_velocity':velocity.tolist(),
            'last_posterior_linear_dimensions':projected.tolist(),'unchanged_velocity':unchanged,'linear_projection_equal':linear})
    return {'counts':dict(counts),'numerical_check_denominators':dict(checks),'numerical_check_failures':dict(failures)},cases
