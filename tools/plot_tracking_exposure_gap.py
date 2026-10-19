#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Render fixed conditional applicability partitions from aggregate counts only."""
import argparse,json
from pathlib import Path


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--summary',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    d=json.loads(a.summary.read_text())
    if d['format']!='depthport.exposure-gap.v1' or d['gt_read'] or d['tracking_rerun'] or d['retuned']:
        p.error('Requires unchanged GT-free read-only aggregate')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    records=[d['combined'][p]['arms']['activation_control']['counts'] for p in ('discovery','confirmation')]
    panels=[('A  Missed rows with weak input','missed_rows_with_weak_input',
             ['missed_rows_no_gate_column','missed_rows_gate_unselected','opportunities'],['No gate-supported column','Gate-supported, unselected','Original accepted opportunity']),
            ('B  Active competition per opportunity','opportunities',
             ['no_active_row','active_rows_below_gate','active_gate_outside_margin','active_competition'],['No other active row','Active rows below target gate','Gate support outside margin','Active gate + margin support']),
            ('C  Past evidence per active alternative','active_alternatives',
             ['past_supported','past_missing','past_ineligible'],['Past accepted support','Missing evidence (unknown)','Observed ineligible evidence']),
            ('D  Protection per active alternative','active_alternatives',
             ['protection_pass','protection_occupied','protection_displaced'],['Other updates protected','Competitor already occupied','Calculated other-update displacement'])]
    colors=['#317ca5','#dc9e37','#a1aeb7','#3a8b6b']
    fig,axes=plt.subplots(2,2,figsize=(13.5,9.4))
    for ax,(title,denom,keys,labels) in zip(axes.flat,panels):
        for row,counts in enumerate(records):
            n=counts[denom];left=0
            if not n:
                ax.text(2,row,'Not reached: denominator 0',va='center',fontsize=10,color='#666')
            for k,label,color in zip(keys,labels,colors):
                value=counts[k];width=100*value/n if n else 0
                ax.barh(row,width,left=left,height=.42,color=color,label=f'{label}: {value}' if row==0 else None)
                if width>=12:ax.text(left+width/2,row,str(value),ha='center',va='center',fontsize=10)
                left+=width
        ax.set_yticks([0,1],[f'MOT discovery (n={records[0][denom]:,})',f'KITTI reserved (n={records[1][denom]:,})'],fontsize=9)
        ax.invert_yaxis();ax.set_xlim(0,100);ax.set_xticks([0,25,50,75,100]);ax.set_xlabel('Percent of each stated denominator; counts shown',fontsize=9)
        ax.set_title(title,loc='left',fontsize=12,weight='bold');ax.legend(loc='upper left',bbox_to_anchor=(0,-.25),frameon=False,fontsize=9)
    fig.suptitle('Exposure gap: the KITTI histories stop before the intervention',x=.02,ha='left',fontsize=16,weight='bold')
    fig.text(.02,.042,'Reference histories · all 18 sources / 18,595 frames · four-arm complete counts in JSON · zero denominators are not rejections',fontsize=10)
    fig.text(.02,.019,'No inference/tracking rerun, GT or scoring · raw diagnostics local · buffer30 is 30-Hz based (native 10/25/30 frames, nominal 1 s)',fontsize=9)
    fig.subplots_adjust(left=.20,right=.98,top=.89,bottom=.24,hspace=1.1,wspace=.65)
    a.output.parent.mkdir(parents=True,exist_ok=True);fig.savefig(a.output,dpi=170,facecolor='white',bbox_inches='tight',pad_inches=.15);plt.close(fig)


if __name__=='__main__':main()
