# SPDX-License-Identifier: AGPL-3.0-only
"""Offline source release guardrails: only synthetic/dummy paths and bytes."""
import pytest
from depthport.source_archive import public_files, PRIVATE_PATH_PARTS, BLOCKED_SUFFIXES


@pytest.mark.parametrize("name", [
    "customers/site-A/site.json", "internal/notes.txt", "deployments/camera.yaml",
    "recordings/stream.mp4", "snapshots/image.png", "client/integration.py",
    "secrets/parameters.json", "configs/private/auth.json",
    "model.engine", "frame.npz", "capture.pcd", "camera.key",
    "camera.p12", "checkpoints/model.safetensors", "frames/raw.mov",
    "docs/assets/unreviewed.jpg", "docs/assets/live-camera.png",
    "camera_intrinsics.real.json", "camera_intrinsics.json",
])
def test_manifest_rejects_sensitive_content_even_if_selected(tmp_path, name):
    path = tmp_path / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"dummy placeholder only")
    (tmp_path / "PUBLIC_FILES.txt").write_text(name + "\n", encoding="utf-8")
    with pytest.raises(ValueError):
        public_files(tmp_path)


@pytest.mark.parametrize("name", [
    "docs/assets/preview.en.png", "docs/assets/preview.zh-TW.png",
    "docs/assets/spatial-preview.en.png", "docs/assets/spatial-preview.zh-TW.png",
])
def test_explicit_reviewed_synthetic_previews_allowed(tmp_path, name):
    path = tmp_path / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"synthetic UI preview only")
    (tmp_path / "PUBLIC_FILES.txt").write_text(name + "\n", encoding="utf-8")
    assert [p.relative_to(tmp_path).as_posix() for p in public_files(tmp_path)] == [name]


def test_guardrail_categories():
    assert {"customers", "internal", "recordings"}.issubset(PRIVATE_PATH_PARTS)
    assert {".p12", ".npz", ".mp4"}.issubset(BLOCKED_SUFFIXES)
