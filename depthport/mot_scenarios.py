# SPDX-License-Identifier: AGPL-3.0-only
"""GT-only scenario proxies and endpoint diagnostics, separate from MOT metrics.

These are visibility/box-order proxies, not physical occlusion or 3D motion truth.
Events never depend on tracker predictions. Raw events and matches stay local.
"""
from __future__ import annotations

from collections import defaultdict
import math
from pathlib import Path


def read_mot_gt(path: Path, frame_count: int) -> list[dict]:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 32*1024*1024:
        raise ValueError('MOT GT must be a regular local file <=32 MiB')
    rows=[]; seen=set()
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        v=[float(x) for x in line.split(',')]
        if len(v)!=9 or not all(math.isfinite(x) for x in v):
            raise ValueError('Expected nine finite MOT17 GT columns')
        f,ident,x,y,w,h,mark,cls,visibility=v
        if any(x!=int(x) for x in (f,ident,mark,cls)) or not 1<=f<=frame_count or ident<0 or w<=0 or h<=0 or not 0<=visibility<=1:
            raise ValueError('Invalid MOT17 GT row')
        key=(int(f),int(ident))
        if key in seen:
            raise ValueError('Duplicate frame/GT identity')
        seen.add(key)
        if mark and cls==1:
            rows.append({'frame':int(f),'id':int(ident),'bbox':[x,y,w,h],'visibility':visibility})
    return rows


def _runs(indices, gap=1):
    groups=[]
    for index in sorted(indices):
        if not groups or index-groups[-1][-1]>gap:
            groups.append([])
        groups[-1].append(index)
    return groups


def _iou(a,b):
    x,y,w,h=a; xx,yy,ww,hh=b
    inter=max(0,min(x+w,xx+ww)-max(x,xx))*max(0,min(y+h,yy+hh)-max(y,yy))
    return inter/(w*h+ww*hh-inter)


def scenario_events(rows: list[dict], fps: float) -> dict:
    """Predeclared: <=0.3 visibility >=1s; overlap IoU>=.1 + x-order flip.

    Both require >=.6 visibility anchors within one second on either side.
    Crossing overlap groups merge gaps <=.5s. No tracker result is consulted.
    """
    if not isinstance(fps,(float,int)) or isinstance(fps,bool) or not math.isfinite(fps) or not 0<fps<=240:
        raise ValueError('Invalid FPS')
    tracks=defaultdict(dict); frames=defaultdict(list)
    for row in rows:
        tracks[row['id']][row['frame']]=row
        if row['visibility']>=.3:
            frames[row['frame']].append(row)
    window=math.ceil(fps); low=[]; crosses=[]
    def anchors(ids,start,end):
        common=set.intersection(*(set(tracks[i]) for i in ids))
        visible=sorted(f for f in common if all(tracks[i][f]['visibility']>=.6 for i in ids))
        return ([f for f in visible if start-window<=f<start],
                [f for f in visible if end<f<=end+window])
    for ident,track in sorted(tracks.items()):
        for run in _runs(f for f,r in track.items() if r['visibility']<=.3):
            if len(run)<math.ceil(fps):
                continue
            before,after=anchors([ident],run[0],run[-1])
            if before and after:
                low.append({'ids':[ident],'start':run[0],'end':run[-1],
                            'before':before,'after':after})
    overlaps=defaultdict(list)
    for frame,items in sorted(frames.items()):
        items=sorted(items,key=lambda r:r['id'])
        for i,a in enumerate(items):
            for b in items[i+1:]:
                if _iou(a['bbox'],b['bbox'])>=.1:
                    overlaps[(a['id'],b['id'])].append(frame)
    for ids,indices in sorted(overlaps.items()):
        for run in _runs(indices,max(1,math.ceil(fps*.5))):
            before,after=anchors(ids,run[0],run[-1])
            if not before or not after:
                continue
            def order(f):
                a,b=(tracks[i][f]['bbox'] for i in ids)
                return (a[0]+a[2]/2)-(b[0]+b[2]/2)
            if order(before[-1])*order(after[0])<0:
                crosses.append({'ids':list(ids),'start':run[0],'end':run[-1],
                                'before':before,'after':after})
    return {'long_low_visibility':low,'overlap_order_exchange':crosses}


def score_events(events: list[dict], matches: dict, rows: list[dict], fps: float) -> dict:
    """Custom diagnostic: last pre / first post matched visible anchors.

    Matches must come from full-frame one-to-one assignment, not subset rematching.
    Endpoint switch denominators only include subjects matched at both ends.
    """
    lookup={(r['frame'],r['id']):r for r in rows}
    subjects=both=retained=changed=pre_missing=post_missing=0
    observations=set()
    for event in events:
        for ident in event['ids']:
            subjects+=1
            pre=next((matches.get(f,{}).get(ident) for f in reversed(event['before']) if ident in matches.get(f,{})),None)
            post=next((matches.get(f,{}).get(ident) for f in event['after'] if ident in matches.get(f,{})),None)
            pre_missing+=pre is None; post_missing+=post is None
            if pre is not None and post is not None:
                both+=1; retained+=pre==post; changed+=pre!=post
            for f in range(event['start'],event['end']+1):
                if (f,ident) in lookup:
                    observations.add((f,ident))
    detected=sum(ident in matches.get(f,{}) for f,ident in observations)
    return {'events':len(events),'subjects':subjects,'matched_at_both_anchors':both,
            'same_id':retained,'changed_id':changed,'missing_before':pre_missing,'missing_after':post_missing,
            'same_id_rate_among_both_matched':retained/both if both else None,
            'event_gt_observations':len(observations),'event_matched_observations':detected,
            'event_instance_recall':detected/len(observations) if observations else None,
            'duration_seconds_total':sum((e['end']-e['start']+1)/fps for e in events)}
