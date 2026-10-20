#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Publication-only projection; keep censor counts, hide boundary positions.

Does not rerun the frozen audit, change any scientific count, rank or exclude
sources/events. Original complete aggregate and boundary distances stay local.
"""
from collections import Counter
import argparse
import copy
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.tracking_lifecycle_probe import require


def project(raw):
    require(raw['format']=='depthport.state-observation-health.v1','Original aggregate required')
    result=copy.deepcopy(raw);result['format']='depthport.state-observation-health-public.v1'
    result['publication_projection']='Censored-neighbour and boundary-run distances remain local; all censor counts, interior empty-run lengths, observed neighbour distances and all other original aggregate values retained. No source/event selection or scientific reanalysis.'
    for record in result['ledger']:
        if record['status']!='completed':continue
        summary=record['summary']
        for hist in summary['global_empty_runs'].values():
            combined=Counter()
            for key,count in hist.items():
                label=key if key.startswith('interior:') else key.split(':')[0]+':boundary_length_local'
                combined[label]+=count
            require(sum(combined.values())==sum(hist.values()),'Empty-run count changed')
            hist.clear();hist.update(sorted(combined.items()))
        for group in summary['contexts'].values():
            for value in group.values():
                for side in ('before','after'):
                    hist=value[side];combined=Counter()
                    for key,count in hist.items():combined['censored' if key.startswith('censored:') else key]+=count
                    require(sum(combined.values())==sum(hist.values())==value['events'],'Context event count changed')
                    hist.clear();hist.update(sorted(combined.items()))
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();require(a.input.resolve().is_relative_to(ROOT/'artifacts') and not a.input.is_symlink(),'Original aggregate must remain local')
    require(not a.output.exists(),'Refuse to overwrite public projection')
    result=project(json.loads(a.input.read_text()));a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    return 0


if __name__=='__main__':raise SystemExit(main())
