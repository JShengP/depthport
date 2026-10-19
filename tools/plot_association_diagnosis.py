#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Plot reviewed aggregate association evidence; never opens raw trace files."""
import argparse
import json
from pathlib import Path


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--record',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args(argv);r=json.loads(a.record.read_text())
    if r.get('format')!='depthport.association-diagnosis.v1':p.error('Association aggregate required')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    methods=['bytetrack__activation_control','bytetrack__confirm3','botsort__activation_control','botsort__confirm3']
    labels=['ByteTrack\ncontrol','ByteTrack\nconfirm 3','BoT-SORT\ncontrol','BoT-SORT\nconfirm 3']
    colors={'tp':'#3d9680','tp_same_previous_gt':'#3d9680','tp_different_previous_gt':'#db9b42',
            'fp':'#986fa4','excluded':'#b7bcc4','tp_no_previous_identity':'#689ec5'}
    fig,axes=plt.subplots(2,2,figsize=(14,9),layout='constrained')
    def stacked(ax,groups,names,xticks,title,legend_names=None):
        bottom=[0]*len(groups)
        for name in names:
            vals=[g.get(name,0) for g in groups]
            bars=ax.bar(range(len(groups)),vals,bottom=bottom,color=colors.get(name,'#75808c'),
                        label=(legend_names or {}).get(name,name))
            for b,v in zip(bars,vals):
                if v>=5:ax.text(b.get_x()+b.get_width()/2,b.get_y()+v/2,str(v),ha='center',va='center',fontsize=9)
            bottom=[x+y for x,y in zip(bottom,vals)]
        for i,v in enumerate(bottom):ax.text(i,v+max(bottom)*.02,f'n={v:,}',ha='center',fontsize=10)
        ax.set_ylim(0,max(bottom)*1.22);ax.set_xticks(range(len(groups)),xticks,fontsize=9)
        ax.set_title(title,loc='left',fontsize=12,pad=16);ax.spines[['top','right']].set_visible(False)
        ax.grid(axis='y',alpha=.15);ax.set_axisbelow(True)
        return ax
    promotion=[{k:r['methods'][m]['counts'].get('promotion_'+k,0) for k in ['tp','fp','excluded']} for m in methods]
    stacked(axes[0,0],promotion,['tp','fp','excluded'],labels,'Promotion outcomes (instant births excluded)',
            {'tp':'Official TP','fp':'Official FP','excluded':'Excluded by MOT preprocessing'})
    axes[0,0].legend(fontsize=8,loc='upper right')
    kinds=['tp_same_previous_gt','tp_different_previous_gt','fp','tp_no_previous_identity','excluded']
    names={'tp_same_previous_gt':'TP / same previous GT','tp_different_previous_gt':'TP / different previous GT',
           'fp':'Official FP','tp_no_previous_identity':'TP / no prior GT','excluded':'Excluded'}
    recovery=[{k:r['methods'][m]['counts'].get('recovery_'+k,0) for k in kinds} for m in methods]
    stacked(axes[0,1],recovery,kinds,labels,'Missed-frame recovery outcomes',names)
    axes[0,1].legend(fontsize=8,loc='upper right')
    stage=r['stage_breakdown']['methods']['bytetrack__activation_control']
    groups=[]
    for suffix in ['events','ambiguous','active_confirmed_other_hypothesis']:
        groups.append({k:stage.get('weak_remaining:recovery:'+k+':'+suffix,0) for k in kinds})
    stacked(axes[1,0],groups,kinds,['All weak-stage\nrecoveries','Low-margin\nsubset','+ active competitor\nsubset'],
            'ByteTrack control: diagnostic subsets, not a treatment',names)
    reasons=['no_previous_official_tp','gt_not_annotated','no_raw_geometric_support','weak_only_geometric_support',
             'strong_support_below_high_stage_gate','strong_support_admissible_not_selected','strong_support_selected_for_hypothesis']
    palette=['#647487','#c2c7cc','#929ba7','#609aba','#d9a251','#996fa2','#419682']
    reason_labels=['No prior official TP','GT absent','No raw IoU .5 support','Only weak support',
                   'Strong support below gate','Strong admissible / not selected','Strong support / selected']
    ax=axes[1,1];bottom=[0,0]
    for key,label,color in zip(reasons,reason_labels,palette):
        vals=[r['methods'][m]['counts'].get('opportunity_'+key,0) for m in [methods[0],methods[2]]]
        bars=ax.bar([0,1],vals,bottom=bottom,color=color,label=label,width=.55)
        for b,v in zip(bars,vals):
            if v>=100:ax.text(b.get_x()+b.get_width()/2,b.get_y()+v/2,str(v),ha='center',va='center',fontsize=9)
        bottom=[x+y for x,y in zip(bottom,vals)]
    ax.set_xticks([0,1],['ByteTrack control','BoT-SORT control'],fontsize=9)
    ax.set_title('Recovery opportunities: frames x retained hypotheses',loc='left',fontsize=12,pad=16)
    ax.spines[['top','right']].set_visible(False);ax.grid(axis='y',alpha=.15);ax.set_axisbelow(True)
    ax.legend(fontsize=7,loc='upper left',bbox_to_anchor=(1.01,1),frameon=False)
    ax.set_ylim(0,max(bottom)*1.2)
    for i,v in enumerate(bottom):ax.text(i,v+max(bottom)*.02,f'n={v:,}',ha='center',fontsize=10)
    fig.suptitle('Association-cost diagnosis / MOT17-09 and MOT17-10\n'
                 '1,179 frames; 4 configurations; 2 repeats; exact original predictions retained',fontsize=15)
    fig.supxlabel('MOTChallenge / CC BY-NC-SA 3.0, local research; aggregate evidence only. '
                  'Correlated training-scene observations, not independent people.\n'
                  'No control intervention or accuracy gain claimed; weak continuation and defaults unchanged.',fontsize=10)
    a.output.parent.mkdir(parents=True,exist_ok=True)
    fig.savefig(a.output,dpi=140,metadata={'Software':'DepthPort aggregate plot / Matplotlib'});plt.close(fig)


if __name__=='__main__':main()
