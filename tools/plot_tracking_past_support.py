#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Render only the reviewed numeric KITTI past-support aggregate."""
import argparse
import json
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--summary', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args(); data = json.loads(a.summary.read_text())
    if data['format'] != 'depthport.past-support-acceptance.v1' or data['retuned'] or not data['all_predictions_sealed_before_gt']:
        p.error('Requires frozen, unchanged complete aggregate')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np
    scenes = data['sequences']; arms = list(data['group_screens'])
    labels = ['Past only', 'Protection only', 'Both']
    colors = ['#2572a2', '#d48128', '#3c8666']; names = [s['name'] for s in scenes]
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('Frozen past-observation support + update protection', fontsize=17, weight='bold', y=.98)
    ax = axes[0, 0]; x = np.arange(len(scenes))
    maximum = 0
    for i, arm in enumerate(arms):
        values = [s['methods'][arm]['exposure']['counts']['actual_vetoes'] for s in scenes]
        maximum = max(maximum, *values)
        bars = ax.bar(x+(i-1)*.23, values, width=.23, label=labels[i], color=colors[i])
        ax.bar_label(bars, padding=2, fontsize=9)
    ax.set_xticks(x, names); ax.set_ylim(0, max(1, maximum*1.25)); ax.set_ylabel('Actual vetoed selected edges')
    ax.set_title('A  Actual vetoes (all sources retained)', loc='left', fontsize=11, weight='bold')
    ax.legend(frameon=False, fontsize=9)
    ax = axes[0, 1]
    keys = ['active_alternatives', 'past_qualified_alternatives', 'protected_alternatives', 'joint_alternatives']
    values = [sum(s['methods']['activation_control']['exposure']['counts'][k] for s in scenes) for k in keys]
    bars = ax.barh(range(4), values, color=['#758899', *colors]); ax.bar_label(bars, padding=3)
    ax.set_yticks(range(4), ['Active alternatives', 'Past accepted support', 'Other updates protected', 'Both, same competitor'], fontsize=9)
    ax.invert_yaxis(); ax.set_xlim(0, max(1, max(values)*1.25)); ax.set_xlabel('Reference alternatives; correlated observations')
    ax.set_title('B  Qualification in reference history', loc='left', fontsize=11, weight='bold')
    rows = [(s, arm, label) for s in scenes for arm, label in zip(arms, labels)]
    row_labels = [s['name']+' / '+label for s, arm, label in rows]
    for ax, fields, title, percent in [(axes[1, 0], ['CLR_FN', 'CLR_FP', 'IDSW'], 'C  Count changes vs reference', False),
                                     (axes[1, 1], ['IDF1', 'HOTA'], 'D  Score changes vs reference (pp)', True)]:
        values = np.array([[(s['methods'][arm]['metrics'][k]-s['methods']['activation_control']['metrics'][k])*(100 if percent else 1)
                            for k in fields] for s, arm, label in rows])
        limit = max(.001 if percent else 1, float(np.abs(values).max()))
        im = ax.imshow(values, cmap='RdBu', vmin=-limit, vmax=limit, aspect='auto')
        ax.set_yticks(range(len(rows)), row_labels, fontsize=8); ax.set_xticks(range(len(fields)), fields)
        for r in range(len(rows)):
            for c in range(len(fields)):
                ax.text(c, r, f'{values[r,c]:+.4f}' if percent else f'{values[r,c]:+.0f}', ha='center', va='center', fontsize=9)
        ax.set_title(title, loc='left', fontsize=11, weight='bold'); fig.colorbar(im, ax=ax, fraction=.035, pad=.02)
    fig.subplots_adjust(left=.19, right=.96, top=.90, bottom=.16, hspace=.42, wspace=.85)
    fig.text(.02, .035, 'KITTI 0000–0003 · 978 original frames · four arms × three equal repeats · no retuning · raw data local', fontsize=10)
    fig.text(.02, .012, 'Geiger / Lenz / Urtasun, CVPR 2012 · CC BY-NC-SA 3.0 · official TrackEval pedestrian preprocessing; no identity/release acceptance', fontsize=9)
    a.output.parent.mkdir(parents=True, exist_ok=True); fig.savefig(a.output, dpi=170, facecolor='white', bbox_inches='tight', pad_inches=.15); plt.close(fig)


if __name__ == '__main__':
    main()
