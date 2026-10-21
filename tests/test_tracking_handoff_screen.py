# SPDX-License-Identifier: AGPL-3.0-only
from depthport.tracking_accepted_events import AcceptedLedger
from depthport.tracking_handoff_screen import screen


def ledger(birth=(1,0),stage='weak'):
    l=AcceptedLedger();l.frames=2;l.birth_keys={birth}
    l.events={(2,0):{'birth':birth,'stage':stage,'active':True,'confirmed':True,'posterior_box':[0,0,1,1]}}
    return l


def counts(**kw):return dict(numerical_failures=0,invalid_accepted_posteriors=0,invalid_predictions=0,
                            protected_other_updates_lost=0,actions=1,**kw)


def test_unchanged_legacy_gate_is_separate_from_new_input_screen():
    a,b=ledger(),ledger((1,1));b.birth_keys=a.birth_keys.copy()
    out,_=screen(a,b,counts(),counts())
    assert out['all_observable_input_gates_pass'] and not out['legacy_strict_active_gate_pass']
    assert not out['identity_or_accuracy_accepted']


def test_lost_weak_or_confirmed_input_fails_without_pooling():
    a,b=ledger(),ledger();b.events={}
    out,_=screen(a,b,counts(),counts())
    assert not out['all_observable_input_gates_pass']
    assert not out['observable_input_gates']['no_lost_weak_inputs']


def test_same_counts_cannot_hide_new_birth_keys_or_weak_stage_loss():
    a,b=ledger(),ledger((1,1),'high')
    out,_=screen(a,b,counts(),counts())
    assert not out['observable_input_gates']['no_new_births']
    assert not out['observable_input_gates']['no_lost_weak_inputs']


def test_zero_action_is_not_effective_exposure():
    a,b=ledger(),ledger();x=counts();x['actions']=0
    out,_=screen(a,b,counts(),x)
    assert out['all_observable_input_gates_pass'] and not out['effective_candidate_exposure']


def test_added_numeric_or_geometry_harm_fails():
    a,b=ledger(),ledger();x=counts();x['invalid_predictions']=1
    out,_=screen(a,b,counts(),x)
    assert not out['observable_input_gates']['no_added_invalid_predictions']
