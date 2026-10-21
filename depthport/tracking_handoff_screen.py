# SPDX-License-Identifier: AGPL-3.0-only
"""Separate observable-input screen from unchanged historical lineage proxies."""
from depthport.tracking_accepted_events import compare


def screen(reference, treatment, baseline, control):
    membership, raw = compare(reference, treatment)
    lost = membership['original_proxy_loss_counts']
    gates = {'no_lost_accepted_inputs': not (reference.events.keys() - treatment.events.keys()),
        'no_lost_weak_inputs': lost['weak'] == 0, 'no_lost_confirmed_inputs': lost['confirmed'] == 0,
        'no_new_births': membership['birth_membership']['added'] == 0,
        'no_numerical_failures': baseline['numerical_failures'] == control['numerical_failures'] == 0,
        'no_invalid_accepted_posteriors': control['invalid_accepted_posteriors'] == 0,
        'no_added_invalid_predictions': control['invalid_predictions'] <= baseline['invalid_predictions'],
        'protected_other_updates': control['protected_other_updates_lost'] == 0}
    return {'membership': membership, 'observable_input_gates': gates,
        'all_observable_input_gates_pass': all(gates.values()),
        'effective_candidate_exposure': control['actions'] > 0,
        'legacy_strict_active_gate_pass': membership['original_membership_proxy_gates']['no_lost_active_update_pairs'],
        'identity_or_accuracy_accepted': False}, raw
