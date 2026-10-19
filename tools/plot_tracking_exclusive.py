#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Numeric-only frozen competition result figure; no media or raw cases."""
import argparse
import json
from pathlib import Path


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--record',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();r=json.loads(a.record.read_text())
    if r['format']!='depthport.exclusive-competition-acceptance.v1':
        p.error('Frozen competition aggregate required')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    arms=list(r['methods']);ref=r['methods'][arms[0]]['metrics']
    labels=['Legacy deferral','Available competitor','Equivalent assignment']
    colors=['#b45309','#0f766e','#2563eb']
    fig,axes=plt.subplots(1,3,figsize=(13,5.6))
    ax=axes[0];xs=list(range(3))
    for j,(key,title) in enumerate([('CLR_FP','FP'),('CLR_FN','FN'),('IDSW','IDSW')]):
        vals=[r['methods'][arm]['metrics'][key]-ref[key] for arm in arms[1:]]
        at=[x+(j-1)*.23 for x in xs]
        ax.bar(at,vals,width=.22,label=title,color=['#64748b','#b45309','#0f766e'][j])
        for x,v in zip(at,vals): ax.text(x,v+(.12 if v>=0 else -.45),str(v),ha='center',fontsize=9)
    ax.axhline(0,color='#94a3b8',linewidth=.7);ax.set_ylim(-2,7.5)
    ax.set_xticks(xs,['Legacy','Available','Equivalent']);ax.legend(frameon=False,ncol=3,loc='upper right',fontsize=8)
    ax.set_title('Error change versus reference',loc='left',weight='bold',fontsize=11)
    ax.set_ylabel('Observation / switch count change')
    ax=axes[1];vals=[100*r['methods'][arm]['metrics']['HOTA'] for arm in arms]
    ax.barh(['Reference','Legacy','Available','Equivalent'],vals,color=['#64748b']+colors)
    ax.invert_yaxis();ax.set_xlim(0,36)
    for i,v in enumerate(vals):ax.text(v+.3,i,f'{v:.4f}%',va='center',fontsize=9)
    ax.set_title('Official HOTA',loc='left',weight='bold',fontsize=11)
    ax.set_xlabel('HOTA (%)')
    ax=axes[2];vals=[r['methods'][arm]['deferred_edges'] for arm in arms[1:]]
    ax.barh(labels,vals,color=colors);ax.invert_yaxis();ax.set_xlim(0,1.5)
    for i,v in enumerate(vals):ax.text(v+.04,i,str(v),va='center')
    ax.set_title('Actual vetoes on own history',loc='left',weight='bold',fontsize=11)
    ax.set_xlabel('Zero new-control exposure is inconclusive')
    for ax in axes:
        ax.spines[['top','right']].set_visible(False)
    fig.suptitle('Exclusive competition: fresh cache, no accepted fix',x=.025,ha='left',fontsize=15,weight='bold')
    fig.text(.025,.89,'Previously studied MOT17-04-DPM · fresh 8.4.176 cache · 1,050 frames · 4 arms / 3 repeats',fontsize=10)
    fig.text(.025,.10,'Legacy: FP unchanged, +6 misses, −1 switch; HOTA rises. New controls exactly equal reference with zero vetoes.',fontsize=10)
    fig.text(.025,.045,'Source: MOTChallenge / MOT16 · CC BY-NC-SA 3.0 · numeric aggregates only; raw diagnostics stay local. Defaults unchanged.',fontsize=9)
    fig.subplots_adjust(left=.065,right=.98,top=.77,bottom=.26,wspace=.75)
    a.output.parent.mkdir(parents=True,exist_ok=True);fig.savefig(a.output,dpi=170,facecolor='white');plt.close(fig)


if __name__=='__main__':main()
