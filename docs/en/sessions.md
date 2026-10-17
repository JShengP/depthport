# v0.3 research prototype — Manual Sessions & Offline Replay
[繁體中文](../zh-TW/sessions.md) · [Home](../../README.md)

**Status: experimental development branch, not yet released; physical-camera acceptance remains pending.** The v0.2 Spatial Analysis code remains integrated; v0.3 adds a **manual, opt-in, local-only** archive viewer. It does not record RTSP video continuously or perform pose-compensated pixel/3D tracking. Replay itself never reruns depth inference; a separate, explicitly requested offline tracking action can run YOLO Detect/Segment on saved RGB frames.

**2026-10-17 pilot:** genuine CUDA depth and CPU YOLO Detect/Segment passed the 24-frame saved-session path on a public video, including integrity and replay. A separate 179-frame tracking comparison includes Roboflow Trackers. See [conditions, results and limitations](tracking-evaluation.md#real-video-pilot--2026-10-17); these are not physical-camera or metric-accuracy acceptance.


**2026-10-18:** Optional [Roboflow BoT-SORT worker](tracking-worker.md) now supports Session analysis in a separate NumPy 2 environment; the default remains Simple association.

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
| GET | `/api/sessions/{sid}/consistency` | Same-grid offline pair metrics and skips |
| GET | `/api/sessions/{sid}/consistency/report.json` | Download offline JSON report |

Storage and API access are refused for non-loopback peers. No multiuser authentication, automatic retention deletion, live video recorder or write-ahead DB is implemented. Treat local archives as potentially sensitive images and manage storage and backups accordingly.

## Temporal depth consistency (offline, v0.3 extension)

Capture **two or more manual snapshots** with the same depth engine, model ID, units, camera intrinsics and source type. The Sessions page calculates a read-only report from saved numeric `depth_*.npy` values: full-grid valid-depth percentage; paired valid-pixel overlap; signed / absolute / RMS / P95 **native-depth** changes for `estimated_m` models; and per-pair normalized **shape** MAE. `relative` engines show only the latter, never nominal metres.

`GET /api/sessions/{sid}/consistency` returns detailed grouped frames and up to **32** sampled, compatible frame pairs. `GET /api/sessions/{sid}/consistency/report.json` downloads the same JSON. SHA-256 is rechecked for every stored bundle before analysis. Incompatible dimensions, intrinsic parameters or source modes are **skipped with reasons**. At most 8192 overlapping pixels per compatible pair are sampled to bound calculation; coverage proportions use the full grid.

**Interpretation:** Same pixel index is not the same physical surface if the camera or object moves. This is neither optical-flow tracking nor camera-motion compensation, physical-scale drift, stereo reconstruction, per-frame FPS, or field measurement accuracy. Manually saved frames can have irregular time gaps. For a controlled static-camera stability test, record scene/camera motion and illumination conditions externally and compare samples from the same calibrated stream profile. Actual video collection is still **not** automatic.

## Validation

```bash
python -m pytest -q tests/test_sessions.py
node tests/test_sessions_i18n.cjs
python tools/check_release.py
```

Tests create *synthetic* fixed-depth fixtures and a fake local inference engine only. They validate ZIP integrity, immutable bytes, replay geometry encoding, session bounds, provenance/units, disabled-by-default behavior and non-loopback denial; **not** real model success, RTSP long-run or real geometric accuracy.

## Offline Semantic Object Tracking (development addition)

The Sessions page includes an explicit **Analyse saved frames** action. With `ENABLE_SESSION_STORAGE=1`, first manually save 2–24 frames into the same Session, select **Instance segmentation** (default) or **Bounding-box regions**, then trigger the analysis. The job runs **on CPU** so that the already-running depth worker does not concurrently allocate additional GPU inference; YOLO Detect/Segment weights may be downloaded on the first run. Existing saved depth is reused; **no additional depth inference, background capture, camera recording, or automatic upload** occurs.

The analysis verifies saved ZIP SHA-256 digests, RGB/depth grid shape and camera intrinsics, then performs YOLO Detect/Segment on each stored aligned RGB image. Its simple association matches objects of the same class using bounding-box IoU plus restricted pixel-center motion. Each continuous association receives a sequential `obj-0001`, `obj-0002`, ... identifier. IDs intentionally reset on changes of source kind, depth engine/model, native depth units, intrinsics or image grid. Missed detections, object crossings and occlusion may produce new IDs or ID switches: **this is not ReID and does not identify people**.

For each observation the report records session frame index, original frame ID/time, 2D bounding box/centroid, class/confidence, native median depth, and camera-frame median XYZ computed from its mask/ROI and the saved camera intrinsics. Detection bounding-box ROI includes background pixels; segmentation is preferred. Relative depths remain relative, while estimated metres remain **unvalidated AI estimates**. Camera XYZ is **not world XYZ**: even if numbers resemble motion, it is not pose-corrected 3D trajectory, speed, metric object dimension or obstacle clearance. Cross-camera/coordinate-frame tracking is not supported.

After the asynchronous CPU job finishes, a `tracking.json` report is stored locally inside the Session directory and can be reviewed/exported. Adding a new saved frame invalidates the report and requires an explicit rerun. One analysis job runs at a time, maximum 24 most recent frames per job and 20 objects per frame. No automatic deletion is performed.

### Tracking API (local loopback only, storage opt-in)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/sessions/{sid}/tracking` | Start manual job: `{ "mode": "segment", "confidence": 0.25, "max_frames": 12 }` |
| GET | `/api/sessions/{sid}/tracking/status` | Job state `idle`, `running`, `completed` or `error` |
| GET | `/api/sessions/{sid}/tracking/report.json` | Read stored JSON; `?download=true` sets attachment disposition |

The analysis is optional. If `ultralytics` or the selected YOLO weights are absent, the job reports an error rather than synthetic detection results. Model-free tests inject an **explicit fake detector**; the CLI and HTTP tests **do not prove real YOLO tracking works on a physical camera**. Perform a separate CPU YOLO detection/segmentation check and inspect the identities across an authorized multi-frame test before claiming actual tracking performance.

### Tracking acceptance evidence

Use the [offline tracking acceptance evaluator](tracking-evaluation.md) to compare `tracking.json` against manually annotated visible objects, including occlusion, crossings, misses and ID switches. This adds a reproducible model-free benchmark diagnostic; no automatic video capture is added.


Use a shareable video-derived sequence with object entries/exits, occlusion and crossing. Compare track-ID switches, lost tracks and per-class association counts against manually reviewed labels; separately verify median camera-frame XYZ against the saved depth and intrinsics. Only a real YOLO Detect/Segment run with actual weights qualifies as model validation; synthetic fixtures and CI establish software behavior only.

## Inspect tracking IDs on replay

After tracking finishes, select **Replay analysed frames** to open the first frame in that report. The aligned RGB image shows the report's original detection boxes and **Object ID · class** labels. Colors stay fixed for the same ID within an analysis; displaced labels have a connector to their box. Use **Previous frame / Next frame** or choose a saved frame to replay it. The default analysis covers the latest 12 saved frames, so earlier frames may have no analysis.

The **Tracking boxes and Object IDs** checkbox hides/shows the overlay. A frame with no confirmed tracked detections shows no boxes. Unanalysed frames, missing reports and stale or mismatched snapshots show a message rather than borrowing another frame's IDs. Matching requires the same Session, saved index, total frame count and exact snapshot SHA-256, plus model/unit metadata. This also distinguishes saved frames whose original source frame IDs repeat. Switching Sessions, replay requests and tracking reruns clear old overlays; only the latest selected replay response may render.

The display uses original saved-image pixel coordinates, including after resizing. Replay and overlays do not rerun inference or alter RGB/depth, tracking results, downloaded bundles or native geometry. Inspecting an ID across occlusion/crossing is a visual diagnostic; colors and IDs are not proof of person identity or world-space continuity. Browser verification uses local public-sequence frames; screenshots, real imagery and per-frame annotations remain outside the public source archive.

## Continuous saved-frame playback

Replay a frame (or choose **Replay analysed frames**), then use **Play / Pause** above the RGB image. Speed choices are **0.25×, 0.5×, 1× and 2×**. The default **1× targets 5 saved frames/second**; this is a fixed preview cadence, not the original video frame rate or elapsed time between manually captured snapshots. Slower loading reduces the actual rate. No frames are skipped or interpolated to catch up.

Only one automatic replay request/decode runs at a time. The last fully presented RGB/depth/IDs remain visible while the next saved frame loads and decodes; the next image, matching overlay and point cloud are then presented together. Pause keeps the currently displayed frame and invalidates any pending automatic presentation. Changing speed applies to subsequent scheduling without changing tracking IDs or source timestamps.

Playback pauses when you seek, step, change Sessions, refresh, capture, create a Session, rerun tracking, hide the tab or leave the page. It stops at the last saved frame; pressing Play there starts again at the first saved frame. Playback follows the saved-frame list, including frames outside the latest tracking report: those frames show the existing unanalysed/missing-result message, never another frame's IDs. Replay does not record a camera, run a model or upload data.

## Drag the replay progress bar

The **Playback progress** slider shows the displayed saved-frame position and total count, and follows Play/Pause, Previous/Next and the saved-frame selector. Dragging pauses playback and previews the target alongside the still-displayed position. Release to load that frame; its RGB/depth, exact matching boxes/IDs and point cloud appear together once decoded. Loading or failed seeks do not relabel the old image as the target frame.

The bar uses saved-frame order, not elapsed video time or the source `frame_id`. It covers the entire Session, including frames outside the tracking report; the usual unanalysed/missing-result message applies there. Use native keyboard arrows and Home/End for precise movement. The bar is disabled for zero/one saved frame. Dragging back to the displayed frame requires no new request.

Drag movement itself sends no replay requests. New release requests invalidate older pending results; Session changes and page hiding cancel pending previews. A failed jump leaves the last displayed frame, IDs and committed progress intact and reports an error. The progress readout and accessible slider text are available in English and Traditional Chinese; no replay data is uploaded or added to the public source archive.
