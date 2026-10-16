# SPDX-License-Identifier: AGPL-3.0-only
"""Public release surface checks. No pretrained models or external services."""
from pathlib import Path
import io
import zipfile
import pytest
from fastapi.testclient import TestClient
from depthport.api import app
from depthport.source_archive import public_files, source_bytes


def test_about_and_headers():
    with TestClient(app) as c:
        r = c.get('/api/about')
        assert r.status_code == 200
        assert r.json()['license'] == 'AGPL-3.0-only'
        assert r.json()['distance_validated'] is False
        assert r.headers['X-Frame-Options'] == 'DENY'
        assert r.headers['Referrer-Policy'] == 'no-referrer'


def test_unknown_host_denied():
    with TestClient(app) as c:
        assert c.get('/api/status', headers={'host': 'untrusted.example.invalid'}).status_code == 400


def test_rejected_body_does_not_echo_credentials():
    value = 'rtsp://private-user:private-pass@camera.invalid/stream'
    with TestClient(app) as c:
        r = c.post('/api/model', json={'engine': value})
        assert r.status_code == 422
        assert 'private-pass' not in r.text
        assert value not in r.text


@pytest.mark.parametrize('entry', ['../outside.py', '/absolute.py', '.env', 'private/image.jpg',
                                  'outputs/result.png', 'model.pt', 'secret.pem', 'a\\b.py'])
def test_manifest_rejects_private_paths(tmp_path, entry):
    (tmp_path/'PUBLIC_FILES.txt').write_text(entry+'\n', encoding='utf-8')
    with pytest.raises(ValueError): public_files(tmp_path)


def test_source_archive_explicit_and_repeatable(tmp_path):
    (tmp_path/'PUBLIC_FILES.txt').write_text('app.py\nPUBLIC_FILES.txt\n', encoding='utf-8')
    (tmp_path/'app.py').write_text('print("public")\n', encoding='utf-8')
    (tmp_path/'.env').write_text('PRIVATE_VALUE=never_distribute\n')
    one = source_bytes(tmp_path)
    assert one == source_bytes(tmp_path)
    with zipfile.ZipFile(io.BytesIO(one)) as z:
        assert len(z.namelist()) == 2
        assert not any('.env' in n for n in z.namelist())


def test_source_route_has_manifest_archive():
    with TestClient(app) as c:
        r = c.get('/api/source-code.zip')
        assert r.status_code == 200
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            assert any(n.endswith('/LICENSE') for n in z.namelist())
            assert any(n.endswith('/static/i18n.js') for n in z.namelist())
            assert not any(n.endswith('/.env') for n in z.namelist())
