# SPDX-License-Identifier: AGPL-3.0-only
"""v0.3 manual Session/Replay tests; fake deterministic depth, no camera or models."""
from __future__ import annotations
import hashlib
import io
import json
import os
import re
import stat
import zipfile
from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient
from depthport.sessions import (SessionStore, SessionError, SessionLimit, SessionNotFound,
                               SessionIntegrity, MAX_FRAMES, BOOKMARK_FORMAT,
                               BOOKMARK_IMPORT_FORMAT, MAX_BOOKMARK_BYTES, _parse_ply)
from depthport.api import bundle_bytes, prepare_cloud
from depthport.engines import DepthResult
from tests.helpers import FakeEngine, fixture_image, wait_for
import depthport.api as api


def sample_frame(frame_id=1, units='estimated_m', engine='yolo26'):
    bgr=np.full((32,48,3),(12,88,160),np.uint8)
    k={'fx':55.,'fy':56.,'cx':23.5,'cy':15.5,'source':'hfov_estimate'}
    depths=np.full((32,48),2.5,np.float32)
    result=DepthResult(bgr,depths,depths.copy(),k,units,info={'fixture':True})
    cloud,_=prepare_cloud(result)
    records=cloud.pop('points_raw')
    f={**cloud,'frame_id':frame_id,'generation':1,'engine':engine,
       'model':'synthetic only','timestamp':10.5,'source':'image',
       'source_sha256':'aaa','timings':{'pipeline_ms':0.1},
       'filter_info':{}, 'depth_info':result.info}
    return f,bundle_bytes(f,records,result)


def test_store_create_capture_replay_units_and_hash(tmp_path):
    store=SessionStore(tmp_path/'outputs'/'sessions')
    item=store.create('Fixture session')
    assert len(item['session_id'])==32
    frame,bundle=sample_frame()
    row=store.capture(item['session_id'],bundle,frame)
    assert row['sha256']==hashlib.sha256(bundle).hexdigest()
    assert row['units']=='estimated_m'
    assert store.bundle(item['session_id'],1)==bundle
    replay=store.replay(item['session_id'],1)
    assert replay['units']=='estimated_m' and replay['engine']=='yolo26'
    assert replay['snapshot_sha256']==row['sha256']
    assert replay['total_session_frames']==1
    assert replay['count']>0 and replay['points'] and replay['rgb_png'] and replay['depth_jpeg']
    trend=store.temporal_summary(item['session_id'])
    assert trend['groups']['yolo26:estimated_m'][0]['delta_from_first']==0
    assert store.list_sessions()[0]['frame_count']==1
    assert (tmp_path/'outputs'/'sessions'/item['session_id']/'frame-00001.zip').exists()


def test_replay_identity_uses_saved_index_and_exact_snapshot(tmp_path):
    store=SessionStore(tmp_path/'sessions')
    sid=store.create()['session_id']
    # A camera/model can repeat its frame_id, so it cannot identify a snapshot.
    f,b=sample_frame(frame_id=91)
    first=store.capture(sid,b,f)
    before=store.replay(sid,1)
    other_frame,other_bundle=sample_frame(frame_id=91,units='relative')
    second=store.capture(sid,other_bundle,other_frame)
    after=store.replay(sid,1)
    other=store.replay(sid,2)
    assert before['session_id']==after['session_id']==other['session_id']==sid
    assert before['frame_id']==other['frame_id']==91
    assert (after['index'],other['index'])==(1,2)
    assert before['snapshot_sha256']==after['snapshot_sha256']==first['sha256']
    assert other['snapshot_sha256']==second['sha256']
    assert other['snapshot_sha256']!=after['snapshot_sha256']
    assert before['total_session_frames']==1
    assert after['total_session_frames']==other['total_session_frames']==2
    assert store.bundle(sid,1)==b and store.bundle(sid,2)==other_bundle


def test_tracking_report_rechecks_session_and_nonempty_snapshot_identity(tmp_path):
    store=SessionStore(tmp_path/'sessions')
    sid=store.create()['session_id']
    f,b=sample_frame();row=store.capture(sid,b,f)
    report={'session_id':sid,'total_session_frames':1,
            'frames':[{'index':1,'snapshot_sha256':row['sha256']}],
            'format':'depthport.semantic-tracking.v1'}
    store.save_tracking_report(sid,report)
    assert store.tracking_report(sid)==report
    path=tmp_path/'sessions'/sid/'tracking.json'
    for changed in ({**report,'session_id':store.create()['session_id']},
                    {**report,'frames':[]}):
        path.write_text(json.dumps(changed),encoding='utf-8')
        with pytest.raises(SessionIntegrity,match='stale'):
            store.tracking_report(sid)


def test_relative_units_retained_and_not_mislabeled(tmp_path):
    store=SessionStore(tmp_path/'sessions')
    sid=store.create('Relative')['session_id']
    f,b=sample_frame(units='relative',engine='da3-small')
    store.capture(sid,b,f)
    assert store.replay(sid,1)['units']=='relative'
    assert 'not metres' in store.temporal_summary(sid)['interpretation']


def test_integrity_failure_and_path_traversal(tmp_path):
    store=SessionStore(tmp_path/'sessions')
    sid=store.create()['session_id']
    f,b=sample_frame()
    store.capture(sid,b,f)
    for bad in ('../outside','%2e%2e','',sid+'/nested'):
        with pytest.raises(SessionNotFound):store.frames(bad)
    path=tmp_path/'sessions'/sid/'frame-00001.zip'
    path.write_bytes(b'modified'+b)
    with pytest.raises(SessionIntegrity):store.bundle(sid,1)


def test_no_silent_capture_and_bounds(tmp_path,monkeypatch):
    store=SessionStore(tmp_path/'sessions')
    sid=store.create()['session_id']
    assert store.frames(sid)['frames']==[]
    f,b=sample_frame()
    with pytest.raises(SessionLimit):store.capture(sid,b'X'*(20*1024*1024+1),f)
    import depthport.sessions as mod
    monkeypatch.setattr(mod,'MAX_FRAMES',1)
    store.capture(sid,b,f)
    with pytest.raises(SessionLimit):store.capture(sid,b,f)


def test_rejects_wrong_provenance_and_invalid_labels(tmp_path):
    store=SessionStore(tmp_path/'sessions')
    with pytest.raises(ValueError):store.create('<script>')
    sid=store.create()['session_id']
    f,b=sample_frame()
    with pytest.raises(ValueError):store.capture(sid,b,{**f,'frame_id':999})
    with pytest.raises(ValueError):store.capture(sid,b,{**f,'units':'relative'})
    with pytest.raises(SessionNotFound):store.bundle(sid,1)


def test_no_symlink_frame_allowed(tmp_path):
    store=SessionStore(tmp_path/'sessions');sid=store.create()['session_id']
    f,b=sample_frame();store.capture(sid,b,f)
    target=tmp_path/'outside.zip';target.write_bytes(b)
    link=tmp_path/'sessions'/sid/'frame-00001.zip'
    link.unlink();link.symlink_to(target)
    with pytest.raises(SessionIntegrity):store.bundle(sid,1)


def test_direct_zip_replay_matches_ply_payload(tmp_path):
    store=SessionStore(tmp_path/'sessions');sid=store.create()['session_id']
    f,b=sample_frame();store.capture(sid,b,f)
    with zipfile.ZipFile(io.BytesIO(b)) as z:
        ply=z.read('pointcloud_estimated_m.ply')
    packed,count=_parse_ply(ply)
    assert count==store.replay(sid,1)['count']
    assert packed==store.replay(sid,1)['points']
    with pytest.raises(SessionIntegrity):_parse_ply(b'not a ply')


@pytest.fixture
def client_enabled(monkeypatch,tmp_path):
    monkeypatch.setenv('ENABLE_SESSION_STORAGE','1')
    monkeypatch.setattr(api,'SessionStore',lambda _root:SessionStore(tmp_path/'sessions'))
    monkeypatch.setattr(api,'make_engine',lambda key:FakeEngine(key))
    with TestClient(api.app,client=('127.0.0.1',6666)) as c:
        yield c


def test_real_http_routes_with_fake_inference(client_enabled):
    c=client_enabled
    assert c.get('/api/sessions/status').json()['manual_capture_only']
    assert c.get('/sessions').status_code==200
    a=c.post('/api/sessions',json={'label':'API test'})
    assert a.status_code==201
    sid=a.json()['session_id']
    assert c.post(f'/api/sessions/{sid}/capture').status_code==409
    image=fixture_image();ok,png=__import__('cv2').imencode('.png',image)
    assert ok
    assert c.post('/api/model',json={'engine':'yolo26'}).status_code==202
    assert c.post('/api/image',files={'file':('fixture.png',png.tobytes(),'image/png')}).status_code==202
    wait_for(lambda:c.get('/api/latest').status_code==200)
    cap=c.post(f'/api/sessions/{sid}/capture')
    assert cap.status_code==201,cap.text
    frames=c.get(f'/api/sessions/{sid}/frames').json()
    assert len(frames['frames'])==1
    replay=c.get(f'/api/sessions/{sid}/frames/1/replay')
    assert replay.status_code==200 and replay.json()['count']>0
    assert replay.json()['session_id']==sid and replay.json()['index']==1
    assert replay.json()['snapshot_sha256']==frames['frames'][0]['sha256']
    assert replay.json()['total_session_frames']==1
    bundle=c.get(f'/api/sessions/{sid}/frames/1/bundle.zip')
    assert bundle.status_code==200
    with zipfile.ZipFile(io.BytesIO(bundle.content)) as z:
        assert 'frame.json' in z.namelist()
    assert len(c.get('/api/sessions').json()['sessions'])==1
    assert 'groups' in c.get(f'/api/sessions/{sid}/temporal').json()


def test_local_only_and_disabled(monkeypatch,tmp_path):
    monkeypatch.delenv('ENABLE_SESSION_STORAGE',raising=False)
    monkeypatch.setattr(api,'make_engine',lambda key:FakeEngine(key))
    with TestClient(api.app,client=('127.0.0.1',42)) as c:
        assert c.get('/api/sessions').status_code==404
        assert c.post('/api/sessions',json={}).status_code==404
    monkeypatch.setenv('ENABLE_SESSION_STORAGE','1')
    monkeypatch.setattr(api,'SessionStore',lambda _root:SessionStore(tmp_path/'local'))
    with TestClient(api.app,client=('192.0.2.11',42)) as c:
        assert c.get('/api/sessions').status_code==403
        assert c.post('/api/sessions',json={}).status_code==403


def test_test_fixture_does_not_store_source_url(tmp_path):
    store=SessionStore(tmp_path/'sessions');sid=store.create()['session_id']
    f,b=sample_frame()
    store.capture(sid,b,{**f,'source':'rtsp'})
    m=(tmp_path/'sessions'/sid/'session.json').read_text()
    assert 'rtsp://' not in m and 'password' not in m


def bookmark_fixture(tmp_path):
    store = SessionStore(tmp_path / 'sessions')
    sid = store.create('Synthetic bookmarks')['session_id']
    frame, bundle = sample_frame(frame_id=91)
    row = store.capture(sid, bundle, frame)
    return store, sid, row, tmp_path / 'sessions' / sid / 'bookmarks.json'


def test_bookmark_roundtrip_update_delete_is_private_and_preserves_bundles(tmp_path):
    store, sid, row, path = bookmark_fixture(tmp_path)
    original_manifest = (path.parent / 'session.json').read_bytes()
    original_bundle = store.bundle(sid, 1)
    empty = {'format': BOOKMARK_FORMAT, 'session_id': sid, 'bookmarks': []}
    assert store.bookmarks(sid) == empty and not path.exists()
    # HTML-like input is stored as plain text for textContent rendering.
    note = '疑似換 ID 😀 <img src=x onerror=alert(1)>\n下一行\t交會'
    saved = store.save_bookmark(sid, 1, row['sha256'], ['id-switch', 'crossing'], note)
    assert saved['bookmarks'][0] == {
        'index': 1, 'snapshot_sha256': row['sha256'], 'tags': ['id-switch', 'crossing'],
        'note': note, 'updated_at': saved['bookmarks'][0]['updated_at']}
    assert saved['bookmarks'][0]['updated_at'] > 0
    assert SessionStore(path.parent.parent).bookmarks(sid) == saved
    assert note.encode() in path.read_bytes().replace(b'\\n', b'\n').replace(b'\\t', b'\t')
    if os.name == 'posix':
        assert stat.S_IMODE(path.stat().st_mode) == 0o600
    changed = store.save_bookmark(sid, 1, row['sha256'], [], 'Updated')
    assert len(changed['bookmarks']) == 1 and changed['bookmarks'][0]['note'] == 'Updated'
    assert store.bundle(sid, 1) == original_bundle
    assert (path.parent / 'session.json').read_bytes() == original_manifest
    assert store.delete_bookmark(sid, 1, row['sha256']) == empty
    assert store.delete_bookmark(sid, 1, row['sha256']) == empty
    assert SessionStore(path.parent.parent).bookmarks(sid) == empty
    assert not list(path.parent.glob('bookmarks.*.tmp'))


def test_bookmarks_survive_append_and_tracking_with_repeated_source_frame_ids(tmp_path):
    store, sid, row, path = bookmark_fixture(tmp_path)
    store.save_bookmark(sid, 1, row['sha256'], ['occlusion'], 'First saved snapshot')
    frame, bundle = sample_frame(frame_id=91, units='relative')
    row2 = store.capture(sid, bundle, frame)
    assert row2['sha256'] != row['sha256'] and row2['frame_id'] == row['frame_id']
    store.save_bookmark(sid, 2, row2['sha256'], ['crossing'], 'Second saved snapshot')
    # Updating the first index preserves separate identities and sorted order.
    saved = store.save_bookmark(sid, 1, row['sha256'], [], 'First updated')
    assert [item['index'] for item in saved['bookmarks']] == [1, 2]
    assert [item['snapshot_sha256'] for item in saved['bookmarks']] == [row['sha256'], row2['sha256']]
    before = path.read_bytes()
    report = {'session_id': sid, 'total_session_frames': 2,
              'frames': [{'index': 1, 'snapshot_sha256': row['sha256']},
                         {'index': 2, 'snapshot_sha256': row2['sha256']}]}
    store.save_tracking_report(sid, report)
    assert store.tracking_report(sid) == report
    assert path.read_bytes() == before and store.bookmarks(sid) == saved


@pytest.mark.parametrize('tags,note', [
    (['unknown'], ''), (['occlusion', 'occlusion'], ''), ([1], ''), ('crossing', ''),
    ([], 'x' * 1001), ([], 'private\x00note'), ([], 'private\x7fnote'),
    ([], 'private\x85note'), ([], 'private\ud800note'), ([], 42),
])
def test_bookmarks_reject_invalid_tags_and_notes_without_echo(tmp_path, tags, note):
    store, sid, row, path = bookmark_fixture(tmp_path)
    with pytest.raises(SessionError) as error:
        store.save_bookmark(sid, 1, row['sha256'], tags, note)
    assert 'private' not in str(error.value) and not path.exists()


def test_bookmark_identity_rejects_wrong_missing_or_damaged_frame(tmp_path):
    store, sid, row, path = bookmark_fixture(tmp_path)
    for sha in ('', 'z' * 64, 'A' * 64, None):
        with pytest.raises(SessionError):store.save_bookmark(sid, 1, sha)
    for index in (0, 2, True, 1.0):
        with pytest.raises(SessionNotFound):store.save_bookmark(sid, index, row['sha256'])
    for method in (store.save_bookmark, store.delete_bookmark):
        with pytest.raises(SessionIntegrity):method(sid, 1, '0' * 64)
    assert not path.exists()
    store.save_bookmark(sid, 1, row['sha256'], [], 'Kept')
    saved = path.read_bytes()
    bundle_path = path.parent / 'frame-00001.zip'
    bundle = bytearray(bundle_path.read_bytes());bundle[-1] ^= 1
    bundle_path.write_bytes(bundle)
    for action in (lambda:store.bookmarks(sid),
                   lambda:store.save_bookmark(sid, 1, row['sha256']),
                   lambda:store.delete_bookmark(sid, 1, row['sha256'])):
        with pytest.raises(SessionIntegrity):action()
    assert path.read_bytes() == saved


@pytest.mark.parametrize('corruption', [
    'not-json', 'oversized', 'format', 'session', 'unknown-field', 'duplicate',
    'wrong-hash', 'missing-frame', 'bool-index', 'bad-time', 'bad-note', 'bad-tag',
])
def test_corrupt_bookmarks_cannot_be_read_or_overwritten(tmp_path, corruption):
    store, sid, row, path = bookmark_fixture(tmp_path)
    saved = store.save_bookmark(sid, 1, row['sha256'], ['occlusion'], 'Preserved')
    if corruption == 'not-json':raw = b'{private invalid json'
    elif corruption == 'oversized':raw = b' ' * (1024 * 1024 + 1)
    else:
        record = saved['bookmarks'][0]
        if corruption == 'format':saved['format'] = 'unknown'
        elif corruption == 'session':saved['session_id'] = '0' * 32
        elif corruption == 'unknown-field':saved['unknown'] = 'private'
        elif corruption == 'duplicate':saved['bookmarks'].append(dict(record))
        elif corruption == 'wrong-hash':record['snapshot_sha256'] = '0' * 64
        elif corruption == 'missing-frame':record['index'] = 2
        elif corruption == 'bool-index':record['index'] = True
        elif corruption == 'bad-time':record['updated_at'] = float('nan')
        elif corruption == 'bad-note':record['note'] = 'private\x00note'
        elif corruption == 'bad-tag':record['tags'] = ['private']
        raw = json.dumps(saved).encode()
    path.write_bytes(raw)
    for action in (lambda:store.bookmarks(sid),
                   lambda:store.save_bookmark(sid, 1, row['sha256'], [], 'Replacement'),
                   lambda:store.delete_bookmark(sid, 1, row['sha256'])):
        with pytest.raises(SessionIntegrity) as error:action()
        assert 'private' not in str(error.value)
        assert path.read_bytes() == raw


def test_bookmark_symlink_directory_and_duplicate_json_keys_are_refused(tmp_path):
    store, sid, row, path = bookmark_fixture(tmp_path)
    target = tmp_path / 'outside.json';target.write_text('private outside')
    path.symlink_to(target)
    for action in (lambda:store.bookmarks(sid),
                   lambda:store.save_bookmark(sid, 1, row['sha256']),
                   lambda:store.delete_bookmark(sid, 1, row['sha256'])):
        with pytest.raises(SessionIntegrity):action()
    assert target.read_text() == 'private outside' and path.is_symlink()
    path.unlink();path.mkdir()
    with pytest.raises(SessionIntegrity):store.save_bookmark(sid, 1, row['sha256'])
    path.rmdir()
    path.write_text('{"format":"first","format":"second"}')
    with pytest.raises(SessionIntegrity):store.save_bookmark(sid, 1, row['sha256'])


def test_bookmark_atomic_replacement_failure_preserves_existing_file(tmp_path, monkeypatch):
    store, sid, row, path = bookmark_fixture(tmp_path)
    store.save_bookmark(sid, 1, row['sha256'], [], 'Original')
    original = path.read_bytes()
    def fail_replace(_self, _target):
        raise OSError('Synthetic replacement failure')
    monkeypatch.setattr(Path, 'replace', fail_replace)
    with pytest.raises(OSError):store.save_bookmark(sid, 1, row['sha256'], [], 'New')
    assert path.read_bytes() == original and not list(path.parent.glob('bookmarks.*.tmp'))


def test_bookmark_api_routes_strict_input_and_no_value_echo(client_enabled):
    c = client_enabled
    store = api.app.state.session_store
    sid = store.create()['session_id']
    frame, bundle = sample_frame();row = store.capture(sid, bundle, frame)
    url = f'/api/sessions/{sid}/frames/1/bookmark'
    assert c.get(f'/api/sessions/{sid}/bookmarks').json()['bookmarks'] == []
    note = '遮擋 <script>plain text</script>\n檢查 ID'
    body = {'snapshot_sha256': row['sha256'], 'tags': ['occlusion'], 'note': note}
    put = c.put(url, json=body)
    assert put.status_code == 200 and put.json()['bookmarks'][0]['note'] == note
    assert c.get(f'/api/sessions/{sid}/bookmarks').json() == put.json()
    for rejected in ({**body, 'note': 'private\x00note'}, {**body, 'note': 'private' * 200},
                     {**body, 'tags': ['private']}, {**body, 'tags': ['occlusion', 'occlusion']},
                     {**body, 'note': 123}, {**body, 'extra': 'private'}, {'note': 'private'}):
        response = c.put(url, json=rejected)
        assert response.status_code == 422 and 'private' not in response.text
    assert c.put(url, json={'snapshot_sha256': '0' * 64}).status_code == 409
    assert c.put(f'/api/sessions/{sid}/frames/2/bookmark', json=body).status_code == 404
    assert c.request('DELETE', url, json={**body}).status_code == 422
    assert c.request('DELETE', url, json={'snapshot_sha256': row['sha256']}).json()['bookmarks'] == []
    assert c.request('DELETE', url, json={'snapshot_sha256': row['sha256']}).status_code == 200
    assert c.put(url, json={'snapshot_sha256': row['sha256']}).json()['bookmarks'][0]['note'] == ''


def test_bookmark_routes_are_opt_in_and_loopback_only(monkeypatch, tmp_path):
    monkeypatch.delenv('ENABLE_SESSION_STORAGE', raising=False)
    monkeypatch.setattr(api, 'make_engine', lambda key: FakeEngine(key))
    sid = 'a' * 32;body = {'snapshot_sha256': 'a' * 64}
    url = f'/api/sessions/{sid}/frames/1/bookmark'
    with TestClient(api.app, client=('127.0.0.1', 42)) as c:
        assert c.get(f'/api/sessions/{sid}/bookmarks').status_code == 404
        assert c.put(url, json=body).status_code == 404
        assert c.request('DELETE', url, json=body).status_code == 404
    monkeypatch.setenv('ENABLE_SESSION_STORAGE', '1')
    monkeypatch.setattr(api, 'SessionStore', lambda _root: SessionStore(tmp_path / 'local'))
    with TestClient(api.app, client=('192.0.2.11', 42)) as c:
        assert c.get(f'/api/sessions/{sid}/bookmarks').status_code == 403
        assert c.put(url, json=body).status_code == 403
        assert c.request('DELETE', url, json=body).status_code == 403


def bookmark_document(sid, rows, *, note='Synthetic review', tags=None):
    return {'format': BOOKMARK_FORMAT, 'session_id': sid, 'bookmarks': [
        {'index': row['index'], 'snapshot_sha256': row['sha256'],
         'tags': ['occlusion'] if tags is None else tags.copy(), 'note': note,
         'updated_at': 123.5} for row in rows]}


def bookmark_json(document):
    return json.dumps(document, ensure_ascii=False).encode('utf-8')


def test_bookmark_export_import_roundtrip_is_local_private_and_persistent(tmp_path):
    store, sid, row, path = bookmark_fixture(tmp_path)
    manifest = (path.parent / 'session.json').read_bytes()
    bundle = store.bundle(sid, 1)
    note = '遮擋 😀 <script>plain text</script>\n檢查\tID'
    saved = store.save_bookmark(sid, 1, row['sha256'], ['occlusion', 'crossing'], note)
    exported = store.export_bookmarks(sid)
    assert json.loads(exported) == saved and note.split('\n')[0].encode() in exported
    assert set(json.loads(exported)) == {'format', 'session_id', 'bookmarks'}
    store.delete_bookmark(sid, 1, row['sha256'])
    path.unlink()
    preview = store.import_bookmarks(sid, exported)
    assert preview['format'] == BOOKMARK_IMPORT_FORMAT and preview['dry_run'] is True
    assert preview['conflict_policy'] == 'keep' and not path.exists()
    assert re.fullmatch('[0-9a-f]{64}', preview['revision'])
    assert preview['counts'] == {'incoming': 1, 'added': 1, 'updated': 0, 'unchanged': 0, 'conflicts': 0}
    assert preview['document'] == saved
    applied = store.import_bookmarks(sid, exported, dry_run=False, if_match='"' + preview['revision'] + '"')
    assert applied['dry_run'] is False and applied['revision'] != preview['revision']
    assert SessionStore(path.parent.parent).bookmarks(sid) == saved
    assert applied['revision'] == hashlib.sha256(store.export_bookmarks(sid)).hexdigest()
    assert store.bundle(sid, 1) == bundle and (path.parent / 'session.json').read_bytes() == manifest
    assert sorted(p.name for p in path.parent.iterdir()) == ['bookmarks.json', 'frame-00001.zip', 'session.json']
    if os.name == 'posix':assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_bookmark_import_merge_policy_preserves_unmentioned_frames_and_import_timestamp(tmp_path):
    store, sid, row, path = bookmark_fixture(tmp_path)
    frame2, bundle2 = sample_frame(frame_id=91, units='relative')
    row2 = store.capture(sid, bundle2, frame2)
    frame3, bundle3 = sample_frame(frame_id=92)
    row3 = store.capture(sid, bundle3, frame3)
    local = store.save_bookmark(sid, 1, row['sha256'], ['crossing'], 'Local note')['bookmarks'][0]
    unmentioned = store.save_bookmark(sid, 2, row2['sha256'], [], 'Unmentioned')['bookmarks'][1]
    imported = bookmark_document(sid, [row3, row], note='Imported note')
    raw = bookmark_json(imported)
    original = path.read_bytes()
    keep = store.import_bookmarks(sid, raw)
    assert keep['counts'] == {'incoming': 2, 'added': 1, 'updated': 0, 'unchanged': 0, 'conflicts': 1}
    assert path.read_bytes() == original
    assert keep['document']['bookmarks'][:2] == [local, unmentioned]
    overwrite = store.import_bookmarks(sid, raw, 'overwrite')
    assert overwrite['counts'] == {'incoming': 2, 'added': 1, 'updated': 1, 'unchanged': 0, 'conflicts': 1}
    assert path.read_bytes() == original and overwrite['revision'] == keep['revision']
    applied = store.import_bookmarks(sid, raw, 'overwrite', False, overwrite['revision'])
    assert applied['document']['bookmarks'][1] == unmentioned
    assert [item['index'] for item in applied['document']['bookmarks']] == [1, 2, 3]
    assert applied['document']['bookmarks'][0]['updated_at'] == 123.5
    assert applied['document']['bookmarks'][2]['updated_at'] == 123.5
    # Applying keep against an actual conflict preserves the local record byte for byte.
    other = bookmark_document(sid, [row], note='Another conflicting note')
    before = path.read_bytes();preview = store.import_bookmarks(sid, bookmark_json(other))
    result = store.import_bookmarks(sid, bookmark_json(other), dry_run=False, if_match=preview['revision'])
    assert result['counts']['conflicts'] == 1 and result['counts']['updated'] == 0
    assert path.read_bytes() == before


def test_bookmark_import_unchanged_tag_order_timestamps_empty_and_repeat_do_not_write(tmp_path, monkeypatch):
    store, sid, row, path = bookmark_fixture(tmp_path)
    saved = store.save_bookmark(sid, 1, row['sha256'], ['occlusion', 'crossing'], 'Same')
    imported = bookmark_document(sid, [row], note='Same', tags=['crossing', 'occlusion'])
    before = path.read_bytes()
    def unexpected_write(*_args):raise AssertionError('No-op import must not write')
    monkeypatch.setattr(store, '_save_bookmarks', unexpected_write)
    for data, count in ((imported, 1), (bookmark_document(sid, []), 0), (saved, 1)):
        raw = bookmark_json(data)
        for policy in ('keep', 'overwrite'):
            preview = store.import_bookmarks(sid, raw, policy)
            result = store.import_bookmarks(sid, raw, policy, False, preview['revision'])
            assert result['counts'] == {'incoming': count, 'added': 0, 'updated': 0,
                                        'unchanged': count, 'conflicts': 0}
            assert result['document'] == saved and result['revision'] == preview['revision']
            assert path.read_bytes() == before


def test_bookmark_import_apply_requires_current_preview_revision(tmp_path):
    store, sid, row, path = bookmark_fixture(tmp_path)
    raw = bookmark_json(bookmark_document(sid, [row]))
    preview = store.import_bookmarks(sid, raw)
    for token in (None, '', '*', 'W/"' + preview['revision'] + '"', 'private', 'A' * 64):
        with pytest.raises(SessionError) as error:
            store.import_bookmarks(sid, raw, dry_run=False, if_match=token)
        assert 'private' not in str(error.value) and not path.exists()
    store.save_bookmark(sid, 1, row['sha256'], [], 'An intervening edit')
    before = path.read_bytes()
    with pytest.raises(SessionIntegrity, match='changed'):
        store.import_bookmarks(sid, raw, 'overwrite', False, preview['revision'])
    assert path.read_bytes() == before


@pytest.mark.parametrize('mutation', [
    'wrong-session', 'unknown-top', 'unknown-record', 'duplicate-index', 'bool-index',
    'float-index', 'missing-frame', 'wrong-sha', 'bad-tag', 'duplicate-tag', 'bad-note',
    'long-note', 'surrogate-note', 'zero-time', 'negative-time', 'bool-time', 'infinite-time',
    'nan-time', 'format', 'missing-key', 'non-list',
])
def test_bookmark_import_rejects_entire_invalid_document_before_writing(tmp_path, mutation):
    store, sid, row, path = bookmark_fixture(tmp_path)
    store.save_bookmark(sid, 1, row['sha256'], [], 'Preserved')
    frame, bundle = sample_frame(frame_id=92);row2 = store.capture(sid, bundle, frame)
    document = bookmark_document(sid, [row2, row])
    record = document['bookmarks'][-1]
    if mutation == 'wrong-session':document['session_id'] = '0' * 32
    elif mutation == 'unknown-top':document['private'] = 'private'
    elif mutation == 'unknown-record':record['private'] = 'private'
    elif mutation == 'duplicate-index':document['bookmarks'].append(dict(record))
    elif mutation == 'bool-index':record['index'] = True
    elif mutation == 'float-index':record['index'] = 1.0
    elif mutation == 'missing-frame':record['index'] = 3
    elif mutation == 'wrong-sha':record['snapshot_sha256'] = '0' * 64
    elif mutation == 'bad-tag':record['tags'] = ['private']
    elif mutation == 'duplicate-tag':record['tags'] = ['occlusion', 'occlusion']
    elif mutation == 'bad-note':record['note'] = 'private\x00note'
    elif mutation == 'long-note':record['note'] = 'private' * 200
    elif mutation == 'surrogate-note':record['note'] = 'private\ud800note'
    elif mutation == 'zero-time':record['updated_at'] = 0
    elif mutation == 'negative-time':record['updated_at'] = -1
    elif mutation == 'bool-time':record['updated_at'] = True
    elif mutation == 'infinite-time':record['updated_at'] = float('inf')
    elif mutation == 'nan-time':record['updated_at'] = float('nan')
    elif mutation == 'format':document['format'] = 'private'
    elif mutation == 'missing-key':del record['tags']
    elif mutation == 'non-list':document['bookmarks'] = 'private'
    raw = json.dumps(document).encode('utf-8')
    before = path.read_bytes();preview = store.import_bookmarks(sid, bookmark_json(bookmark_document(sid, [])))
    for dry_run in (True, False):
        with pytest.raises(SessionError) as error:
            store.import_bookmarks(sid, raw, 'overwrite', dry_run, preview['revision'])
        assert 'private' not in str(error.value) and path.read_bytes() == before
        assert not list(path.parent.glob('bookmarks.*.tmp'))


@pytest.mark.parametrize('raw', [b'\xffprivate', b'\xef\xbb\xbf{}', b'{private', b'[]', b'null',
                                b'{"private":0,"private":1}', b'{"bookmarks":[NaN]}',
                                b'{"bookmarks":[Infinity]}', b'[' * 1100 + b']' * 1100])
def test_bookmark_import_strict_json_without_private_error_echo(tmp_path, raw):
    store, sid, row, path = bookmark_fixture(tmp_path)
    with pytest.raises(SessionError) as error:store.import_bookmarks(sid, raw)
    assert 'private' not in str(error.value) and not path.exists()


def test_bookmark_import_limits_duplicate_nested_keys_and_damaged_bundle(tmp_path):
    store, sid, row, path = bookmark_fixture(tmp_path)
    doc = bookmark_document(sid, [row]);raw = bookmark_json(doc)
    duplicate = raw.replace(b'"index": 1', b'"index": 1, "index": 1')
    with pytest.raises(SessionError):store.import_bookmarks(sid, duplicate)
    with pytest.raises(SessionLimit):store.import_bookmarks(sid, b' ' * (MAX_BOOKMARK_BYTES + 1))
    assert not path.exists()
    bundle_path = path.parent / 'frame-00001.zip'
    bundle_path.write_bytes(b'not original')
    with pytest.raises(SessionError):store.import_bookmarks(sid, raw)
    assert not path.exists()


@pytest.mark.parametrize('corruption', ['invalid', 'symlink', 'directory'])
def test_bookmark_transfer_refuses_corrupt_existing_storage(tmp_path, corruption):
    store, sid, row, path = bookmark_fixture(tmp_path)
    target = tmp_path / 'outside.json';target.write_text('private outside')
    if corruption == 'invalid':path.write_bytes(b'{private invalid')
    elif corruption == 'symlink':path.symlink_to(target)
    else:path.mkdir()
    raw = bookmark_json(bookmark_document(sid, [row]))
    for action in (lambda:store.export_bookmarks(sid), lambda:store.import_bookmarks(sid, raw)):
        with pytest.raises(SessionIntegrity) as error:action()
        assert 'private' not in str(error.value)
    assert target.read_text() == 'private outside'


def test_bookmark_import_atomic_replace_failure_preserves_original(tmp_path, monkeypatch):
    store, sid, row, path = bookmark_fixture(tmp_path)
    store.save_bookmark(sid, 1, row['sha256'], [], 'Original')
    raw = bookmark_json(bookmark_document(sid, [row], note='Replacement'))
    preview = store.import_bookmarks(sid, raw, 'overwrite');before = path.read_bytes()
    def fail_replace(_self, _target):raise OSError('Synthetic replacement failure')
    monkeypatch.setattr(Path, 'replace', fail_replace)
    with pytest.raises(OSError):store.import_bookmarks(sid, raw, 'overwrite', False, preview['revision'])
    assert path.read_bytes() == before and not list(path.parent.glob('bookmarks.*.tmp'))


def test_bookmark_transfer_http_download_preview_apply_and_stale_revision(client_enabled):
    c = client_enabled;store = api.app.state.session_store
    sid = store.create()['session_id'];frame, bundle = sample_frame();row = store.capture(sid, bundle, frame)
    prefix = f'/api/sessions/{sid}/bookmarks'
    exported = c.get(prefix + '/export')
    assert exported.status_code == 200 and exported.headers['content-type'] == 'application/json'
    assert exported.headers['content-disposition'] == f'attachment; filename="depthport-bookmarks-{sid}.json"'
    assert exported.headers['cache-control'] == 'no-store'
    assert exported.json() == bookmark_document(sid, [])
    raw = bookmark_json(bookmark_document(sid, [row], note='遮擋測試'))
    preview = c.post(prefix + '/import', content=raw)
    assert preview.status_code == 200 and preview.json()['dry_run'] is True
    assert store.bookmarks(sid)['bookmarks'] == []
    assert c.post(prefix + '/import?dry_run=false', content=raw).status_code == 422
    applied = c.post(prefix + '/import?dry_run=false', content=raw,
                     headers={'If-Match': '"' + preview.json()['revision'] + '"'})
    assert applied.status_code == 200 and applied.json()['counts']['added'] == 1
    assert c.get(prefix + '/export').json() == applied.json()['document']
    stale = c.post(prefix + '/import?dry_run=false&conflict=overwrite', content=raw,
                   headers={'If-Match': preview.json()['revision']})
    assert stale.status_code == 409
    for query in ('?conflict=private', '?dry_run=private'):
        bad = c.post(prefix + '/import' + query, content=raw)
        assert bad.status_code == 422 and 'private' not in bad.text
    invalid = c.post(prefix + '/import', content=b'{private')
    assert invalid.status_code == 422 and 'private' not in invalid.text
    assert c.post(prefix + '/import', content=raw, headers={'Origin': 'https://example.invalid'}).status_code == 403
    assert c.post(prefix + '/import', content=raw, headers={'Sec-Fetch-Site': 'cross-site'}).status_code == 403


def test_bookmark_import_api_rejects_declared_and_streamed_oversize(client_enabled):
    c = client_enabled;store = api.app.state.session_store;sid = store.create()['session_id']
    url = f'/api/sessions/{sid}/bookmarks/import'
    assert c.post(url, content=b'{}', headers={'Content-Length': str(MAX_BOOKMARK_BYTES + 1)}).status_code == 413
    assert c.post(url, content=b'{}', headers={'Content-Length': '-1'}).status_code == 422
    assert c.post(url, content=b'{}', headers={'Content-Length': 'private'}).status_code == 422
    def chunks():
        yield b' ' * (MAX_BOOKMARK_BYTES // 2)
        yield b' ' * (MAX_BOOKMARK_BYTES // 2 + 1)
    assert c.post(url, content=chunks()).status_code == 413
    assert store.bookmarks(sid)['bookmarks'] == []


def test_bookmark_transfer_api_gates_before_reading_body(monkeypatch, tmp_path):
    monkeypatch.delenv('ENABLE_SESSION_STORAGE', raising=False)
    monkeypatch.setattr(api, 'make_engine', lambda key: FakeEngine(key))
    sid = 'a' * 32;prefix = f'/api/sessions/{sid}/bookmarks'
    with TestClient(api.app, client=('127.0.0.1', 42)) as c:
        assert c.get(prefix + '/export').status_code == 404
        assert c.post(prefix + '/import?dry_run=private', content=b'private').status_code == 404
    monkeypatch.setenv('ENABLE_SESSION_STORAGE', '1')
    monkeypatch.setattr(api, 'SessionStore', lambda _root: SessionStore(tmp_path / 'local'))
    with TestClient(api.app, client=('192.0.2.11', 42)) as c:
        assert c.get(prefix + '/export').status_code == 403
        assert c.post(prefix + '/import?dry_run=private', content=b'private').status_code == 403
