#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Plot reviewed aggregate metrics only; no media, GT or event identifiers."""
import argparse
import json
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--record', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    r = json.loads(a.record.read_text())
    if r['format'] != 'depthport.recovery-deferral-acceptance.v1':
        p.error('Reviewed recovery-deferral aggregate required')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    methods = [r['methods'][key] for key in ('activation_control', 'defer_competing_recovery')]
    labels = ['Reference', 'Defer competing recovery']
    colors = ['#64748b', '#0f766e']
    fig, axes = plt.subplots(2, 3, figsize=(13, 7.8))
    for ax, (key, title, percent) in zip(axes.flat, [
        ('CLR_FN', 'Missed observations (FN) ↓', False),
        ('CLR_FP', 'False-positive observations (FP) ↓', False),
        ('IDSW', 'Identity switches ↓', False),
        ('IDF1', 'IDF1 (%) ↑', True), ('HOTA', 'HOTA (%) ↑', True),
        ('Frag', 'Fragmentations ↓', False)]):
        values = [v['metrics'][key]*(100 if percent else 1) for v in methods]
        ax.barh(labels, values, color=colors, height=.52)
        ax.invert_yaxis(); ax.set_title(title, loc='left', fontsize=11, weight='bold')
        ax.set_xlim(0, max(values)*1.22)
        for i, value in enumerate(values):
            ax.text(value+max(values)*.025, i, f'{value:,.2f}' if percent else f'{value:,}', va='center', fontsize=10)
        ax.spines[['top', 'right', 'left']].set_visible(False)
        ax.tick_params(axis='y', length=0, labelsize=9)
        ax.grid(axis='x', alpha=.16); ax.set_axisbelow(True)
    fig.suptitle('ByteTrack: independent competition-aware recovery experiment', x=.025,
                 ha='left', fontsize=16, weight='bold')
    fig.text(.025, .922, 'MOT20-01 · 429 consecutive frames · frozen 2-arm protocol · 3 identical repeats per arm', fontsize=11)
    fig.text(.025, .045, '4 deferred edges. Research screen passes; recall remains 13.98%. Long-low-visibility events: 0/9 complete endpoints.', fontsize=10)
    fig.text(.025, .018, 'Source: MOTChallenge / Dendorfer et al., MOT20 · CC BY-NC-SA 3.0 · aggregate metrics only; defaults unchanged.', fontsize=9)
    fig.subplots_adjust(top=.85, bottom=.15, left=.17, right=.97, hspace=.55, wspace=.9)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(a.output, dpi=170, facecolor='white'); plt.close(fig)


if __name__ == '__main__':
    main()
