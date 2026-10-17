# SPDX-License-Identifier: AGPL-3.0-only
"""Opt-in, bounded, manual *local-only* frame snapshots and offline replay.

No camera streams are recorded automatically; never run this as an anonymous
public HTTP service. Snapshots preserve original bundle bytes and units.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import stat
import struct
import threading
import time
import unicodedata
import uuid
import zipfile

import numpy as np

FORMAT = 'depthport.session.v1'
BOOKMARK_FORMAT = 'depthport.session-bookmarks.v1'
BOOKMARK_TAGS = ('id-switch', 'occlusion', 'crossing')
MAX_BOOKMARK_BYTES = 1024 * 1024
MAX_SESSIONS = 20
MAX_FRAMES = 120
MAX_SESSION_BYTES = 256 * 1024 * 1024
MAX_BUNDLE_BYTES = 20 * 1024 * 1024
MAX_TOTAL_UNCOMPRESSED = 80 * 1024 * 1024
_ID = re.compile(r'^[0-9a-f]{32}$')
_SHA256 = re.compile(r'^[0-9a-f]{64}$')
_PLY_COUNT = re.compile(rb'^element vertex (\d+)$', re.M)
_PLY_DTYPE = np.dtype([('x','<f4'),('y','<f4'),('z','<f4'),
                       ('red','u1'),('green','u1'),('blue','u1')])


class SessionError(ValueError):
    pass


class SessionNotFound(SessionError):
    pass


class SessionLimit(SessionError):
    pass


class SessionIntegrity(SessionError):
    pass


def _write_private(path: Path, data: bytes):
    """Exclusive create; do not follow existing files or symlinks."""
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, 'wb') as out:
        out.write(data)
        out.flush()
        os.fsync(out.fileno())


def _save_manifest(folder: Path, data: dict):
    raw = (json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2,
                     allow_nan=False) + '\n').encode('utf-8')
    tmp = folder / ('session.' + uuid.uuid4().hex + '.tmp')
    _write_private(tmp, raw)
    try:
        tmp.replace(folder / 'session.json')
    finally:
        tmp.unlink(missing_ok=True)


def _parse_ply(ply: bytes, cap: int = 24000) -> tuple[str,int]:
    """Convert DepthPort's own binary PLY (15-byte XYZRGB) to 16-byte XYZRGBA."""
    marker = b'end_header\n'
    header_end = ply.find(marker)
    if not 0 < header_end < 4096 or not ply.startswith(b'ply\nformat binary_little_endian 1.0\n'):
        raise SessionIntegrity('Unexpected saved PLY header')
    header = ply[:header_end+len(marker)]
    m = _PLY_COUNT.search(header)
    if not m:
        raise SessionIntegrity('Saved PLY has no vertex count')
    total = int(m.group(1))
    if total > 1000000 or total < 0 or len(ply)-len(header) != total * _PLY_DTYPE.itemsize:
        raise SessionIntegrity('Saved PLY has an invalid point count or length')
    raw = np.frombuffer(ply, dtype=_PLY_DTYPE, offset=len(header), count=total)
    if raw.size == 0:
        return '', 0
    every = max(1, (total + cap - 1)//cap)
    selected = raw[::every]
    if not all(np.isfinite(selected[key]).all() for key in ('x','y','z')):
        raise SessionIntegrity('Saved PLY contains non-finite coordinates')
    buf = bytearray(len(selected)*16)
    for i,r in enumerate(selected):
        struct.pack_into('<fffBBBB',buf,i*16,float(r['x']),float(r['y']),float(r['z']),
                         int(r['red']),int(r['green']),int(r['blue']),255)
    return base64.b64encode(buf).decode('ascii'), len(selected)


class SessionStore:
    """Single-process shared store; session IDs are UUID4, never user paths."""
    def __init__(self, root: Path):
        original = Path(root)
        if original.exists() and original.is_symlink():
            raise SessionIntegrity('Session root must not be a symlink')
        self.root = original.resolve()
        self.lock = threading.RLock()
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.root.is_symlink():
            raise SessionIntegrity('Session root must not be a symlink')

    def _folder(self, sid: str) -> Path:
        if not _ID.fullmatch(sid):
            raise SessionNotFound('Invalid session ID')
        folder = self.root / sid
        if folder.is_symlink() or not folder.is_dir():
            raise SessionNotFound('Session does not exist')
        return folder

    def _read_manifest(self, sid: str) -> dict:
        folder = self._folder(sid)
        path = folder/'session.json'
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 128000:
            raise SessionIntegrity('Invalid session manifest')
        try:
            info = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError) as exc:
            raise SessionIntegrity('Session manifest cannot be read') from exc
        if info.get('format') != FORMAT or info.get('session_id') != sid or not isinstance(info.get('frames'),list):
            raise SessionIntegrity('Session manifest does not match format')
        return info

    def list_sessions(self):
        with self.lock:
            items=[]
            for d in self.root.iterdir():
                if d.is_dir() and not d.is_symlink() and _ID.fullmatch(d.name):
                    try:
                        v=self._read_manifest(d.name)
                        items.append({'session_id': d.name, 'label': v['label'],
                                      'created_at':v['created_at'], 'frame_count':len(v['frames'])})
                    except (SessionError,KeyError):
                        continue
            return sorted(items,key=lambda r:r['created_at'],reverse=True)

    def create(self,label:str=''):
        label=label.strip()
        if len(label)>80 or any(ord(c)<32 for c in label) or '<' in label or '>' in label:
            raise SessionError('Session label must be <=80 printable characters')
        with self.lock:
            if len(self.list_sessions())>=MAX_SESSIONS:
                raise SessionLimit('Session limit reached; archive/remove old local sessions manually')
            sid=uuid.uuid4().hex
            folder=self.root/sid
            folder.mkdir(mode=0o700)
            data={'format':FORMAT,'session_id':sid,'label':label,
                  'created_at':time.time(),'frames':[]}
            _save_manifest(folder,data)
            return {'session_id':sid,'label':label,'created_at':data['created_at'], 'frame_count':0}

    def frames(self,sid:str):
        with self.lock:
            v=self._read_manifest(sid)
            return {'session_id':sid,'label':v['label'],'created_at':v['created_at'],
                    'frames':[r.copy() for r in v['frames']]}

    def capture(self,sid:str,bundle:bytes,frame:dict):
        if not isinstance(bundle,bytes) or not 0<len(bundle)<=MAX_BUNDLE_BYTES:
            raise SessionLimit('Frame archive exceeds 20 MiB; lower camera resolution/point count')
        # Validate exact single-frame source archive; do not accept random external ZIP data.
        if frame.get('units') not in ('estimated_m','relative') or not isinstance(frame.get('frame_id'),int):
            raise SessionError('Incomplete frame model/unit metadata')
        with zipfile.ZipFile(io.BytesIO(bundle),'r') as z:
            if any(i.file_size>MAX_TOTAL_UNCOMPRESSED for i in z.infolist()) or sum(i.file_size for i in z.infolist())>MAX_TOTAL_UNCOMPRESSED:
                raise SessionLimit('Frame decompressed size limit exceeded')
            required={'frame.json','rgb_aligned.png','depth_preview.jpg','model_raw_depth.npy'}
            if not required.issubset(z.namelist()) or not any(x.startswith('pointcloud_') and x.endswith('.ply') for x in z.namelist()):
                raise SessionError('Not a complete DepthPort frame bundle')
            fmeta=json.loads(z.read('frame.json'))
            if fmeta.get('frame_id')!=frame['frame_id'] or fmeta.get('units')!=frame['units'] or fmeta.get('engine')!=frame.get('engine'):
                raise SessionError('Bundle provenance differs from current frame')
        with self.lock:
            v=self._read_manifest(sid)
            rows=v['frames']
            if len(rows)>=MAX_FRAMES:
                raise SessionLimit('Per-session frame limit reached')
            seq=len(rows)+1
            if sum(r['bytes'] for r in rows)+len(bundle)>MAX_SESSION_BYTES:
                raise SessionLimit('Per-session storage limit reached')
            sha=hashlib.sha256(bundle).hexdigest()
            filename=f'frame-{seq:05d}.zip'
            path=self._folder(sid)/filename
            _write_private(path,bundle)
            row={'index':seq,'frame_id':int(frame['frame_id']),'captured_at':time.time(),
                 'frame_timestamp':float(frame['timestamp']),
                 'engine':frame['engine'],'model':frame['model'],'units':frame['units'],
                 'source_type':frame.get('source','unknown'),
                 'source_sha256':frame.get('source_sha256'),
                 'bytes':len(bundle),'sha256':sha,'file':filename,
                 'depth_stats':frame.get('depth_stats'),
                 'valid_depth_fraction':frame.get('valid_depth_fraction')}
            rows.append(row)
            try:
                _save_manifest(self._folder(sid),v)
            except Exception:
                path.unlink(missing_ok=True)
                raise
            return row.copy()

    def bundle(self,sid:str,index:int)->bytes:
        with self.lock:
            v=self._read_manifest(sid)
            row=next((r for r in v['frames'] if r.get('index')==index),None)
            if row is None:raise SessionNotFound('Frame index does not exist')
            filename=f'frame-{index:05d}.zip'
            if row.get('file')!=filename:
                raise SessionIntegrity('Unexpected frame file path')
            path=self._folder(sid)/filename
            if path.is_symlink() or not path.is_file() or path.stat().st_size!=row['bytes'] or row['bytes']>MAX_BUNDLE_BYTES:
                raise SessionIntegrity('Saved frame file is invalid')
            payload=path.read_bytes()
            if hashlib.sha256(payload).hexdigest()!=row['sha256']:
                raise SessionIntegrity('Frame SHA-256 mismatch; refusing replay')
            return payload

    @staticmethod
    def _bookmark_values(snapshot_sha256, tags, note):
        # Notes are plain local text. Fixed errors never echo submitted notes.
        if not isinstance(snapshot_sha256, str) or not _SHA256.fullmatch(snapshot_sha256):
            raise SessionError('Bookmark requires a valid snapshot SHA-256')
        if (not isinstance(tags, list) or len(tags) > len(BOOKMARK_TAGS) or
                any(not isinstance(tag, str) or tag not in BOOKMARK_TAGS for tag in tags) or
                len(set(tags)) != len(tags)):
            raise SessionError('Bookmark tags must be unique supported categories')
        if (not isinstance(note, str) or len(note) > 1000 or
                any(unicodedata.category(c) in ('Cc', 'Cs') and c not in '\n\t' for c in note)):
            raise SessionError('Bookmark note must be at most 1000 characters without control characters')

    def _bookmark_anchor(self, sid: str, index: int, snapshot_sha256: str):
        if type(index) is not int or not 1 <= index <= MAX_FRAMES:
            raise SessionNotFound('Frame index does not exist')
        rows = self._read_manifest(sid)['frames']
        if any(not isinstance(row, dict) for row in rows):
            raise SessionIntegrity('Invalid saved-frame identity')
        selected = [r for r in rows if r.get('index') == index]
        if not selected:
            raise SessionNotFound('Frame index does not exist')
        if len(selected) != 1:
            raise SessionIntegrity('Ambiguous saved-frame identity')
        row = selected[0]
        if row.get('sha256') != snapshot_sha256:
            raise SessionIntegrity('Bookmark snapshot does not match the saved frame')
        try:
            if hashlib.sha256(self.bundle(sid, index)).hexdigest() != snapshot_sha256:
                raise SessionIntegrity('Bookmark snapshot does not match the saved frame')
        except (OSError, KeyError, TypeError) as exc:
            raise SessionIntegrity('Bookmark saved frame cannot be verified') from exc

    def _read_bookmarks(self, sid: str) -> dict:
        """Read under the shared lock; fail closed before any replacement."""
        self._read_manifest(sid)
        empty = {'format': BOOKMARK_FORMAT, 'session_id': sid, 'bookmarks': []}
        path = self._folder(sid) / 'bookmarks.json'
        try:
            existing = path.lstat()
        except FileNotFoundError:
            return empty
        except OSError as exc:
            raise SessionIntegrity('Local bookmarks cannot be read') from exc
        if not stat.S_ISREG(existing.st_mode) or existing.st_size > MAX_BOOKMARK_BYTES:
            raise SessionIntegrity('Invalid local bookmarks file')
        flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
        try:
            fd = os.open(path, flags)
            with os.fdopen(fd, 'rb') as source:
                opened = os.fstat(source.fileno())
                if not stat.S_ISREG(opened.st_mode) or opened.st_size > MAX_BOOKMARK_BYTES:
                    raise SessionIntegrity('Invalid local bookmarks file')
                raw = source.read(MAX_BOOKMARK_BYTES + 1)
            if len(raw) > MAX_BOOKMARK_BYTES:
                raise SessionIntegrity('Local bookmarks exceed the 1 MiB limit')
            def unique_object(pairs):
                obj = {}
                for key, value in pairs:
                    if key in obj:
                        raise ValueError('Duplicate JSON key')
                    obj[key] = value
                return obj
            data = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_object)
            if (not isinstance(data, dict) or set(data) != {'format', 'session_id', 'bookmarks'} or
                    data['format'] != BOOKMARK_FORMAT or data['session_id'] != sid or
                    not isinstance(data['bookmarks'], list) or len(data['bookmarks']) > MAX_FRAMES):
                raise ValueError('Invalid bookmark document')
            seen = set()
            for item in data['bookmarks']:
                if not isinstance(item, dict) or set(item) != {'index', 'snapshot_sha256', 'tags', 'note', 'updated_at'}:
                    raise ValueError('Invalid bookmark record')
                index = item['index']
                if type(index) is not int or index in seen:
                    raise ValueError('Invalid bookmark index')
                seen.add(index)
                self._bookmark_values(item['snapshot_sha256'], item['tags'], item['note'])
                updated = item['updated_at']
                if type(updated) not in (int, float) or not math.isfinite(updated) or updated <= 0:
                    raise ValueError('Invalid bookmark timestamp')
                self._bookmark_anchor(sid, index, item['snapshot_sha256'])
            data['bookmarks'].sort(key=lambda item: item['index'])
            return data
        except (OSError, ValueError, TypeError, KeyError, OverflowError) as exc:
            # Includes anchor failures: unrelated or damaged bookmarks must not
            # be silently overwritten by a later edit or deletion.
            raise SessionIntegrity('Local bookmarks are invalid or do not match saved frames') from exc

    def bookmarks(self, sid: str) -> dict:
        with self.lock:
            return self._read_bookmarks(sid)

    def _save_bookmarks(self, sid: str, data: dict):
        raw = (json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n').encode('utf-8')
        if len(raw) > MAX_BOOKMARK_BYTES:
            raise SessionLimit('Local bookmarks exceed the 1 MiB limit')
        folder = self._folder(sid)
        tmp = folder / ('bookmarks.' + uuid.uuid4().hex + '.tmp')
        try:
            _write_private(tmp, raw)
            tmp.replace(folder / 'bookmarks.json')
        finally:
            tmp.unlink(missing_ok=True)

    def save_bookmark(self, sid: str, index: int, snapshot_sha256: str,
                      tags: list | None = None, note: str = '') -> dict:
        tags = [] if tags is None else tags
        self._bookmark_values(snapshot_sha256, tags, note)
        with self.lock:
            self._bookmark_anchor(sid, index, snapshot_sha256)
            data = self._read_bookmarks(sid)
            records = [r for r in data['bookmarks'] if r['index'] != index]
            records.append({'index': index, 'snapshot_sha256': snapshot_sha256,
                            'tags': tags.copy(), 'note': note, 'updated_at': time.time()})
            if len(records) > MAX_FRAMES:
                raise SessionLimit('Per-session bookmark limit reached')
            data['bookmarks'] = sorted(records, key=lambda item: item['index'])
            self._save_bookmarks(sid, data)
            return data

    def delete_bookmark(self, sid: str, index: int, snapshot_sha256: str) -> dict:
        self._bookmark_values(snapshot_sha256, [], '')
        with self.lock:
            self._bookmark_anchor(sid, index, snapshot_sha256)
            data = self._read_bookmarks(sid)
            records = [r for r in data['bookmarks'] if r['index'] != index]
            if len(records) != len(data['bookmarks']):
                data['bookmarks'] = records
                self._save_bookmarks(sid, data)
            return data

    def replay(self,sid:str,index:int)->dict:
        # Capture the saved-frame identity and session size together. A tracking
        # overlay must match this exact ZIP, never merely the source frame_id.
        with self.lock:
            payload=self.bundle(sid,index)
            total_session_frames=len(self._read_manifest(sid)['frames'])
        snapshot_sha256=hashlib.sha256(payload).hexdigest()
        with zipfile.ZipFile(io.BytesIO(payload)) as z:
            if sum(i.file_size for i in z.infolist())>MAX_TOTAL_UNCOMPRESSED:
                raise SessionIntegrity('Frame archive exceeds replay limit')
            f=json.loads(z.read('frame.json'))
            ply_names=[n for n in z.namelist() if n.startswith('pointcloud_') and n.endswith('.ply')]
            if len(ply_names)!=1:
                raise SessionIntegrity('Point-cloud entry missing or ambiguous')
            packed,count=_parse_ply(z.read(ply_names[0]))
            rgb=z.read('rgb_aligned.png'); depth=z.read('depth_preview.jpg')
        return {'frame_id':f['frame_id'],'session_id':sid,'index':index,
                'snapshot_sha256':snapshot_sha256,
                'total_session_frames':total_session_frames,
                'engine':f['engine'],'model':f.get('model'), 'units':f['units'],
                'intrinsics':f.get('intrinsics'), 'depth_stats':f.get('depth_stats'),
                'frame_timestamp':f.get('timestamp'),
                'rgb_png':base64.b64encode(rgb).decode('ascii'),
                'depth_jpeg':base64.b64encode(depth).decode('ascii'),
                'points':packed,'count':count,
                'color_range':f.get('color_range',[0.1,20]),
                'note':'Recorded AI estimate; no inference rerun and no validated metre accuracy.'}

    def save_tracking_report(self, sid: str, report: dict) -> None:
        """Atomic, opt-in local report; reject stale or unrelated snapshots."""
        with self.lock:
            rows = self._read_manifest(sid)['frames']
            observed = [(r['index'], r['sha256']) for r in rows]
            selected = [(r['index'], r['snapshot_sha256']) for r in report.get('frames', [])]
            if (report.get('session_id') != sid or
                    report.get('total_session_frames') != len(rows) or
                    not selected or selected != observed[-len(selected):]):
                raise SessionIntegrity('Session changed during tracking; rerun analysis')
            raw = (json.dumps(report, ensure_ascii=False, allow_nan=False, separators=(',', ':'))+'\n').encode('utf-8')
            if len(raw) > 1_000_000:
                raise SessionLimit('Tracking report exceeded the 1 MiB limit')
            folder=self._folder(sid)
            tmp=folder/('tracking.'+uuid.uuid4().hex+'.tmp')
            _write_private(tmp,raw)
            try:tmp.replace(folder/'tracking.json')
            finally:tmp.unlink(missing_ok=True)

    def tracking_report(self, sid: str) -> dict:
        with self.lock:
            rows=self._read_manifest(sid)['frames']
            path=self._folder(sid)/'tracking.json'
            if path.is_symlink() or not path.is_file():
                raise SessionNotFound('No saved tracking result; run tracking first')
            if path.stat().st_size > 1_000_000:
                raise SessionIntegrity('Tracking report exceeds size limit')
            try:report=json.loads(path.read_text(encoding='utf-8'))
            except (ValueError,OSError) as exc:raise SessionIntegrity('Unreadable tracking report') from exc
            seen=[(r['index'],r['snapshot_sha256']) for r in report['frames']]
            current=[(r['index'],r['sha256']) for r in rows]
            if (report.get('session_id') != sid or not seen or
                    report.get('total_session_frames') != len(rows) or
                    seen != current[-len(seen):]):
                raise SessionIntegrity('Tracking analysis is stale after a new frame; rerun it')
            return report

    def temporal_consistency(self, sid: str, max_pairs: int = 32) -> dict:
        """Read-only, same-grid offline depth-change report over manual snapshots."""
        from depthport.temporal import analyze_session
        return analyze_session(self, sid, max_pairs=max_pairs)

    def temporal_summary(self,sid:str)->dict:
        rows=self.frames(sid)['frames']
        # Medians from existing metadata, grouped by engine and units. No pixel
        # correspondence or world alignment is implied by these scalar trends.
        groups={}
        for r in rows:
            key=f"{r['engine']}:{r['units']}"
            if key not in groups:groups[key]=[]
            v=(r.get('depth_stats') or {}).get('median')
            if isinstance(v,(float,int)) and np.isfinite(v):
                groups[key].append({'index':r['index'],'captured_at':r['captured_at'],
                                    'depth_median':float(v),'valid_fraction':r.get('valid_depth_fraction')})
        for points in groups.values():
            first=points[0]['depth_median'] if points else None
            for item in points:
                item['delta_from_first']=item['depth_median']-first
        return {'session_id':sid,'groups':groups,
                'interpretation':'Frame scalar trend only; relative/virtual depth is not metres. '
                                 'No tracking, pose compensation, pixel correspondence or metric drift claim.'}
