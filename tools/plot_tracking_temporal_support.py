#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Publication figure from reviewed temporal aggregate counts only."""
import argparse
import json
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--summary', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args(); d = json.loads(a.summary.read_text())
    if d['format'] != 'depthport.temporal-support.v1' or d['gt_read'] or d['retuned']:
        p.error('Requires unchanged GT-free temporal summary')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(2, 2, figsize=(13.5, 9.5))
    summary = d['combined']['all']; groups = d['combined']['groups']; n = summary['alternatives']
    ax = axes[0, 0]; labels = list(groups)
    values = [groups[g]['alternatives'] for g in labels]
    bars = ax.barh(range(len(labels)), values, color=['#2463a0']*4 + ['#bf5925']*4)
    ax.set_yticks(range(len(labels)), [g.replace('/', ' / ').replace('_', ' ') for g in labels], fontsize=9)
    ax.invert_yaxis(); ax.bar_label(bars, padding=3); ax.set_xlim(0, max(values)*1.2)
    ax.set_xlabel('Reference alternatives; all eight frozen groups retained')
    ax.set_title('A  Structural risk groups; not error labels', loc='left', fontsize=11, weight='bold')
    ax = axes[0, 1]; ax.axis('off'); next_frame = summary['lags']['1']
    lines = [f'{n} nonempty recorded-history anchor pairs',
        f'Next-frame gate support: {next_frame["states"]["shared_stage_gate"]} / {n}',
        f'Next-frame signed-gap support: {next_frame["signed_gap_support"]} / {n}',
        f'Next-frame selected no update: {next_frame["states"]["selected_no_update"]} / {n}', '',
        'Geometry is not evidence of correct physical identity.',
        'Missing updates / other stage / end are separate states.',
        'Birth observation indices were not recorded.', '',
        'Decision: no new temporal veto or fitted run length.',
        'Next candidate: past accepted-observation support',
        'with explicit active/retained roles and update protection.']
    ax.text(0, 1, '\n'.join(lines), va='top', fontsize=10, linespacing=1.65)
    ax = axes[1, 0]
    states = ['shared_stage_gate', 'shared_stage_below_gate', 'competitor_other_stage_update',
              'selected_no_update', 'selected_absent', 'competitor_absent', 'sequence_end', 'unanchored_history']
    names = ['same-stage gate support', 'same-stage below gate', 'competitor updated earlier stage',
             'selected no update', 'selected absent', 'competitor absent', 'sequence end', 'unanchored history']
    colors = ['#2463a0', '#bf5925', '#8a6bb1', '#98a7b7', '#4e5b68', '#9b4b5a', '#d7dde4', '#e2bf4d']
    lags = list(summary['lags']); bottom = [0]*len(lags)
    for state, label, color in zip(states, names, colors):
        values = [summary['lags'][lag]['states'][state] for lag in lags]
        if not any(values):
            continue
        ax.bar(lags, values, bottom=bottom, color=color, label=label)
        bottom = [x+y for x, y in zip(bottom, values)]
    ax.set_ylim(0, n*1.05); ax.set_ylabel('Alternatives; denominator unchanged')
    ax.set_xlabel('Lag in original tracker frames, not seconds')
    ax.set_title('B  Support, non-support and unobservability', loc='left', fontsize=11, weight='bold')
    ax.legend(fontsize=8, loc='upper right', bbox_to_anchor=(1, -.17), ncol=2, frameon=False)
    ax = axes[1, 1]; sizes = list(range(31))
    ax.bar(sizes, [summary['gate_prefix_lengths'].get(str(k), 0) for k in sizes], color='#2463a0')
    ax.set_xlabel('Consecutive observed gate-support frames after anchor')
    ax.set_ylabel('Alternatives'); ax.set_xticks([0, 1, 5, 10, 15, 20, 25, 30])
    ax.set_title('C  Stop at first non-support or unknown', loc='left', fontsize=11, weight='bold')
    ax.text(.98, .94, f'{summary["gate_prefix_stops"].get("horizon_end", 0)} reach horizon (right censored)\n'
            f'{summary["gate_support_resumes_after_first_stop"]} later resume gate support\n'
            'Gaps are not filled or joined.', transform=ax.transAxes, ha='right', va='top', fontsize=9)
    fig.suptitle('Frozen effective-update risks and temporal support', x=.025, ha='left', fontsize=16, weight='bold')
    fig.text(.025, .93, '197 reference alternatives · 192 discovery + 5 originally reserved · no tracking, GT, tuning or intervention', fontsize=10)
    fig.text(.025, .023, 'MOTChallenge / MOT16 & MOT20 · CC BY-NC-SA 3.0 · numeric aggregates only · raw diagnostics local; births unrecorded', fontsize=9)
    fig.subplots_adjust(left=.27, right=.98, top=.86, bottom=.22, wspace=.32, hspace=.48)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(a.output, dpi=170, facecolor='white'); plt.close(fig)


if __name__ == '__main__':
    main()
