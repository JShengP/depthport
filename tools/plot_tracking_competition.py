#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Plot reviewed numeric aggregates only; no per-frame coordinates or media."""
import argparse
import json
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--summary', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args(); d = json.loads(a.summary.read_text())
    if d['format'] != 'depthport.competition-structure.v1' or d['gt_read'] or d['retuned']:
        p.error('Requires unchanged GT-free structure summary')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D
    fig, axes = plt.subplots(2, 2, figsize=(12, 8.6))
    colors = {'occupied': '#2463a0', 'available': '#c05a24'}
    ax = axes[0, 0]
    for offset, (group, color) in zip((.16, -.16), colors.items()):
        summary = d['by_occupancy'][group]
        for i, key in enumerate(('column_gap', 'objective_loss', 'other_assignment_cost')):
            q = summary['distributions'][key]; y = 2 - i + offset
            ax.plot([q['min'], q['max']], [y, y], color=color, lw=1, alpha=.6)
            ax.plot([q['q25'], q['q75']], [y, y], color=color, lw=7, solid_capstyle='butt')
            ax.plot(q['median'], y, '|', color='white', ms=11, mew=2)
    ax.axvline(0, color='#64748b', lw=.8)
    ax.set_yticks([2, 1, 0], ['Same-column gap δ', 'Full objective loss C', 'Other assignment cost R'])
    ax.set_xlabel('Similarity sum units; C = δ + R')
    ax.set_title('A  Local advantage can cost other assignments', loc='left', fontsize=11, weight='bold')
    ax.legend(handles=[Line2D([0], [0], color=v, lw=5, label=f'{k} (n={d["by_occupancy"][k]["alternatives"]})')
                       for k, v in colors.items()], fontsize=9, loc='upper right')
    ax = axes[0, 1]; combined = d['combined']
    sizes = sorted(map(int, combined['component_rows']))
    labels = [f'{n} rows' for n in sizes]
    values = [combined['component_rows'][str(n)] for n in sizes]
    bars = ax.bar(labels, values, color='#2463a0')
    ax.bar_label(bars, padding=3); ax.set_ylim(0, max(values) * 1.2)
    ax.set_ylabel('Alternatives')
    ax.set_title('B  Only the target exchange component', loc='left', fontsize=11, weight='bold')
    ax.text(.98, .91, f'{combined["component_kind"].get("cycle", 0)} cycles / {combined["component_kind"].get("path", 0)} paths\n{combined["outside_component_changes"]} alternatives also change unrelated ties',
            transform=ax.transAxes, ha='right', va='top', fontsize=9)
    ax = axes[1, 0]
    categories = ['Same count, same\nupdated row set', 'Same count, different\nupdated row set', 'One fewer\naccepted update']
    different = combined['equal_count_different_updated_rows']
    same = combined['accepted_count_change'].get('0', 0) - different
    vals = [same, different, combined['accepted_count_change'].get('-1', 0)]
    bars = ax.bar(categories, vals, color=['#2463a0', '#c05a24', '#9f3b40'])
    ax.bar_label(bars, padding=3); ax.set_ylim(0, max(vals) * 1.2)
    ax.set_ylabel('Alternatives'); ax.tick_params(axis='x', labelsize=9)
    ax.set_title('C  Pair count does not identify who is updated', loc='left', fontsize=11, weight='bold')
    ax = axes[1, 1]; ax.axis('off')
    edges = sum(s['candidate_edges'] for phase in d['phases'] for s in phase['sequences'])
    frames = sum(s['candidate_frames'] for phase in d['phases'] for s in phase['sequences'])
    discovery, confirmation = [p['summary']['alternatives'] for p in d['phases']]
    lines = [f'{combined["alternatives"]} alternatives / {edges} selected edges / {frames} frames',
             f'{discovery} discovery + {confirmation} reserved-confirmation alternatives',
             f'Exact objective ties (atol 1e-12): {combined["exact_objective_ties"]}', '',
             f'{combined["negative_column_gap"]} competitors score higher in the target column.',
             f'{combined["column_gap_below_negative_legacy_margin"]} gaps below −{d["historical_signed_column_margin"]} (one-sided legacy rule).',
             f'{combined["selected_row_loses_update"]} alternatives stop updating the selected missed row.',
             f'{combined["nonzero_rejected_contribution"]} losses include a nonzero below-gate contribution.', '',
             'Next: effective update displacement + temporal stability.',
             'Exact ties are not validated identity ambiguity.',
             'No GT, tracking rerun, tuning or default promotion.']
    ax.text(0, .98, '\n'.join(lines), va='top', fontsize=10, linespacing=1.55)
    fig.suptitle('Frozen ByteTrack alternatives: cost and competition structure', x=.025, ha='left', fontsize=15, weight='bold')
    fig.text(.025, .927, 'Post-selection mechanism diagnosis · whiskers: range; thick bars: quartiles; white mark: median', fontsize=10)
    fig.text(.025, .025, 'MOTChallenge / MOT16 & MOT20 · CC BY-NC-SA 3.0 · aggregate numbers only · raw traces stay local', fontsize=9)
    fig.subplots_adjust(left=.18, right=.98, top=.86, bottom=.12, wspace=.38, hspace=.48)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(a.output, dpi=170, facecolor='white'); plt.close(fig)


if __name__ == '__main__':
    main()
