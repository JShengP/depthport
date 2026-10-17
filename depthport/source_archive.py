# SPDX-License-Identifier: AGPL-3.0-only
"""Build a source-only archive from an explicit, reviewed public-file manifest.

Never recurse over a running server's project tree: it may contain credentials,
images, calibration data or downloaded weights. New code must be added to the
manifest deliberately. The release verifier checks for omitted source files.
"""
from __future__ import annotations

import io
from pathlib import Path, PurePosixPath
import zipfile
from depthport import __version__

MAX_SOURCE_BYTES = 32 * 1024 * 1024

# Fail-closed exclusions even when someone explicitly edits PUBLIC_FILES.txt.
# Allowed raster images are manually reviewed, synthetic UI previews only.
PRIVATE_PATH_PARTS = frozenset({
    "private", "customer", "customers", "client", "clients", "internal",
    "confidential", "proprietary", "deployment", "deployments",
    "secrets", "credentials", "recordings", "snapshots", "clips",
    "captured", "site-config", "site-configs", "customer-data",
})
BLOCKED_SUFFIXES = frozenset({
    ".pt", ".pth", ".safetensors", ".onnx", ".engine",
    ".npy", ".npz", ".ply", ".pcd", ".las", ".laz",
    ".pem", ".key", ".p12", ".pfx", ".p8", ".kdbx", ".jks",
    ".db", ".sqlite", ".sqlite3", ".mp4", ".avi", ".mov",
    ".mkv", ".webm", ".dng", ".raw", ".heic", ".zip",
    ".tar", ".gz", ".7z",
})
RASTER_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"})
PUBLIC_SYNTHETIC_PREVIEWS = frozenset({
    "docs/assets/preview.en.png", "docs/assets/preview.zh-TW.png",
    "docs/assets/spatial-preview.en.png", "docs/assets/spatial-preview.zh-TW.png",
})


def public_files(root: Path) -> list[Path]:
    root = root.resolve()
    entries = (root / "PUBLIC_FILES.txt").read_text(encoding="utf-8").splitlines()
    files: list[Path] = []
    seen: set[str] = set()
    for raw in entries:
        name = raw.strip()
        if not name or name.startswith("#"):
            continue
        posix = PurePosixPath(name)
        if (posix.is_absolute() or ".." in posix.parts or "\\" in name
                or ":" in name or name in seen or name != posix.as_posix()):
            raise ValueError("Unsafe or duplicate entry in public source manifest")
        if any(part.startswith(".env") and part != ".env.example" for part in posix.parts):
            raise ValueError("Runtime environment files must never be distributed")
        if any(part.lower() in PRIVATE_PATH_PARTS | {
                ".git", "outputs", "__pycache__", ".venv-depthport"}
               for part in posix.parts):
            raise ValueError("Private or generated directory in public manifest")
        suffix = posix.suffix.lower()
        if suffix in BLOCKED_SUFFIXES:
            raise ValueError("Model, recording, result or secret in public source manifest")
        if suffix in RASTER_SUFFIXES and name not in PUBLIC_SYNTHETIC_PREVIEWS:
            raise ValueError("Public raster image needs explicit synthetic-preview review")
        if posix.name.startswith("camera_intrinsics") and name != "camera_intrinsics.example.json":
            raise ValueError("Live camera calibration must never be distributed")
        path = root / name
        # Reject symlinks at every path component, not only the final file.
        if any((root.joinpath(*posix.parts[:i])).is_symlink()
               for i in range(1, len(posix.parts) + 1)):
            raise ValueError("Symlinks are not allowed in public source archives")
        if not path.is_file() or not path.resolve().is_relative_to(root):
            raise ValueError(f"Missing public source file: {name}")
        seen.add(name)
        files.append(path)
    if not files or sum(p.stat().st_size for p in files) > MAX_SOURCE_BYTES:
        raise ValueError("Source manifest is empty or exceeds the 32 MiB safety limit")
    return sorted(files, key=lambda p: p.relative_to(root).as_posix())


def source_bytes(root: Path) -> bytes:
    """Reproducible ZIP bytes; never includes arbitrary files from a live server."""
    root = root.resolve()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in public_files(root):
            name = f"depthport-{__version__}/{path.relative_to(root).as_posix()}"
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 17, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if path.suffix == ".sh" else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())
    return buf.getvalue()
