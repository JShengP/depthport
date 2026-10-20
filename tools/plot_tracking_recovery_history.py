#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Plot only reviewed aggregate history counts and HOTA threshold deltas."""
import argparse
import json
from pathlib import Path


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--record',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();r=json.loads(a.record.read_text())
    if r['format']!='depthport.recovery-history-diagnosis.v1':p.error('History aggregate required')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    scenes={s['name']:s for s in r['sequences']};static=scenes['MOT20-01']['history'];bus=scenes['MOT17-13-DPM']
    fig,axes=plt.subplots(2,2,figsize=(12,8))
    ax=axes[0,0];counts=[static['added_fn_history'][k] for k in
        ('direct_current_deferral','reference_detection_not_emitted_without_current_deferral','reference_detection_still_emitted')]
    ax.barh(['Direct deferral','Unmatched weak output','Retained; other GT match'],counts,color=['#b45309','#0f766e','#64748b'])
    ax.invert_yaxis();ax.set_xlim(0,15);ax.set_title('MOT20-01: 22 added misses',loc='left',weight='bold')
    for i,v in enumerate(counts):ax.text(v+.2,i,str(v),va='center')
    ax=axes[0,1];counts=[static['added_fn_history']['unemitted_no_admissible_row'],
                         static['added_fn_history']['unemitted_admissible_rows_all_assigned_elsewhere']]
    ax.barh(['No admissible row','Other eligible rows busy'],counts,color=['#0f766e','#64748b'])
    ax.invert_yaxis();ax.set_xlim(0,10);ax.set_title('12 unmatched: root still alive, below gate',loc='left',weight='bold',fontsize=11)
    for i,v in enumerate(counts):ax.text(v+.15,i,str(v),va='center')
    ax=axes[1,0];points=bus['hota_threshold_changes'];xs=[v['alpha'] for v in points];ys=[100*v['delta_hota'] for v in points]
    ax.axhline(0,color='#64748b',linewidth=.8);ax.axvspan(.025,.375,color='#fef3c7')
    ax.plot(xs,ys,marker='o',color='#b45309',markersize=4);ax.set_xlabel('HOTA localisation threshold');ax.set_ylabel('HOTA change (percentage points)')
    ax.set_title('Bus view: losses at IoU .05–.35',loc='left',weight='bold');ax.grid(alpha=.15)
    ax=axes[1,1];tp=sum(s['history']['deferrals'].get('reference_tp',0) for s in r['sequences']);fp=sum(s['history']['deferrals'].get('reference_fp',0) for s in r['sequences'])
    ax.barh(['Reference CLEAR TP','Reference CLEAR FP'],[tp,fp],color=['#b45309','#0f766e'])
    ax.invert_yaxis();ax.set_xlim(0,10);ax.set_title('All 10 deferral decisions:\ncompetitors assigned elsewhere',loc='left',weight='bold',fontsize=11)
    for i,v in enumerate([tp,fp]):ax.text(v+.15,i,str(v),va='center')
    for ax in axes.flat:
        ax.spines[['top','right']].set_visible(False)
    fig.suptitle('Recovery deferral: state, assignment history and metric trade-offs',x=.025,ha='left',fontsize=15,weight='bold')
    fig.text(.025,.922,'Frozen outputs only · 3 scenes · no tracker/inference run or parameter change',fontsize=11)
    fig.text(.025,.055,'Added switch: same prefix-equivalent transition shifts by one frame. Alternative-policy gains remain untested.',fontsize=10)
    fig.text(.025,.024,'Sources: MOTChallenge / MOT16 & MOT20 · CC BY-NC-SA 3.0 · numeric aggregates only; original diagnoses stay local.',fontsize=9)
    fig.subplots_adjust(top=.84,bottom=.18,left=.19,right=.98,wspace=.75,hspace=.55)
    a.output.parent.mkdir(parents=True,exist_ok=True);fig.savefig(a.output,dpi=170,facecolor='white');plt.close(fig)


if __name__=='__main__':main()
