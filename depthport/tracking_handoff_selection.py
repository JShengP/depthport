# SPDX-License-Identifier: AGPL-3.0-only
"""GT-free source selection by actual frozen-candidate actions, never harm scores."""
GROUPS = {'birth_active': ('birth_continuation', 'active_birth_continuations'),
          'birth_retained': ('birth_continuation', 'retained_birth_continuations'),
          'past_handoff': ('past_competition_handoff', 'actions')}


def exposure(row, group):
    arm, counter = GROUPS[group]
    if row['status'] != 'completed':
        return None
    return row['passes'][arm + '-0']['counts'][counter]


def select(rows):
    """First lexical actually exposed complete source/group, even when harmful.

    Failures remain null, zeros remain zero. Repeat/native integrity and cap0
    are execution qualifications; per-scene harm never determines selection.
    """
    return {g: next((r['name'] for r in sorted(rows, key=lambda r: r['name'])
                    if exposure(r, g) is not None and exposure(r, g) > 0), None)
            for g in GROUPS}


def confirmation(discovery, reserved):
    complete = bool(discovery and reserved) and all(r['status'] == 'completed' for r in discovery + reserved)
    selected = select(discovery)
    return {g: bool(complete and selected[g] is not None
                   and all(exposure(r, g) > 0 and r['comparisons'][GROUPS[g][0]]['all_observable_input_gates_pass']
                           for r in reserved)) for g in GROUPS}
