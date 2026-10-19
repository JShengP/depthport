#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Numeric-only plot of frozen moving-camera replication; no source imagery."""
import argparse
import json
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--record', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args(); record = json.loads(a.record.read_text())
    if record['format'] != 'depthport.recovery-moving-replication.v1':
        p.error('Moving-camera aggregate required')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(2, 3, figsize=(12, 7.2))
    for row, seq in enumerate(record['sequences']):
        values = [seq['methods'][arm]['metrics'] for arm in ('activation_control', 'defer_competing_recovery')]
        for col, (key, label) in enumerate([('CLR_FN','FN / missed observations'), ('CLR_FP','FP / false positives'), ('IDSW','Identity switches')]):
            ax = axes[row, col]; nums = [v[key] for v in values]
            ax.barh(['Reference','Deferred'], nums, color=['#64748b','#0f766e'], height=.52)
            ax.invert_yaxis(); ax.set_xlim(0, max(nums)*1.24)
            for i, v in enumerate(nums):
                ax.text(v+max(nums)*.025, i, f'{v:,}', va='center', fontsize=11)
            ax.set_title(seq['name']+' · '+label, loc='left', fontsize=10, weight='bold')
            ax.spines[['top','right','left']].set_visible(False); ax.tick_params(axis='y',length=0)
            ax.grid(axis='x', alpha=.15); ax.set_axisbelow(True)
    fig.suptitle('Unchanged ByteTrack recovery control: moving-camera replication',
                 x=.025, ha='left', fontsize=15, weight='bold')
    fig.text(.025,.915,'MOT17-11/13 · 1,650 continuous frames · 2 arms × 3 repeats per scene · 6 deferred edges',fontsize=11)
    fig.text(.025,.075,'Added FN / IDSW: 0 / 0. Added FP: 2; removed FP: 10. Overall frozen screen FAILS.',fontsize=11,weight='bold')
    fig.text(.025,.046,'MOT17-13 HOTA: 24.9588% → 24.9473%. No long-event recovery gain; defaults unchanged.',fontsize=10)
    fig.text(.025,.018,'Source: MOTChallenge / Milan et al. · CC BY-NC-SA 3.0 · earlier benchmark scenes, not an untouched test set.',fontsize=9)
    fig.subplots_adjust(top=.83,bottom=.19,left=.1,right=.97,wspace=.65,hspace=.65)
    a.output.parent.mkdir(parents=True,exist_ok=True)
    fig.savefig(a.output,dpi=170,facecolor='white'); plt.close(fig)


if __name__ == '__main__':
    main()
