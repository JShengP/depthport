#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Prepare frozen unseen KITTI image-only sources; media/caches stay local."""
import collections
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.tracking_lifecycle_probe import require
from depthport.video_tracking_benchmark import sha256_file
from tools.diagnose_tracking_upstream import local

URL='https://s3.eu-central-1.amazonaws.com/avg-kitti/data_tracking_image_2.zip'
NEW=('KITTI-0006','KITTI-0007')


class RemoteImages(io.RawIOBase):
    def __init__(self):
        import requests
        self.session=requests.Session();h=self.session.head(URL,timeout=45);h.raise_for_status()
        self.size=int(h.headers['Content-Length']);self.etag=h.headers['ETag'];self.pos=0;self.cache=collections.OrderedDict()
    def seekable(self):return True
    def readable(self):return True
    def tell(self):return self.pos
    def seek(self,n,w=0):self.pos=n if w==0 else self.pos+n if w==1 else self.size+n;return self.pos
    def read(self,n=-1):
        end=min(self.size,self.pos+(n if n>=0 else self.size-self.pos));parts=[];block=4*1024*1024
        while self.pos<end:
            start=self.pos//block*block
            if start not in self.cache:
                stop=min(self.size,start+block)-1
                r=self.session.get(URL,headers={'Range':f'bytes={start}-{stop}','If-Match':self.etag},timeout=45);r.raise_for_status()
                require(r.status_code==206 and r.headers.get('Content-Range')==f'bytes {start}-{stop}/{self.size}' and len(r.content)==stop-start+1,'Exact immutable range required')
                self.cache[start]=r.content
                if len(self.cache)>3:self.cache.popitem(last=False)
            b=self.cache[start];take=min(end-self.pos,len(b)-(self.pos-start));parts.append(b[self.pos-start:self.pos-start+take]);self.pos+=take
        return b''.join(parts)


def members(z,name):
    values=sorted((i for i in z.infolist() if i.filename.startswith('training/image_02/'+name[-4:]+'/') and i.filename.endswith('.png')),key=lambda i:i.filename)
    require(values and [Path(i.filename).name for i in values]==[f'{i:06d}.png' for i in range(len(values))],'Full dense original source required')
    return values


def member_digest(values):
    return hashlib.sha256(json.dumps([[i.filename,i.CRC,i.file_size,i.compress_size] for i in values],separators=(',',':')).encode()).hexdigest()


def metadata():
    remote=RemoteImages()
    with zipfile.ZipFile(remote) as z:
        result=[{'name':n,'frames':len(members(z,n)),'member_manifest_sha256':member_digest(members(z,n))} for n in NEW]
    return {'url':URL,'etag':remote.etag,'size':remote.size,'sequences':result}


def prepare(protocol,seal,work,python,weights):
    import cv2
    import numpy as np
    p=json.loads(protocol.read_text());require(json.loads(local(seal).read_text())['protocol_sha256']==sha256_file(protocol),'Frozen preparation seal required')
    for n,sha in p['implementation_sha256'].items():require(sha256_file(ROOT/n)==sha,'Frozen preparation/code differs')
    require(sha256_file(weights)==p['detector_settings']['weight_sha256'],'Original model weight required')
    work=local(work);require(not work.exists(),'Refuse preparation overwrite/retry');work.mkdir(parents=True)
    records=[];inputs=[]
    for spec in p['new_sources']:
        name=spec['name'];folder=work/name;folder.mkdir();entry={'name':name,'status':'failed'}
        try:
            remote=RemoteImages();require(remote.etag==p['image_archive']['etag'] and remote.size==p['image_archive']['size'],'Frozen image archive differs')
            images=folder/'images';images.mkdir();imagehash=[]
            with zipfile.ZipFile(remote) as z:
                values=members(z,name);require(len(values)==spec['frames'] and member_digest(values)==spec['member_manifest_sha256'],'Frozen full source metadata differs')
                for i,info in enumerate(values):
                    b=z.read(info.filename);require(zipfile.crc32(b)==info.CRC,'Original PNG CRC differs')
                    path=images/Path(info.filename).name;path.write_bytes(b);imagehash.append([path.name,hashlib.sha256(b).hexdigest()])
                    if (i+1)%100==0:print(name+' prepared '+str(i+1)+' PNGs',flush=True)
            (folder/'images.local.json').write_text(json.dumps(imagehash,indent=2)+'\n')
            video=folder/'source.mkv'
            subprocess.run(['ffmpeg','-v','error','-framerate','10','-i',str(images/'%06d.png'),'-c:v','ffv1','-level','3','-pix_fmt','bgr0',str(video)],check=True)
            cap=cv2.VideoCapture(str(video));require(cap.isOpened() and cap.get(cv2.CAP_PROP_FPS)==10,'Original10Hz required')
            try:
                for filename,digest in imagehash:
                    image=images/filename;require(sha256_file(image)==digest,'PNG seal differs');ok,decoded=cap.read()
                    require(ok and np.array_equal(decoded,cv2.imread(str(image))),'Lossless decoded pixels differ')
                require(not cap.read()[0],'Source frame coverage differs')
            finally:cap.release()
            out=folder/'detections.local.json';config=folder/'yolo-config';config.mkdir()
            env=dict(os.environ,YOLO_CONFIG_DIR=str(config),OMP_NUM_THREADS='2',MKL_NUM_THREADS='2')
            with (folder/'inference.local.log').open('w') as log:
                subprocess.run([str(python),'tools/cache_video_detections.py','--video',str(video),'--model',str(weights),'--confidence','.1','--imgsz','640','--device','cpu','--classes','0','--max-detections','64','--nms-iou','.7','--output',str(out)],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
            cache=json.loads(out.read_text());settings={k:v for k,v in cache['detector'].items() if k!='frames_at_detection_cap'}
            require(settings==p['detector_settings'] and len(cache['frames'])==spec['frames'],'Fixed detector/cache differs')
            inputs.append({'name':name,'video':str(video),'caches':[str(out)],'video_sha256':sha256_file(video),'cache_sha256':[sha256_file(out)]})
            entry.update(status='completed',frames=spec['frames'],pixel_identical_frames=spec['frames'],image_manifest_sha256=sha256_file(folder/'images.local.json'))
            print(name+' full image/cache preparation completed',flush=True)
        except Exception as exc:
            (folder/'failure.local.txt').write_text(repr(exc)+'\n');entry['reason']='source_preparation_failed'
        records.append(entry)
    (work/'preparation.local.json').write_text(json.dumps({'protocol_sha256':sha256_file(protocol),'ledger':records},indent=2)+'\n')
    (work/'inputs.local.json').write_text(json.dumps({'format':'depthport.geometry-inputs.v1','sequences':inputs},indent=2)+'\n')
    return 0 if all(r['status']=='completed' for r in records) else 2


if __name__=='__main__':
    import argparse
    a=argparse.ArgumentParser(description=__doc__)
    for n in ('protocol','seal','work','python','weights'):a.add_argument('--'+n,type=Path,required=True)
    args=a.parse_args();raise SystemExit(prepare(args.protocol,args.seal,args.work,args.python,args.weights))
