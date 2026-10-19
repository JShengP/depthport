#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Deterministic post-processing of local traces; only aggregate labels escape."""
from __future__ import annotations
import argparse
from collections import Counter,defaultdict
import json
from pathlib import Path
import re
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from tools.diagnose_tracking_association import read_json,METHODS
from depthport.video_tracking_benchmark import sha256_file

STAGES={'high_all','weak_remaining','high_confirmed_lost','weak_tracked','unconfirmed_high'}
OUTCOMES={'tp','fp','excluded','not_emitted','tp_same_previous_gt','tp_different_previous_gt','tp_no_previous_identity'}


def summarize_events(frames, events):
    """Fixed .05 diagnostic margin, never a runtime veto or a GT-fed tracker."""
    by_frame=defaultdict(list);counts=Counter()
    for event in events:
        if event['kind'] in ('promotion','recovery'):
            by_frame[event['frame']].append(event)
    processed=0
    for frame in frames:
        for event in by_frame[frame['frame']]:
            stage=frame['stages'][event['stage']];name=stage['name']
            outcome=event['outcome'];kind=event['kind'];r,c=event['row'],event['column']
            if name not in STAGES or outcome not in OUTCOMES:
                raise ValueError('Unexpected diagnostic label')
            if [r,c] not in stage['matched'] or event['token']!=stage['tracks'][r]['token']:
                raise ValueError('Post-hoc event does not match captured assignment')
            prefix=name+':'+kind+':'+outcome
            counts[prefix+':events']+=1;processed+=1
            if not event['competition']['ambiguous']:
                continue
            counts[prefix+':ambiguous']+=1
            sim=stage['similarity'];selected=sim[r][c];gate=stage['gate'];types=set()
            for i,track in enumerate(stage['tracks']):
                if i!=r and sim[i][c]>=gate and selected-sim[i][c]<=.05:
                    types.add('tentative_other_hypothesis' if track['tracker_id']<0 else
                              'missed_confirmed_other_hypothesis' if track['age_since_update']>=2 else
                              'active_confirmed_other_hypothesis')
            if any(j!=c and s>=gate and selected-s<=.05 for j,s in enumerate(sim[r])):
                types.add('same_hypothesis_other_detection')
            if not types:raise ValueError('Ambiguous event lacks diagnostic alternative')
            for label in types:counts[prefix+':'+label]+=1
    if processed!=sum(map(len,by_frame.values())):
        raise ValueError('Some events have no trace frame')
    return counts


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('record','work-dir','output'):p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args(argv);record=read_json(a.record)
    if record.get('format')!='depthport.association-diagnosis.v1' or a.output.is_symlink():
        p.error('Association record and non-symlink output required')
    combined=defaultdict(Counter);sequences=[]
    for seq in record['sequences']:
        name=seq['name']
        if not re.fullmatch(r'MOT17-\d{2}-(DPM|FRCNN|SDP)',name):raise ValueError('Unexpected sequence label')
        result={'name':name,'methods':{}}
        for method in METHODS:
            trace=a.work_dir/name/(method+'-trace.local.jsonl')
            if trace.is_symlink() or sha256_file(trace)!=seq['methods'][method]['local_trace_sha256']:
                raise ValueError('Captured trace differs from verified run')
            events=read_json(a.work_dir/name/(method+'-events.local.json'))
            with trace.open(encoding='utf-8') as file:
                counts=summarize_events((json.loads(line) for line in file),events)
            expected=seq['methods'][method]['counts']
            for kind in ('promotion','recovery'):
                total=sum(n for k,n in counts.items() if ':'+kind+':' in k and k.endswith(':events'))
                if total!=expected.get(kind+'_total',0):raise ValueError('Stage totals differ from base diagnosis')
            result['methods'][method]=dict(sorted(counts.items()));combined[method].update(counts)
        sequences.append(result)
    report={'format':'depthport.association-stage-summary.v1','input_record_sha256':sha256_file(a.record),
        'method':'Deterministic post-processing of frozen local traces/events, .05 margin; no new tracker run or control search. Competitor types can co-occur.',
        'sequences':sequences,'methods':{m:dict(sorted(c.items())) for m,c in combined.items()},
        'public_scope':'Fixed stage/outcome/competitor labels and aggregate counts only; all source event identities stay local.'}
    a.output.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    return 0


if __name__=='__main__':raise SystemExit(main())
