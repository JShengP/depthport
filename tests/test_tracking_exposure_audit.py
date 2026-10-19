# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from tools.audit_tracking_exposure import summarize


def test_reason_partition_has_no_raw_locations_and_preserves_zero_objective_gate_loss():
    t={'frame':999,'deferred':[{'row':4}], 'competition_audit':[{'veto':True,'competitors':[
        {'similarity_sum_loss':.02,'admissible_pair_change':0,'equivalent':False},
        {'similarity_sum_loss':0.,'admissible_pair_change':-1,'equivalent':False},
        {'similarity_sum_loss':0.,'admissible_pair_change':0,'equivalent':True}]}]}
    r=summarize([t]);assert r['actual_vetoes']==1
    assert list(r['alternative_reasons'].values())==[1,1,1]
    assert r['positive_loss_range']=={'min':.02,'max':.02}
    assert set(r)=={'actual_vetoes','alternative_reasons','positive_loss_range'}


def test_inconsistent_decisions_or_equivalence_fail_closed():
    with pytest.raises(ValueError,match='Decision'):
        summarize([{'deferred':[],'competition_audit':[{'veto':True}]}])
    with pytest.raises(ValueError,match='Equivalence'):
        summarize([{'deferred':[],'competition_audit':[{'veto':False,'competitors':[
            {'similarity_sum_loss':.1,'admissible_pair_change':0,'equivalent':True}]}]}])
