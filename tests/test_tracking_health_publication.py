# SPDX-License-Identifier: AGPL-3.0-only
"""Publication minimization preserves complete counts and original aggregate."""
import copy
import pytest
from tools.project_tracking_health import project


def fixture():
    return {'format':'depthport.state-observation-health.v1','ledger':[
        {'name':'synthetic','status':'completed','summary':{
            'counts':{'inputs':4},'other':{'kept':7},
            'global_empty_runs':{'high':{'left:12':1,'right:3':1,'both:8':1,'interior:2':3}},
            'contexts':{'birth':{'weak':{'events':3,'at_event':1,
                'before':{'censored:0':1,'censored:9':1,'observed:2':1},
                'after':{'observed:1':2,'censored:10':1}}}}}},
        {'name':'failed_synthetic','status':'failed','reason':'retained'}]}


def test_hide_boundary_locations_without_losing_zeros_failures_or_counts():
    raw=fixture();before=copy.deepcopy(raw);out=project(raw);assert raw==before
    a=out['ledger'][0]['summary'];assert a['counts']==before['ledger'][0]['summary']['counts'] and a['other']=={'kept':7}
    assert a['global_empty_runs']['high']=={'both:boundary_length_local':1,'interior:2':3,'left:boundary_length_local':1,'right:boundary_length_local':1}
    assert a['contexts']['birth']['weak']['before']=={'censored':2,'observed:2':1}
    assert a['contexts']['birth']['weak']['after']=={'censored':1,'observed:1':2}
    assert out['ledger'][1]==before['ledger'][1]


def test_event_count_mismatch_rejected():
    raw=fixture();raw['ledger'][0]['summary']['contexts']['birth']['weak']['events']=2
    with pytest.raises(ValueError,match='Context event count'):project(raw)
