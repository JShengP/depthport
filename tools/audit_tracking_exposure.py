#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Post-selection GT-free reason counts; no change to frozen selection.

Read hash-verified local traces. Export only count/range aggregates, never raw
matrices, frames or IDs. Objective costs are not calibrated quality scores.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.video_tracking_benchmark import sha256_file
from depthport.tracking_exclusive_control import OBJECTIVE_ATOL


def summarize(lines):
    reasons=Counter();positive=[];vetoes=0
    for frame in lines:
        vetoes+=len(frame['deferred'])
        if len(frame['deferred'])!=sum(e['veto'] for e in frame['competition_audit']):
            raise ValueError('Decision count differs')
        for edge in frame['competition_audit']:
            for c in edge['competitors']:
                loss=c['similarity_sum_loss'];change=c['admissible_pair_change']
                equivalent=loss<=OBJECTIVE_ATOL and change>=0
                if bool(c['equivalent'])!=equivalent:raise ValueError('Equivalence flag differs')
                if loss>OBJECTIVE_ATOL:
                    reasons['positive_objective_loss']+=1;positive.append(loss)
                elif change<0:reasons['same_objective_fewer_admissible_pairs']+=1
                else:reasons['equivalent_alternative']+=1
    return {'actual_vetoes':vetoes,'alternative_reasons':{k:reasons[k] for k in
        ('positive_objective_loss','same_objective_fewer_admissible_pairs','equivalent_alternative')},
        'positive_loss_range':{'min':min(positive),'max':max(positive)} if positive else None}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--phase',nargs=2,action='append',metavar=('RECORD','RAW_DIRECTORY'),required=True)
    p.add_argument('--output',type=Path,required=True);a=p.parse_args();phases=[]
    for record,raw in a.phase:
        r=json.loads(Path(record).read_text());scenes=[]
        for s in r['ledger']:
            if s['status']!='completed':raise ValueError('Only complete ledger can be audited')
            arms={}
            for arm,v in s['arms'].items():
                path=Path(raw)/s['name']/(arm+'-trace.local.jsonl')
                if sha256_file(path)!=v['trace_sha256']:raise ValueError('Raw trace hash differs')
                with path.open() as f:summary=summarize(json.loads(line) for line in f)
                if summary['actual_vetoes']!=v['counts']['actual_vetoes']:raise ValueError('Veto total differs')
                if sum(summary['alternative_reasons'].values())!=v['counts']['competitor_alternatives']:
                    raise ValueError('Alternative total differs')
                arms[arm]=summary
            scenes.append({'name':s['name'],'arms':arms})
        phases.append({'phase':r['phase'],'record_sha256':sha256_file(Path(record)),'sequences':scenes})
    result={'format':'depthport.exposure-reason-audit.v1','scope':'Post-selection descriptive counts, not selection criteria or accuracy scores. No retuning. Raw traces local.',
        'objective_atol':OBJECTIVE_ATOL,'gt_read':False,'phases':phases}
    a.output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')


if __name__=='__main__':main()
