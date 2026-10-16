# Usage and troubleshooting
[繁體中文](../zh-TW/usage.md) · [Home](../../README.md)

## Image and camera workflow

Upload JPG, PNG or WEBP, up to 12 MB. Requests return HTTP 202 when queued. Wait for a frame/result; model-ready alone is not an inference success. Select a different preset and click **Apply / retry model** to rerun the retained image. Source SHA-256 is included in exports; compare the same file, not two unrelated frames.

RTSP runs on the server's network. The app retains the latest decoded frame while the selected model works. Switching models preserves the reader, waits for a running call, unloads the old model, then loads the requested one. In-flight calls/downloads cannot be force-cancelled safely; the last request wins after they return. Stale generations are discarded.

**Stop source** clears the source and result, not necessarily the loaded model. **Try viewer** stops the source and shows clearly labeled synthetic data; model exports are disabled. Multiple browser windows control the same state.

## Language

Choose **English** or **繁體中文** in the header. URL parameter takes priority on first load, followed by saved choice, then browser language; other languages fall back to English. Chinese language preferences use Traditional Chinese. Selecting a language also updates an existing language query so reload does not revert it. Storage failure is non-fatal. No image or string is sent to a translation API.

The selection does not trigger inference, switch models, reset the camera pose or change numbers. Backend error text and model IDs are retained verbatim for diagnostics.

## Geometry and exports

Left drag orbits, right drag / Shift drag pans, and the wheel zooms. Point size and depth stretch only change the viewer; non-1.0× stretch is explicitly labeled. Rotating the viewpoint reveals missing data behind surfaces—not a reconstructed backside.

PLY contains XYZRGB with X right, Y up and camera toward −Z. NPY contains positive camera-axis Z, **not Euclidean ray distance**. The same-frame ZIP includes final depth, `model_raw_depth.npy`, aligned `rgb_aligned.png`, metadata and a depth preview. Optional confidence/sky arrays are included only when returned by the model. Independent downloads during RTSP may refer to different frames; use the ZIP for analysis.

## Troubleshooting

| Symptom | What to check |
|---|---|
| No results after HTTP 202 | Status, selected generation, model load/download error and package installation |
| Model download fails | Outbound access, proxy, trusted local weights, matching model config |
| CUDA requested but unavailable | The venv's torch build, driver and GPU; explicit CUDA never silently becomes CPU |
| V2 looks stretched or fluctuates | Display-only p5/p95 mapping, per-frame scaling, assumed intrinsics |
| DA3 shape mismatch | Config/checkpoint identity, processed resize and matching camera intrinsics; do not silently crop |
| RTSP has no image | Reachability from the Python host, actual path/codec/authentication, encoded password characters |
| Browser says backend offline | Server, port, firewall, same origin and `DEPTHPORT_ALLOWED_HOSTS` |
| `Invalid host header` | Add the intended local/LAN hostname to the explicit allowlist; do not use a wildcard |
| WebGL unavailable | Canvas2D fallback is slower; test actual browser/GPU settings separately |
| All points disappear | Depth bounds, confidence percentile, optional sky filtering |
| Static demo cannot upload/connect | Expected: the static demo has no backend or AI inference |

Avoid exposing passwords in screenshots and logs. Native OpenCV/FFmpeg output can still contain connection details even when Python-level errors are redacted.
