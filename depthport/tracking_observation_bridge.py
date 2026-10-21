# SPDX-License-Identifier: AGPL-3.0-only
"""Read-only, strictly past common-accepted-observation lineage bridges.

Graph edges describe observation ownership across two archived executions, never
physical identity. No current-frame update can support its own classification.
"""
from collections import Counter, defaultdict
import hashlib

from depthport.tracking_accepted_events import encoded, require

CATEGORIES = ('unique_continuation', 'merge_relation', 'split_relation',
              'many_to_many_relation', 'unbridged_known_chains',
              'missing_reference_support', 'missing_control_support', 'missing_both_support')
GROUPS = ('all_common', 'changed_lineage', 'lost_original_active', 'unchanged_lineage')


def role(event):
    return ('active' if event['active'] else 'retained') + ('_confirmed' if event['pre_confirmed'] else '_tentative')


class PastBridge:
    """Query whole-frame immutable prefix, then commit ALL common anchors once."""
    def __init__(self):
        self.frame = 0
        self.edges = Counter()
        self.reference = defaultdict(set)
        self.control = defaultdict(set)
        self.accepted = [Counter(), Counter()]
        self.common_anchors = 0
        self.counts = {g: Counter({k: 0 for k in CATEGORIES}) for g in GROUPS}
        self.details = {g: Counter({k: 0 for k in (
            'direct_supported', 'direct_unsupported', 'indirect_connected_without_direct',
            'reference_accepted_history_empty', 'control_accepted_history_empty',
            'reference_only_noncommon_history', 'control_only_noncommon_history')}) for g in GROUPS}
        self.strata = {g: Counter() for g in GROUPS}
        self.pairs = {g: {} for g in GROUPS}
        self.receipt = hashlib.sha256()

    def classify(self, ref, ctrl):
        """No mutation on query; birth labels alone never establish a bridge."""
        left = self.reference.get(ref, set()); right = self.control.get(ctrl, set())
        support = self.edges[(ref, ctrl)]
        if support:
            if len(left) == len(right) == 1: category = 'unique_continuation'
            elif len(left) == 1: category = 'merge_relation'
            elif len(right) == 1: category = 'split_relation'
            else: category = 'many_to_many_relation'
        elif not left and not right: category = 'missing_both_support'
        elif not left: category = 'missing_reference_support'
        elif not right: category = 'missing_control_support'
        else: category = 'unbridged_known_chains'
        # A transitive path is reported but NEVER promoted to direct support.
        todo = [('r', ref)]; seen = set()
        while todo:
            side, node = todo.pop()
            if (side, node) in seen: continue
            seen.add((side, node))
            if side == 'r': todo.extend(('c', n) for n in self.reference.get(node, ()))
            else: todo.extend(('r', n) for n in self.control.get(node, ()))
        return {'category': category, 'past_common_pair_anchors': support,
                'reference_degree': len(left), 'control_degree': len(right),
                'indirect_connected_without_direct': not support and ('c', ctrl) in seen,
                'reference_accepted_history_empty': self.accepted[0][ref] == 0,
                'control_accepted_history_empty': self.accepted[1][ctrl] == 0,
                'reference_only_noncommon_history': not left and self.accepted[0][ref] > 0,
                'control_only_noncommon_history': not right and self.accepted[1][ctrl] > 0}

    def add(self, frame, reference, control):
        """Events are accepted updates only; births and noncommon inputs no anchors."""
        require(type(frame) is int and frame == self.frame + 1, 'Dense frames required')
        for events in (reference, control):
            for key, event in events.items():
                require(tuple(key) == tuple(event['input']) and key[0] == frame, 'Current accepted input required')
                require(event.get('kind', 'accepted') == 'accepted', 'Birth is not an accepted anchor')
                require(len(event['birth']) == 2 and event['birth'][0] < frame, 'Pre-existing lineage required')
                require(event['stage'] in ('high', 'weak') and type(event['active']) is bool
                        and type(event['pre_confirmed']) is bool, 'Accepted role/stage required')
            require(len({tuple(e['birth']) for e in events.values()}) == len(events), 'One-to-one owner updates required')
        common = sorted(reference.keys() & control.keys())
        raw = []
        for key in common:
            r, c = reference[key], control[key]
            ref, ctrl = tuple(r['birth']), tuple(c['birth'])
            info = self.classify(ref, ctrl)
            changed = ref != ctrl
            lost = r['active'] and (changed or r['stage'] != c['stage'] or not c['active'])
            groups = ['all_common', 'changed_lineage' if changed else 'unchanged_lineage']
            if lost: groups.append('lost_original_active')
            row = {'input': key, 'reference_birth': ref, 'control_birth': ctrl,
                   'reference_role': role(r), 'control_role': role(c),
                   'reference_stage': r['stage'], 'control_stage': c['stage'],
                   'changed_lineage': changed, 'lost_original_active': lost, **info}
            raw.append(row)
            for group in groups:
                self.counts[group][info['category']] += 1
                self.details[group]['direct_supported' if info['past_common_pair_anchors'] else 'direct_unsupported'] += 1
                for name in self.details[group]:
                    if name in info: self.details[group][name] += bool(info[name])
                self.strata[group][(info['category'], role(r), role(c), r['stage'], c['stage'])] += 1
                pair = self.pairs[group].setdefault((ref, ctrl), {'first_category': info['category'], 'events': 0})
                pair['events'] += 1
            self.receipt.update(encoded(row))
        # Strict t < frame barrier: no high/weak or within-frame ordering leakage.
        for key in common:
            ref, ctrl = tuple(reference[key]['birth']), tuple(control[key]['birth'])
            self.edges[(ref, ctrl)] += 1
            self.reference[ref].add(ctrl); self.control[ctrl].add(ref)
            self.common_anchors += 1
        for side, events in enumerate((reference, control)):
            for event in events.values(): self.accepted[side][tuple(event['birth'])] += 1
        self.frame = frame
        return raw

    def summary(self):
        groups = {}
        for name in GROUPS:
            pairs = self.pairs[name]
            first = Counter({k: 0 for k in CATEGORIES})
            for pair in pairs.values(): first[pair['first_category']] += 1
            groups[name] = {'events': sum(self.counts[name].values()),
                'categories': dict(self.counts[name]), 'flags': dict(self.details[name]),
                'distinct_owner_pairs': len(pairs), 'first_event_per_pair_categories': dict(first),
                'strata': [{'category': k[0], 'reference_role': k[1], 'control_role': k[2],
                            'reference_stage': k[3], 'control_stage': k[4], 'events': count}
                           for k, count in sorted(self.strata[name].items())]}
        degrees = lambda graph: {str(d): sum(len(n) == d for n in graph.values())
                                  for d in sorted({len(n) for n in graph.values()})}
        return {'frames': self.frame, 'common_anchors': self.common_anchors,
            'graph_edges': len(self.edges), 'reference_degree_histogram': degrees(self.reference),
            'control_degree_histogram': degrees(self.control), 'groups': groups,
            'local_bridge_receipt_sha256': self.receipt.hexdigest(), 'identity_accepted': False}
