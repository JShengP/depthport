#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Render aggregate admission-study counts only; reads no media or raw tracks."""
from __future__ import annotations
import argparse
import json
from pathlib import Path


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    record = json.loads(args.record.read_text(encoding='utf-8'))
    if record.get('format') != 'depthport.mot17-admission-acceptance.v1':
        parser.error('Admission aggregate record required')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    profiles = ['default', 'activation_control', 'confirm3', 'confirm5',
                'competition', 'confirm3_competition']
    labels = ['Factory\n2', 'Activation\n2', 'Confirm\n3', 'Confirm\n5',
              'Birth\nveto', 'Confirm 3\n+ veto']
    colors = ['#4878ac', '#75808c', '#d5a12c', '#d17b3e', '#318d84', '#8d6caa']
    combined = record['combined']['all_sequences']
    fig, axes = plt.subplots(2, 3, figsize=(14, 7.5), layout='constrained')
    for row, backend in enumerate(['bytetrack', 'botsort']):
        for col, (key, label) in enumerate([('CLR_FN', 'Missed observations (FN)'),
                                          ('CLR_FP', 'False-positive observations (FP)'),
                                          ('IDSW', 'ID switches')]):
            ax = axes[row, col]
            values = [combined[backend+'__'+p][key] for p in profiles]
            bars = ax.bar(range(len(profiles)), values, color=colors, width=.7)
            ax.bar_label(bars, labels=[f'{v:,}' for v in values], fontsize=9, padding=3)
            ax.set_xticks(range(len(profiles)), labels, fontsize=9)
            ax.set_ylim(0, max(values)*1.18 if max(values) else 1)
            ax.set_title(('ByteTrack' if row == 0 else 'BoT-SORT')+' / '+label,
                         fontsize=11, loc='left', pad=15)
            ax.spines[['top', 'right']].set_visible(False)
            ax.grid(axis='y', alpha=.18)
            ax.set_axisbelow(True)
    fig.suptitle('New-ID admission controls / MOT17-09 and MOT17-10\n'
                 '1,179 continuous frames; 3 repeats; identical YOLO26n 8.4.176 caches',
                 fontsize=15)
    fig.supxlabel('Lower counts are better, but FN/FP/IDSW must be read together. '
                  'Factory activation .70; other arms .30; split .60.\n'
                  'MOTChallenge (CC BY-NC-SA 3.0), local research; aggregates only. '
                  'Previously studied training scenes; defaults unchanged.', fontsize=10)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.output, dpi=140, metadata={'Software': 'DepthPort aggregate plot / Matplotlib'})
    plt.close(fig)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
