# Architecture and API
[繁體中文](../zh-TW/architecture.md) · [Home](../../README.md)

`app.py` is the source-checkout launcher. `depthport/api.py` owns FastAPI and the shared service; `capture.py` retains the latest decoded frame; `engines.py`, `v2_engine.py` and `yolo_engine.py` implement adapters; `cloud.py` handles camera geometry and export. `static/` is dependency-free browser code, with a local `i18n.js` dictionary.

A single worker serializes model calls and unload/load transitions. One source and one model are shared by every browser. HTTP requests enqueue work rather than downloading weights inside a request handler. Generation tokens invalidate in-flight output after changing source/model. This does not forcibly cancel a native decoder, model call or network download.

| Method | Route | Contract |
|---|---|---|
| GET | `/api/about` | Version, license, shared-session status and public source link |
| GET | `/api/models` | Four presets; package detection is not inference validation |
| POST | `/api/model` | JSON `{"engine":"da2-small"}`; 202 means queued |
| POST | `/api/image` | multipart `file`; accepted JPG/PNG/WEBP, 12 MB cap; 202 |
| POST | `/api/reprocess` | Requeue retained image; 202 |
| POST | `/api/source` | JSON `{"url":"rtsp://camera.example.invalid/stream"}`; 202 |
| POST | `/api/source/stop` | Clear source/results, invalidate stale work |
| GET | `/api/status` | Model/source states, errors, generation and session |
| GET | `/api/latest?after=N` | Latest completed frame; 204 if no newer one |
| GET | `/api/export.ply` | Latest XYZRGB point cloud |
| GET | `/api/depth.npy` | Final depth used by geometry |
| GET | `/api/frame.json` | Current metadata without large payloads |
| GET | `/api/export.zip` | Atomic same-frame analysis bundle |
| GET | `/api/source-code.zip` | Manifest-listed public source; excludes runtime files |

The frame transport uses 16 bytes/point: XYZ little-endian float32 plus RGBA uint8, encoded as Base64 JSON with aligned RGB/depth previews. Polling and Base64 are intentional PoC tradeoffs, not a high-FPS multi-client transport.

`pipeline_ms` excludes model loading, RTSP decode and network/browser delivery. Model loading is `last_model_load_ms`. YOLO stage time, V2 predict wall time and DA3 API wall time measure different spans. `received_to_publish_ms` begins after host decode, **not sensor exposure**. See the benchmark guide.

The default Host allowlist, same-origin write guard and credential-redaction reduce accidental exposure but do not authenticate a caller. A source ZIP is built only from `PUBLIC_FILES.txt`; never auto-add private runtime files. Maintain the manifest with source changes so the offered source matches the running version.
