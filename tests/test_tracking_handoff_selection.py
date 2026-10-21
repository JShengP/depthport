# SPDX-License-Identifier: AGPL-3.0-only
from copy import deepcopy
from depthport.tracking_handoff_selection import GROUPS, exposure, select, confirmation


def scene(name, active=0, retained=0, handoff=0, harm=False):
    return {'name': name, 'status': 'completed', 'passes': {
        'birth_continuation-0': {'counts': {'active_birth_continuations': active, 'retained_birth_continuations': retained}},
        'past_competition_handoff-0': {'counts': {'actions': handoff}}},
        'comparisons': {a: {'all_observable_input_gates_pass': not harm} for a in ('birth_continuation', 'past_competition_handoff')}}


def test_actual_roles_lexical_order_and_harm_independent_selection():
    rows = [scene('c', 4, 2, 7), scene('a', 0, 1, 0, harm=True), scene('b', 1, 0, 3, harm=True)]
    original = deepcopy(rows)
    assert select(rows) == {'birth_active': 'b', 'birth_retained': 'a', 'past_handoff': 'b'}
    assert rows == original


def test_zero_missing_and_failed_are_never_selected_or_relabelled():
    failed = {'name': 'a', 'status': 'failed', 'passes': {}, 'comparisons': None}
    rows = [failed, scene('b')]
    assert all(exposure(failed, g) is None for g in GROUPS)
    assert all(exposure(rows[1], g) == 0 for g in GROUPS)
    assert all(v is None for v in select(rows).values())
    assert not any(confirmation(rows, [scene('held', 1, 1, 1)]).values())


def test_each_reserved_scene_must_trigger_and_pass_without_pooling():
    discovery = [scene('d', 1, 1, 1)]
    reserved = [scene('x', 1, 0, 1), scene('y', 1, 10, 1)]
    assert confirmation(discovery, reserved) == {'birth_active': True, 'birth_retained': False, 'past_handoff': True}
    reserved[0]['comparisons']['past_competition_handoff']['all_observable_input_gates_pass'] = False
    assert not confirmation(discovery, reserved)['past_handoff']
    assert not any(confirmation(discovery, []).values())


def test_any_discovery_failure_blocks_formal_confirmation_but_not_ledger_selection():
    rows = [scene('a', 1, 1, 1), {'name': 'b', 'status': 'failed'}]
    assert all(v == 'a' for v in select(rows).values())
    assert not any(confirmation(rows, [scene('held', 1, 1, 1)]).values())
