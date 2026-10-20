# SPDX-License-Identifier: AGPL-3.0-only
"""Offline checks of curated actual outputs; no model inference or network."""
import array
import base64
import gzip
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import shutil
import math
import pytest

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'website/data'
def load(path):return json.loads(path.read_text(encoding='utf-8'))
def digest(b):return hashlib.sha256(b).hexdigest()
def values(obj):
 b=gzip.decompress(base64.b64decode(obj['data']));assert digest(b)==obj['sha256']
 assert len(b)==math.prod(obj['shape'])*4
 return b

def test_saved_depth_units_and_exported_cloud_share_actual_geometry():
 m=load(DATA/'bus/manifest.json')
 assert m['source']['sha256']=='c02019c4979c191eb739ddd944445ef408dad5679acab6fd520ef9d434bfbc63'
 assert len(m['engines'])==4
 for entry in m['engines']:
  raw_bytes=(DATA/'bus'/entry['path']).read_bytes();assert digest(raw_bytes)==entry['sha256']
  d=json.loads(raw_bytes);b=values(d['depth']);raw=values(d['raw_depth']) if d['raw_depth']!='depth' else b
  assert digest(b)==entry['depth_sha256'] and digest(raw)==entry['raw_sha256']
  assert d['source_sha256']==m['source']['sha256'];assert d['intrinsics']['source']=='hfov_estimate'
  assert digest((DATA/'bus'/d['rgb']).read_bytes())==d['aligned_rgb_sha256']
  w,h=d['width'],d['height'];assert d['depth']['shape']==[h,w]
  cloud=base64.b64decode(d['cloud']['packed']);assert len(cloud)==d['cloud']['count']*16;assert digest(cloud)==d['cloud']['sha256']
  k=d['intrinsics']
  for x,y,z,r,g,blue,a in struct.iter_unpack('<fffBBBB',cloud):
   assert all(math.isfinite(v) for v in [x,y,z]) and z<0 and a==255
   u=round(x/-z*k['fx']+k['cx']);v=round(-y/-z*k['fy']+k['cy'])
   assert 0<=u<w and 0<=v<h
   native=struct.unpack_from('<f',b,(v*w+u)*4)[0]
   assert math.isclose(-z,native,rel_tol=2e-6,abs_tol=1e-6)
  if d['engine']=='da2-small':
   assert d['depth_info']['raw_depth_units']=='relative_nearness_larger_is_nearer'
   assert d['statistics']['min']==1 and d['statistics']['max']==5
  if d['engine']=='da3-metric':
   scale=d['depth_info']['raw_to_output_scale']
   for offset in range(0,len(b),4*1009):assert math.isclose(struct.unpack_from('<f',b,offset)[0],struct.unpack_from('<f',raw,offset)[0]*scale,rel_tol=2e-7)

def test_actual_masks_are_lossless_bounded_and_labelled():
 sem=load(DATA/'bus/semantic.json')
 for mode in ('detect','segment'):
  d=sem[mode];assert len(d['objects'])==5;assert d['width']==720 and d['height']==960
  for o in d['objects']:
   assert 0<=o['confidence']<=1
   previous=0
   for a,b in o['runs']:assert previous<=a<b<=720*960;previous=b
   assert o['mask_kind']==('instance_mask' if mode=='segment' else 'bounding_box_region_approximation')

def test_replay_preserves_all_observations_gaps_and_new_run_identity():
 m=load(DATA/'tracking/manifest.json');f=load(DATA/'tracking/frames.json');tracks=load(DATA/'tracking/tracks.json')
 assert len(f)==24 and len(tracks)==9 and m['count']==24
 assert m['source']['sha256']=='9b77a4264bb59290335184b77c6300ba43aa6642cb65b594550c44359fd57d4b'
 assert [x['source_frame'] for x in f]==list(range(32,56))
 assert [x['index'] for x in f]==list(range(1,25))
 assert m['counts']=={'ids':9,'detections':209,'associated':152,'unassociated':57}
 all_observed={}
 for frame in f:
  assert math.isclose(frame['timestamp'],(frame['source_frame']-1)/m['fps'])
  assert digest((DATA/'tracking'/frame['preview']).read_bytes())==frame['preview_sha256']
  assert frame['unassociated']==sum(o['object_id'] is None for o in frame['objects'])
  ids=[]
  for o in frame['objects']:
   x0,y0,x1,y1=o['bbox'];assert 0<=x0<x1<=960 and 0<=y0<y1<=540
   assert 1<=o['depth_median']<=5
   if o['object_id']:
    ids.append(o['object_id']);all_observed[(o['object_id'],frame['index'])]=o
  assert len(ids)==len(set(ids))
 for tid,obs in tracks.items():
  for o in obs:
   assert {k:v for k,v in o.items() if k not in ('index','timestamp')}==all_observed.pop((tid,o['index']))
 assert not all_observed
 assert [o['index'] for o in tracks['obj-0003'] if o['index'] in (9,10)]==[]
 assert [o['index'] for o in tracks['obj-0005'] if 7<=o['index']<=19]==[]
 assert 'New run' in m['run'] and m['detector_version']=='8.4.115'

def test_public_catalog_allowlist_and_no_host_paths_or_api():
 cat=load(DATA/'catalog.json');names=set()
 for entry in cat['files']:
  path=DATA/entry['path'];b=path.read_bytes();assert len(b)==entry['bytes'] and digest(b)==entry['sha256'];names.add(entry['path'])
  if path.suffix=='.json':
   s=b.decode();assert '/home/' not in s and 'session_id' not in s and 'rtsp://' not in s
 assert names=={p.relative_to(DATA).as_posix() for p in DATA.rglob('*') if p.is_file() and p.name!='catalog.json'}
 manifest=set((ROOT/'PUBLIC_FILES.txt').read_text().splitlines())
 assert all('website/data/'+n in manifest for n in names)
 js=(ROOT/'website/real-results.js').read_text();assert '/api/' not in js and 'XMLHttpRequest' not in js

def test_real_results_browser_helpers_if_node_available():
 node=shutil.which('node')
 if not node:pytest.skip('Node.js is not installed')
 subprocess.run([node,str(ROOT/'tests/test_real_results.cjs')],cwd=ROOT,check=True,capture_output=True,text=True)


def test_byte_hashed_packs_survive_windows_autocrlf_checkout(tmp_path):
    """Exercise checkout conversion, not just an attribute string assertion."""
    git=shutil.which('git')
    if not git:pytest.skip('Git is not installed')
    repo=tmp_path/'checkout';repo.mkdir()
    subprocess.run([git,'init','--quiet',str(repo)],check=True)
    subprocess.run([git,'-C',str(repo),'config','core.autocrlf','true'],check=True)
    (repo/'.gitattributes').write_bytes((ROOT/'.gitattributes').read_bytes())
    target=repo/'website/data/bus/fixture.json';target.parent.mkdir(parents=True)
    expected=b'{"depth":[1.25,2.5]}\n';target.write_bytes(expected)
    subprocess.run([git,'-C',str(repo),'add','.'],check=True,capture_output=True)
    target.unlink()
    subprocess.run([git,'-C',str(repo),'checkout-index','--all','--force'],check=True)
    assert target.read_bytes()==expected
