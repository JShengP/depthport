# SPDX-License-Identifier: AGPL-3.0-only
"""GT-free read-only accepted-input/seed-lineage accounting over sealed histories.

Cross-arm keys use source frame and original detection index, never native IDs.
Raw event/box records are local; public results contain counts and hashes only.
"""
from collections import Counter
import hashlib
import json
import math


def require(ok, message):
    if not ok:
        raise ValueError(message)


def strict_json(text):
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, 'Duplicate JSON key')
            out[key] = value
        return out
    def constant(value):
        raise ValueError('Nonfinite JSON constant')
    return json.loads(text, object_pairs_hook=pairs, parse_constant=constant)


def encoded(value):
    return (json.dumps(value, allow_nan=False, separators=(',', ':')) + '\n').encode()


class AcceptedLedger:
    def __init__(self):
        self.frames = 0
        self.births = {}
        self.birth_keys = set()
        self.events = {}
        self.previous = []
        self.input_hash = hashlib.sha256()
        self.receipt = hashlib.sha256()
        self.counts = Counter({k: 0 for k in ('births', 'accepted_high', 'accepted_weak',
            'confirmed_observations', 'active_updates', 'retained_updates', 'tentative_promotions')})

    def add(self, record):
        require(set(record) == {'lifecycle', 'numerical', 'geometry'}, 'Exact history root required')
        life = record['lifecycle']
        allowed = {'frame', 'input_boxes', 'input_confidences', 'high_indices', 'weak_indices',
            'before_update', 'before_predict', 'predicted', 'after_budget_prune', 'stages',
            'birth_candidates', 'births', 'before_lifecycle_prune', 'after_update', 'removals'}
        require(set(life) == allowed, 'Exact GT-free lifecycle schema required')
        f = life['frame']
        require(type(f) is int and f == self.frames + 1
            and record['numerical']['frame'] == f and record['geometry']['frame'] == f, 'Dense aligned history required')
        require(life['before_update'] == self.previous, 'Between-frame ownership continuity differs')
        require(life['before_predict'] == life['before_update'], 'Pre-predict ownership differs')
        size = len(life['input_boxes'])
        require(len(life['input_confidences']) == size, 'Aligned original inputs required')
        high, weak = life['high_indices'], life['weak_indices']
        require(sorted(high + weak) == list(range(size)) and len(set(high + weak)) == size, 'Original input partition required')
        for box, confidence in zip(life['input_boxes'], life['input_confidences']):
            require(len(box) == 4 and all(type(v) in (int, float) and math.isfinite(v) for v in box)
                and type(confidence) in (int, float) and math.isfinite(confidence), 'Finite original inputs required')
        input_row = {k: life[k] for k in ('frame', 'input_boxes', 'input_confidences', 'high_indices', 'weak_indices')}
        self.input_hash.update(encoded(input_row))
        pre = {s['token']: s for s in life['before_update']}
        post = {s['token']: s for s in life['before_lifecycle_prune']}
        require(len(pre) == len(life['before_update']) and len(post) == len(life['before_lifecycle_prune']), 'Unique ownership required')
        for token in pre:
            require(token in self.births and token in post, 'Missing immutable birth lineage')
        raw = []
        born_indices = set()
        for birth in life['births']:
            token = birth['state']['token']; index = birth['detection_index']; key = (f, index)
            require(type(index) is int and index in high and index not in born_indices
                and token not in self.births and token not in pre and key not in self.birth_keys,
                'Unique unmatched-high birth required')
            require(birth['reason'] == 'unmatched_high_above_activation' and token in post, 'Original birth reason required')
            self.births[token] = key; self.birth_keys.add(key); born_indices.add(index)
            self.counts['births'] += 1
            raw.append({'kind': 'birth', 'input': key, 'local_token': token})
        used_tokens, used_indices = set(), set()
        names = [s['name'] for s in life['stages']]
        require(names in ([], ['high_all'], ['high_all', 'weak_remaining']), 'Original stage order required')
        for stage in life['stages']:
            phase = 'high' if stage['name'] == 'high_all' else 'weak'
            require(stage['detection_indices'] == (high if phase == 'high' else weak), 'Original stage indices differ')
            for row, col in stage['matched']:
                require(type(row) is int and type(col) is int and 0 <= row < len(stage['tracks'])
                    and 0 <= col < len(stage['detection_indices']), 'Valid accepted pair required')
                token = stage['tracks'][row]['token']; index = stage['detection_indices'][col]
                require(token in pre and token not in used_tokens and index not in used_indices
                    and index not in born_indices, 'One-to-one original accepted input required')
                used_tokens.add(token); used_indices.add(index)
                key = (f, index); before = pre[token]; after = post[token]
                age = before['age_since_update']
                require(type(age) in (int, float) and math.isfinite(age) and age >= 0, 'Valid pre-update role required')
                require(key not in self.events, 'Duplicate accepted input')
                event = {'input': key, 'birth': self.births[token], 'stage': phase, 'active': age == 0,
                    'pre_confirmed': before['tracker_id'] >= 0, 'confirmed': after['tracker_id'] >= 0,
                    'posterior_box': after['bbox']}
                self.events[key] = event
                self.counts['accepted_' + phase] += 1
                self.counts['confirmed_observations'] += event['confirmed']
                self.counts['active_updates' if event['active'] else 'retained_updates'] += 1
                self.counts['tentative_promotions'] += not event['pre_confirmed'] and event['confirmed']
                raw.append({'kind': 'accepted', 'local_token': token, **event})
        # Numerical operations are an independent receipt of every accepted edge.
        updates = [(o['token'], o['phase']) for o in record['numerical']['operations'] if o['operation'] == 'update']
        expected = [(s['tracks'][r]['token'], s['name']) for s in life['stages'] for r, _ in s['matched']]
        require(updates == expected, 'Accepted operation receipt differs')
        self.frames = f; self.previous = life['after_update']
        for event in raw:
            self.receipt.update(encoded(event))
        return raw

    def summary(self):
        return {'frames': self.frames, **dict(self.counts), 'accepted_inputs': len(self.events),
                'input_receipt_sha256': self.input_hash.hexdigest(), 'event_receipt_sha256': self.receipt.hexdigest()}


def sets(ledger):
    return {'weak': {k for k, v in ledger.events.items() if v['stage'] == 'weak'},
            'confirmed': {k for k, v in ledger.events.items() if v['confirmed']},
            'active': {(k[0], *v['birth'], k[1], v['stage']) for k, v in ledger.events.items() if v['active']},
            'births': ledger.birth_keys}


def compare(reference, control):
    require(reference.frames == control.frames
        and reference.input_hash.digest() == control.input_hash.digest(), 'Same full source/input history required')
    old, new = reference.events, control.events
    common = old.keys() & new.keys(); lost = old.keys() - new.keys(); added = new.keys() - old.keys()
    fields = {'input_membership': (set(old), set(new)),
              'stage_membership': ({(*k, v['stage']) for k, v in old.items()}, {(*k, v['stage']) for k, v in new.items()}),
              'lineage_membership': ({(*k, *v['birth']) for k, v in old.items()}, {(*k, *v['birth']) for k, v in new.items()}),
              'stage_lineage_membership': ({(*k, *v['birth'], v['stage']) for k, v in old.items()},
                                            {(*k, *v['birth'], v['stage']) for k, v in new.items()})}
    membership = {name: {'reference': len(a), 'control': len(b), 'common': len(a & b),
                              'lost': len(a - b), 'added': len(b - a)} for name, (a, b) in fields.items()}
    for v in membership.values():
        require(v['control'] - v['reference'] == v['added'] - v['lost'], 'Membership balance differs')
    rs, cs = sets(reference), sets(control)
    losses = {name: rs[name] - cs[name] for name in ('weak', 'active', 'confirmed')}
    weak_partition = Counter({'input_missing': 0, 'moved_to_high': 0})
    for key in losses['weak']:
        weak_partition['input_missing' if key not in new else 'moved_to_high'] += 1
    confirmed_partition = Counter({'input_missing': 0, 'accepted_but_unconfirmed': 0})
    for key in losses['confirmed']:
        confirmed_partition['input_missing' if key not in new else 'accepted_but_unconfirmed'] += 1
    active_partition = Counter({k: 0 for k in ('input_missing', 'birth_lineage_changed', 'stage_changed', 'became_retained')})
    raw = []
    for edge in sorted(losses['active']):
        f, birth_f, birth_i, index, phase = edge; key = (f, index)
        if key not in new:
            reason = 'input_missing'
        elif new[key]['birth'] != (birth_f, birth_i):
            reason = 'birth_lineage_changed'
        elif new[key]['stage'] != phase:
            reason = 'stage_changed'
        else:
            require(not new[key]['active'], 'Unexplained lost active edge')
            reason = 'became_retained'
        active_partition[reason] += 1
        raw.append({'kind': 'lost_original_active_edge', 'input': key, 'birth': (birth_f, birth_i), 'reason': reason})
    gates = {'no_lost_weak_accepted_inputs': not losses['weak'], 'no_lost_active_update_pairs': not losses['active'],
             'no_lost_confirmed_output_inputs': not losses['confirmed'], 'no_new_birth_events': not (cs['births'] - rs['births'])}
    for key in sorted(lost | added):
        raw.append({'kind': 'lost_accepted_input' if key in lost else 'added_accepted_input', 'event': old[key] if key in lost else new[key]})
    return {'membership': membership,
        'common_input_stage_changes': sum(old[k]['stage'] != new[k]['stage'] for k in common),
        'common_input_birth_lineage_changes': sum(old[k]['birth'] != new[k]['birth'] for k in common),
        'common_input_posterior_box_encoding_changes': sum(encoded(old[k]['posterior_box']) != encoded(new[k]['posterior_box']) for k in common),
        'birth_membership': {'reference': len(rs['births']), 'control': len(cs['births']),
                            'lost': len(rs['births'] - cs['births']), 'added': len(cs['births'] - rs['births'])},
        'original_proxy_loss_counts': {k: len(v) for k, v in losses.items()},
        'lost_weak_partition': dict(weak_partition), 'lost_confirmed_partition': dict(confirmed_partition),
        'lost_active_partition_priority': dict(active_partition), 'original_membership_proxy_gates': gates,
        'identity_or_accuracy_accepted': False}, raw
