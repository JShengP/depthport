#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Prepare only the frozen phase; no reserved member reads before public discovery.

Same pixel verification/inference recipe as prior preparation. Failures occupy
manifest slots; each source has one attempt; media/caches/diagnostics stay local.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from tools.prepare_handoff_controls import fetch_range
from tools.prepare_tracking_geometry import members, member_digest
from tools.audit_tracking_accepted_events import write
from tools.diagnose_tracking_upstream import local
from depthport.tracking_lifecycle_probe import require
from depthport.video_tracking_benchmark import sha256_file


def prepare(a):
    import cv2
    import numpy as np
    from tools.select_tracking_handoff_exposure import verify, released
    p = released(a) if a.phase == 'confirmation' else verify(a); digest = sha256_file(a.protocol)
    runtime=json.loads(subprocess.check_output([str(a.python),'-c',
        "import importlib.metadata as m,json;print(json.dumps({n:m.version(n) for n in ('ultralytics','torch','numpy','opencv-python')}))"],text=True))
    require(runtime==p['detector_runtime'],'Frozen detector runtime differs')
    work = local(a.work); require(not work.exists() and not a.preparation_seal.exists(), 'No preparation overwrite/retry')
    require(sha256_file(a.weights)==p['detector_settings']['weight_sha256'], 'Frozen model required')
    work.mkdir(parents=True)
    write(local(a.preparation_seal), {'protocol_sha256':digest, 'frozen_before_preparation':True, 'reserved_inference_started':False,
        'sealed_at_utc':datetime.now(timezone.utc).isoformat()})
    records = []; inputs = []; archive_spec = p['image_archive']
    for spec in (s for s in p['new_sources'] if s['phase']==a.phase):
        name = spec['name']; folder = work/name; folder.mkdir(); record = {'name':name, 'status':'failed'}
        video = folder/'source.mkv'; cache_path = folder/'detections.local.json'
        # Even failed preparation keeps a scheduled manifest slot and failure record.
        seq = {'name':name, 'video':str(video), 'caches':[str(cache_path)], 'video_sha256':'0'*64, 'cache_sha256':['0'*64]}
        try:
            block = 8*1024*1024
            spans = [(start,min(start+block,spec['byte_end'])) for start in range(spec['byte_start'],spec['byte_end'],block)]
            spans.append((archive_spec['central_start'],archive_spec['size']))
            sparse = folder/'images-only.local.zip'
            with sparse.open('wb') as file:
                file.truncate(archive_spec['size'])
                with ThreadPoolExecutor(max_workers=4) as pool:
                    tasks = [pool.submit(fetch_range, x, y, archive_spec) for x,y in spans]
                    for n, future in enumerate(as_completed(tasks),1):
                        start, data = future.result(); file.seek(start); file.write(data)
                        if n%8==0 or n==len(tasks): print(name+' immutable ranges '+str(n)+'/'+str(len(tasks)), flush=True)
            images = folder/'images'; images.mkdir(); image_hashes = []
            with zipfile.ZipFile(sparse) as archive:
                values = members(archive,name)
                require(len(values)==spec['frames'] and member_digest(values)==spec['member_manifest_sha256'], 'Frozen image directory differs')
                for info in values:
                    data = archive.read(info.filename); require(zipfile.crc32(data)==info.CRC, 'PNG CRC differs')
                    image = images/Path(info.filename).name; image.write_bytes(data)
                    image_hashes.append([image.name,hashlib.sha256(data).hexdigest()])
            write(folder/'images.local.json',image_hashes)
            subprocess.run(['ffmpeg','-v','error','-framerate','10','-i',str(images/'%06d.png'),'-c:v','ffv1','-level','3','-pix_fmt','bgr0',str(video)],check=True)
            cap = cv2.VideoCapture(str(video))
            try:
                require(cap.isOpened() and cap.get(cv2.CAP_PROP_FPS)==10,'Native10Hz required')
                for filename, sha in image_hashes:
                    require(sha256_file(images/filename)==sha,'PNG changed'); ok, decoded = cap.read()
                    require(ok and np.array_equal(decoded,cv2.imread(str(images/filename))),'Lossless original pixels differ')
                require(not cap.read()[0],'Extra frame')
            finally: cap.release()
            config = folder/'yolo-config'; config.mkdir()
            env = dict(os.environ,YOLO_CONFIG_DIR=str(config),OMP_NUM_THREADS='2',MKL_NUM_THREADS='2')
            with (folder/'inference.local.log').open('w') as log:
                subprocess.run([str(a.python),'tools/cache_video_detections.py','--video',str(video),'--model',str(a.weights),
                    '--confidence','.1','--imgsz','640','--device','cpu','--classes','0','--max-detections','64','--nms-iou','.7','--output',str(cache_path)],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
            cache = json.loads(cache_path.read_text())
            require({k:v for k,v in cache['detector'].items() if k!='frames_at_detection_cap'}==p['detector_settings']
                and len(cache['frames'])==spec['frames'],'Frozen full inference differs')
            seq.update(video_sha256=sha256_file(video),cache_sha256=[sha256_file(cache_path)])
            record.update(status='completed',frames=spec['frames'],pixel_identical_frames=spec['frames'],image_manifest_sha256=sha256_file(folder/'images.local.json'))
            print(name+' full pixel-verified source/inference completed',flush=True)
        except Exception as exc:
            (folder/'failure.local.txt').write_text(repr(exc)+'\n'); record['reason']='reserved_source_preparation_failed'
        records.append(record); inputs.append(seq)
        write(work/'preparation.local.json',{'protocol_sha256':digest,'frozen_before_preparation':True,'ledger':records})
    write(work/'inputs.local.json',{'format':'depthport.geometry-inputs.v1','sequences':inputs})
    return 0 if all(r['status']=='completed' for r in records) else 2


if __name__=='__main__':
    parser=__import__('argparse').ArgumentParser(description=__doc__)
    for n in ('protocol','seal','previous','archive-root','preparation-seal','work','python','weights'):
        parser.add_argument('--'+n,type=Path,required=True)
    parser.add_argument('--phase',choices=('discovery','confirmation'),required=True)
    parser.add_argument('--release',type=Path)
    raise SystemExit(prepare(parser.parse_args()))
