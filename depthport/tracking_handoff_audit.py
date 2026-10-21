# SPDX-License-Identifier: AGPL-3.0-only
"""Read-only handoff evidence, strictly separated from current/future outcomes."""
from collections import Counter
import hashlib

from depthport.tracking_accepted_events import encoded, require
from depthport.tracking_observation_bridge import CATEGORIES, role

STATUSES = ('active_confirmed', 'active_tentative', 'retained_confirmed', 'retained_tentative',
            'removed_expired', 'removed_immature_unmatched', 'removed_expired_and_immature', 'missing_evidence')
ACTIONS = ('birth', 'accepted_high', 'accepted_weak', 'unaccepted', 'missing_evidence')
TARGETS = ('missing_reference_support', 'unbridged_known_chains')


def state_role(state):
    return ('active' if state['age_since_update'] == 0 else 'retained') + (
        '_confirmed' if state['tracker_id'] >= 0 else '_tentative')


class Timeline:
    """Only committed frames are accessible to evidence queries."""
    def __init__(self):
        self.frame = 0
        self.tokens = {}
        self.births = {}
        self.accepted = {}
        self.removed = {}
        self.live = {}
        self.actions = {}

    def prepare(self, life):
        require(life['frame'] == self.frame + 1, 'Dense timeline required')
        pre = {self.tokens[s['token']]: s for s in life['before_update']}
        require(len(pre) == len(life['before_update']) and pre == self.live, 'Predecision lifecycle differs')

    def evidence(self, owner):
        require(owner[0] <= self.frame, 'Current/future birth is not prior evidence')
        birth = self.births.get(owner)
        removal = self.removed.get(owner)
        live = self.live.get(owner)
        require(not (live and removal), 'Removed owner cannot be live')
        status = state_role(live) if live else 'removed_' + removal['reason'] if removal else 'missing_evidence'
        accepted = self.accepted.get(owner, [])
        return {'birth': dict(birth) if birth else None, 'status': status,
                'pre_missed_frames': live['age_since_update'] if live else None,
                'accepted': [dict(e) for e in accepted],
                'last_accepted_gap': self.frame + 1 - accepted[-1]['input'][0] if accepted else None,
                'removal': dict(removal) if removal else None,
                'removal_evidence': 'recorded_prior_removal' if removal else 'no_recorded_removal_in_prefix'}

    def action(self, key):
        require(key[0] <= self.frame, 'Current/future action is not prior evidence')
        return dict(self.actions.get(key, {'kind': 'missing_evidence'}))

    def commit(self, life, events):
        self.prepare(life); f = life['frame']
        for birth in life['births']:
            token = birth['state']['token']; key = (f, birth['detection_index'])
            require(token not in self.tokens and key not in self.births, 'Unique immutable birth required')
            self.tokens[token] = key
            self.births[key] = {'input': key, 'reason': birth['reason']}
        frame_actions = {(f, i): {'kind': 'unaccepted'} for i in range(len(life['input_boxes']))}
        for birth in life['births']:
            key = (f, birth['detection_index']); frame_actions[key] = {'kind': 'birth', 'owner': key}
        for key, event in events.items():
            owner = tuple(event['birth'])
            require(owner in self.births and owner not in self.removed and owner[0] < f,
                    'Accepted update needs a pre-existing nonremoved owner')
            require(frame_actions[key]['kind'] == 'unaccepted', 'Birth cannot be accepted update')
            e = {'input': key, 'stage': event['stage'], 'role': role(event)}
            self.accepted.setdefault(owner, []).append(e)
            frame_actions[key] = {'kind': 'accepted_' + event['stage'], 'owner': owner, 'role': role(event)}
        before = {s['token']: s for s in life['before_lifecycle_prune']}
        after = {s['token']: s for s in life['after_update']}
        removed = {r['state']['token']: r for r in life['removals']}
        require(len(before) == len(life['before_lifecycle_prune']) and len(after) == len(life['after_update'])
            and len(removed) == len(life['removals']) and set(after) <= set(before)
            and set(removed) == set(before) - set(after), 'Complete removal receipt required')
        for token, record in removed.items():
            owner = self.tokens[token]
            require(owner not in self.removed and record['state'] == before[token]
                and record['reason'] in ('expired', 'immature_unmatched', 'expired_and_immature'), 'Original removal reason required')
            self.removed[owner] = {'frame': f, 'reason': record['reason'],
                                   'missed_frames': record['state']['age_since_update']}
        require(set(before) == {s['token'] for s in life['before_update']} | {
            b['state']['token'] for b in life['births']}, 'Complete lifecycle ownership required')
        require(all(tuple(e['birth']) in {self.tokens[t] for t in after} for e in events.values()),
                'Accepted owner cannot be removed in the current frame')
        self.live = {self.tokens[t]: s for t, s in after.items()}
        self.actions.update(frame_actions); self.frame = f


def counter(keys):
    return Counter({k: 0 for k in keys})


class HandoffAudit:
    def __init__(self):
        self.timelines = [Timeline(), Timeline()]
        self.cases = []
        self.bridge_receipt = hashlib.sha256()
        self.finished = False

    def add(self, lives, events, bridge):
        require(not self.finished, 'Audit already finalized')
        f = lives[0]['frame']
        require(f == lives[1]['frame'] == bridge.frame + 1, 'Aligned immutable prefixes required')
        for timeline, life in zip(self.timelines, lives): timeline.prepare(life)
        pending = []
        for key in sorted(events[0].keys() & events[1].keys()):
            r, c = (e[key] for e in events); owners = (tuple(r['birth']), tuple(c['birth']))
            info = bridge.classify(*owners)
            lost = r['active'] and (owners[0] != owners[1] or r['stage'] != c['stage'] or not c['active'])
            if not lost or info['category'] not in TARGETS: continue
            # All context is copied BEFORE either current-frame timeline/graph commit.
            own = [t.evidence(o) for t, o in zip(self.timelines, owners)]
            require([e['status'] for e in own] == [role(r), role(c)], 'Predecision owner roles differ')
            neighbors = [sorted(bridge.reference.get(owners[0], ())), sorted(bridge.control.get(owners[1], ()))]
            context = {'frame': f, 'input': key, 'owners': owners, 'bridge': info, 'owners_prior': own,
                'birth_input_other_arm': [self.timelines[1-i].action(o) for i, o in enumerate(owners)],
                'neighbors_prior': [[{'owner': o, 'evidence': self.timelines[1-i].evidence(o),
                                      'common_anchors': bridge.edges[(owners[0], o) if i == 0 else (o, owners[1])]}
                                     for o in ns] for i, ns in enumerate(neighbors)]}
            pending.append({'prefix': context, 'current': {'reference_stage': r['stage'], 'control_stage': c['stage'],
                'reference_confirmed_after': r['confirmed'], 'control_confirmed_after': c['confirmed']},
                'following': {'same_pair': counter(CATEGORIES), 'touch_reference_other_control': 0,
                    'touch_control_other_reference': 0, 'owner_updates': [counter(('high', 'weak')), counter(('high', 'weak'))],
                    'same_pair_roles': Counter()}, 'local_following': []})
        rows = bridge.add(f, *events)
        for row in rows: self.bridge_receipt.update(encoded(row))
        for case in self.cases:  # Existing cases only: current frame > boundary.
            require(case['prefix']['frame'] < f, 'No same-frame suffix leakage')
            a, b = case['prefix']['owners']; following = case['following']
            for row in rows:
                x, y = row['reference_birth'], row['control_birth']
                if (x, y) == (a, b):
                    following['same_pair'][row['category']] += 1
                    following['same_pair_roles'][(row['category'], row['reference_role'], row['control_role'],
                        row['reference_stage'], row['control_stage'])] += 1
                elif x == a: following['touch_reference_other_control'] += 1
                elif y == b: following['touch_control_other_reference'] += 1
                if x == a or y == b: case['local_following'].append(dict(row))
            for i, owner in enumerate((a, b)):
                for event in events[i].values():
                    if tuple(event['birth']) == owner: following['owner_updates'][i][event['stage']] += 1
        self.cases.extend(pending)
        for timeline, life, e in zip(self.timelines, lives, events): timeline.commit(life, e)
        return rows

    def finish(self):
        require(not self.finished, 'No repeated finalization'); self.finished = True
        for case in self.cases:
            end = []
            for timeline, owner in zip(self.timelines, case['prefix']['owners']):
                evidence = timeline.evidence(owner)
                # Suffix evidence remains explicitly separate, never changes prefix.
                end.append({'status': evidence['status'], 'removal': evidence['removal'],
                            'source_end_censored': owner in timeline.live})
            case['source_end'] = end
            case['following']['same_pair_roles'] = [
                {'category': k[0], 'reference_role': k[1], 'control_role': k[2],
                 'reference_stage': k[3], 'control_stage': k[4], 'events': n}
                for k, n in sorted(case['following']['same_pair_roles'].items())]
        return self.summary()

    def summary(self):
        require(self.finished, 'Full suffix required')
        groups = {}
        for category in TARGETS:
            cases = [c for c in self.cases if c['prefix']['bridge']['category'] == category]
            own = []; neighbors = []
            for side in (0, 1):
                a = {'statuses': counter(STATUSES), 'birth_available': 0, 'birth_previous_frame': 0,
                     'accepted_history_empty': 0, 'accepted_high': 0, 'accepted_weak': 0,
                     'recorded_prior_removal': 0, 'birth_input_other_arm': counter(ACTIONS),
                     'birth_other_arm_accepted_roles': counter(STATUSES[:4]),
                     'source_end_statuses': counter(STATUSES), 'source_end_censored': 0,
                     'following_high': 0, 'following_weak': 0}
                n = {'statuses': counter(STATUSES), 'neighbors': 0, 'recorded_prior_removal': 0,
                     'accepted_high': 0, 'accepted_weak': 0, 'past_common_anchors': 0}
                for c in cases:
                    p = c['prefix']; e = p['owners_prior'][side]; a['statuses'][e['status']] += 1
                    a['birth_available'] += e['birth'] is not None
                    a['birth_previous_frame'] += e['birth'] is not None and e['birth']['input'][0] == p['frame'] - 1
                    a['accepted_history_empty'] += not e['accepted']
                    for v in e['accepted']: a['accepted_' + v['stage']] += 1
                    a['recorded_prior_removal'] += e['removal'] is not None
                    action = p['birth_input_other_arm'][side]; a['birth_input_other_arm'][action['kind']] += 1
                    if action['kind'].startswith('accepted_'): a['birth_other_arm_accepted_roles'][action['role']] += 1
                    end = c['source_end'][side]; a['source_end_statuses'][end['status']] += 1
                    a['source_end_censored'] += end['source_end_censored']
                    for stage in ('high', 'weak'): a['following_' + stage] += c['following']['owner_updates'][side][stage]
                    for v in p['neighbors_prior'][side]:
                        e = v['evidence']; n['neighbors'] += 1; n['statuses'][e['status']] += 1
                        n['recorded_prior_removal'] += e['removal'] is not None
                        for update in e['accepted']: n['accepted_' + update['stage']] += 1
                        n['past_common_anchors'] += v['common_anchors']
                own.append(a); neighbors.append(n)
            suffix = counter(CATEGORIES); strata = Counter()
            for c in cases:
                suffix.update(c['following']['same_pair'])
                for s in c['following']['same_pair_roles']:
                    strata[(s['category'], s['reference_role'], s['control_role'], s['reference_stage'], s['control_stage'])] += s['events']
            groups[category] = {'boundaries': len(cases), 'owners': dict(zip(('reference', 'control'), own)),
                'past_neighbors': dict(zip(('control_neighbors_of_reference', 'reference_neighbors_of_control'), neighbors)),
                'following_same_pair_categories': dict(suffix),
                'following_other_control_for_reference': sum(c['following']['touch_reference_other_control'] for c in cases),
                'following_other_reference_for_control': sum(c['following']['touch_control_other_reference'] for c in cases),
                'following_same_pair_strata': [{'category': k[0], 'reference_role': k[1], 'control_role': k[2],
                    'reference_stage': k[3], 'control_stage': k[4], 'events': n} for k, n in sorted(strata.items())]}
        return {'frames': self.timelines[0].frame, 'boundaries': len(self.cases), 'groups': groups,
                'original_bridge_receipt_sha256': self.bridge_receipt.hexdigest(),
                'current_or_future_used_as_prior_evidence': False, 'identity_accepted': False}
