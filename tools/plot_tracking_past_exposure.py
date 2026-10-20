#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Only numeric GT-free exposure ledgers; no source media or raw diagnostics."""
import argparse
import json
from pathlib import Path


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('discovery','confirmation','output'):
        p.add_argument('--'+arg,type=Path,required=True)
    a=p.parse_args();d=json.loads(a.discovery.read_text());c=json.loads(a.confirmation.read_text())
    if any(x['format']!='depthport.past-exposure.v1' or x['gt_read'] or x['accuracy_scoring'] or x['retuned'] for x in (d,c)):
        p.error('Requires unchanged GT-free ledgers')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np
    arms=list(d['selection']);labels=['Past support only','Update protection only','Both, same competitor']
    colors=['#2676a8','#d48631','#3a8a69']
    fig=plt.figure(figsize=(12.5,11));grid=fig.add_gridspec(2,2,width_ratios=[1.3,1],height_ratios=[1,1])
    left=fig.add_subplot(grid[:,0]);right=fig.add_subplot(grid[0,1]);text=fig.add_subplot(grid[1,1])
    def bars(ax,ledger,title):
        y=np.arange(len(ledger));max_value=0
        for i,arm in enumerate(arms):
            values=[r['arms'][arm]['counts']['actual_vetoes'] if r['status']=='completed' else np.nan for r in ledger]
            max_value=max(max_value,max((v for v in values if np.isfinite(v)),default=0))
            b=ax.barh(y+(i-1)*.23,values,height=.22,label=labels[i],color=colors[i]);ax.bar_label(b,padding=2,fontsize=8)
        ax.set_yticks(y,[r['name'] for r in ledger],fontsize=9);ax.invert_yaxis();ax.set_xlim(0,max(1,max_value*1.25))
        for i,r in enumerate(ledger):
            if r['status']!='completed':ax.text(.01,i,'FAILED / unknown',transform=ax.get_yaxis_transform(),fontsize=9,color='#a33')
        ax.set_xlabel('Actual vetoes on each arm\'s own history',fontsize=10);ax.set_title(title,loc='left',weight='bold',fontsize=11)
    bars(left,d['ledger'],'A  Complete frozen discovery order')
    bars(right,c['ledger'],'B  Both untouched reserved sources')
    left.legend(frameon=False,fontsize=9,loc='lower right')
    text.axis('off');lines=['C  Frozen selection and confirmation','']
    for arm,label in zip(arms,labels):
        chosen=d['selection'][arm] or 'none'
        replicated=c['confirmation'][arm]['exposure_replicated_in_both_reserved']
        lines.extend([label, '  First qualifying: '+chosen, '  Replicated in both reserved: '+str(replicated),''])
    lines.extend(['All zeros and failures retained.','Exposure is not accuracy or identity benefit.','No GT/scoring calls or parameter tuning.','Raw frames, IDs, histories and matrices local.'])
    text.text(0,1,'\n'.join(lines),va='top',fontsize=10,linespacing=1.45)
    fig.suptitle('Same causal rule: GT-free exposure discovery + reserved confirmation',x=.02,ha='left',fontsize=15,weight='bold')
    fig.text(.02,.035,'MOT discovery previously seen · new KITTI0004/0005 reserved before outputs · fixed detector/control and weak continuation',fontsize=9)
    fig.text(.02,.012,'MOTChallenge / KITTI · CC BY-NC-SA 3.0 · numeric aggregates only · local noncommercial research; no media redistribution',fontsize=9)
    fig.subplots_adjust(left=.16,right=.98,top=.92,bottom=.11,wspace=.48,hspace=.45)
    a.output.parent.mkdir(parents=True,exist_ok=True);fig.savefig(a.output,dpi=170,facecolor='white',bbox_inches='tight',pad_inches=.15);plt.close(fig)


if __name__=='__main__':
    main()
