# v0.3 research prototype — Manual Sessions & Offline Replay
[繁體中文](../zh-TW/sessions.md) · [Home](../../README.md)

**Status: experimental development branch, NOT yet released or hardware verified.** The v0.2 Spatial Analysis code remains integrated; v0.3 adds a **manual, opt-in, local-only** archive viewer. It does not record RTSP video continuously, run model inference on saved data, or offer true pixel-tracking/temporal geometry fusion.

## Enable (local machine only)

1. Clone/check out the v0.3 development branch and install as documented. This feature does not require installing a new ML package beyond the existing application environment.
2. Edit your **local** `.env` or set the environment variable `ENABLE_SESSION_STORAGE=1` and **restart** the app. It defaults to `0` and must never be enabled as a public unauthenticated service.
3. Run `bash RUN_UBUNTU.sh` or `RUN_WINDOWS.bat`, open `http://127.0.0.1:8000/sessions`, create a labeled session, and click **Save latest frame** after the main viewer has produced a real depth result.
4. Select a saved frame and click **Replay**. The UI reads the preserved RGB, depth preview and downsampled XYZRGB PLY; it **does not call any model**. Download the original exact-frame ZIP to obtain full raw depth (`model_raw_depth.npy`), final depth NPY, PLY, calibration/unit metadata and optional spatial analysis report.

## Data & retention contract

- The archive is **not** stored in Git, `static/` or Pages: `outputs/sessions/<UUID4>/session.json` + `frame-00001.zip`, etc.
- A session is created explicitly; every captured frame requires its own button press or API POST. No timers/background recording or hidden RTSP authentication collection.
- `session.json` is an index with timestamps, source **type** (`image`/`rtsp`, never stream URL), frame ID, engine/model/units, original source hash when available, depth-summary metadata, size and SHA-256 of the exact ZIP.
- Hard per-session limits: **120 frames** and **256 MiB**, **20 sessions**, **20 MiB compressed frame**. Capacity exhaustion returns an error rather than deleting older frames automatically.
- Local frame files use private file permissions where supported; replay refuses a tampered SHA-256, mismatched format or symlinked frame. Sessions are never uploaded by the app.
- The replay summary shows per-engine depth median trends, grouped by native units. Different model units are never subtracted, and a trend is **not** temporal pixel correspondence, real-world camera displacement or verified distance drift.

## API (loopback client & opt-in required)

| Method | Route | Meaning |
|---|---|---|
| GET | `/api/sessions/status` | Verify manual capture is enabled |
| GET/POST | `/api/sessions` | List / create session with optional label |
| GET | `/api/sessions/{sid}/frames` | Frame index |
| POST | `/api/sessions/{sid}/capture` | Save one latest completed result |
| GET | `/api/sessions/{sid}/frames/{index}/replay` | Read-only RGB/depth/compact 3D viewer payload |
| GET | `/api/sessions/{sid}/frames/{index}/bundle.zip` | Exact original same-frame ZIP |
| GET | `/api/sessions/{sid}/temporal` | Per-model depth-summary trend only |

Storage and API access are refused for non-loopback peers. No multiuser authentication, automatic retention deletion, live video recorder or write-ahead DB is implemented. Treat local archives as potentially sensitive images and manage storage and backups accordingly.

## Validation

```bash
python -m pytest -q tests/test_sessions.py
node tests/test_sessions_i18n.cjs
python tools/check_release.py
```

Tests create *synthetic* fixed-depth fixtures and a fake local inference engine only. They validate ZIP integrity, immutable bytes, replay geometry encoding, session bounds, provenance/units, disabled-by-default behavior and non-loopback denial; **not** real model success, RTSP long-run or real geometric accuracy.
