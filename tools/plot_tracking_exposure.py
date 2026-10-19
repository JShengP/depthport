#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Plot complete reviewed exposure ledgers only; no GT, images or raw IDs."""
import argparse,json
from pathlib import Path


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for n in ('discovery','confirmation','output'):p.add_argument('--'+n,type=Path,required=True)
    a=p.parse_args();d=json.loads(a.discovery.read_text());c=json.loads(a.confirmation.read_text())
    if d['phase']!='discovery' or c['phase']!='confirmation':p.error('Separated phase ledgers required')
    if d['protocol_sha256']!=c['protocol_sha256']:p.error('Different frozen protocols')
    rows=d['ledger']+c['ledger']
    if any(r['status']!='completed' for r in rows):p.error('Figure requires complete records; report failures in prose first')
    import numpy as np
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    arms=['activation_control','defer_available_competitor','defer_equivalent_assignment']
    values=np.array([[r['arms'][a]['counts']['legacy_eligible_edges' if i==0 else 'actual_vetoes']
                      for i,a in enumerate(arms)] for r in rows])
    fig,(ax,notes)=plt.subplots(1,2,figsize=(12,10),gridspec_kw={'width_ratios':[1.35,1]})
    ax.imshow(np.log1p(values),cmap='YlGnBu',aspect='auto',vmin=0,vmax=max(1.,float(np.log1p(values).max())))
    ax.set_xticks(range(3),['Legacy candidates\n(reference)','Availability\n(actual vetoes)','Equivalent\n(actual vetoes)'],fontsize=9)
    ax.set_yticks(range(len(rows)),[r['name'] for r in rows],fontsize=10)
    for (i,j),v in np.ndenumerate(values):ax.text(j,i,str(v),ha='center',va='center',color='white' if np.log1p(v)>max(1.,float(np.log1p(values).max()))*.55 else '#0f172a',fontsize=11)
    cut=len(d['ledger'])-.5;ax.axhline(cut,color='#b45309',linewidth=2)
    ax.set_title('All frozen sources; zeros retained',loc='left',weight='bold',pad=18)
    notes.axis('off');text=['Discovery: '+str(len(d['ledger']))+' full sequences',
        'Reserved confirmation: '+str(len(c['ledger']))+' full sequences','',
        'First qualifying discovery source per arm:']
    for key,label in zip(arms[1:],['Availability','Equivalent']):
        text += [label+': '+str(d['selection'][key] or 'not found')]
    text += ['','Exposure replicated in both reserved sources:']
    for key,label in zip(arms[1:],['Availability','Equivalent']):
        text += [label+': '+('yes' if c['confirmation'][key]['replicated_in_both_reserved_scenes'] else 'no')]
    text += ['','Each arm uses its own continuous history.','Three equal repeats per arm/source.',
             'Repeats do not add independent exposure.','','No GT, FP/FN, IDSW or HOTA is read.',
             'No thresholds or weak detections changed.','Exposure does not establish accuracy.']
    notes.text(.02,.98,'\n'.join(text),va='top',fontsize=11,linespacing=1.65)
    fig.suptitle('GT-free competition exposure: discovery and reserved confirmation',x=.025,ha='left',fontsize=15,weight='bold')
    fig.text(.025,.935,'Frozen complete cohort · 17,984 source frames · 3 arms × 3 repeats × 16 sources · raw diagnoses local',fontsize=10)
    fig.text(.025,.04,'Sources: MOTChallenge / MOT16 & MOT20 · CC BY-NC-SA 3.0 · numeric aggregates only; defaults unchanged.',fontsize=9)
    fig.subplots_adjust(left=.18,right=.98,top=.86,bottom=.13,wspace=.28)
    a.output.parent.mkdir(parents=True,exist_ok=True);fig.savefig(a.output,dpi=170,facecolor='white');plt.close(fig)


if __name__=='__main__':main()
