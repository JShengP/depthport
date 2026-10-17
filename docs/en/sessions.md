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
| GET | `/api/sessions/{sid}/bookmarks` | List locally saved frame bookmarks and notes |
| GET | `/api/sessions/{sid}/bookmarks/export` | Download saved bookmarks as a local JSON backup |
| POST | `/api/sessions/{sid}/bookmarks/import?conflict=keep&dry_run=true` | Validate/preview a JSON backup; `dry_run=false` applies with `If-Match` revision |
| PUT | `/api/sessions/{sid}/frames/{index}/bookmark` | Save/update one bookmark: `{ "snapshot_sha256": "…", "tags": [], "note": "" }` |
| DELETE | `/api/sessions/{sid}/frames/{index}/bookmark` | Remove one bookmark: `{ "snapshot_sha256": "…" }` |
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

Playback pauses when you seek, step, change Sessions, refresh, capture, create a Session, rerun tracking, hide the tab or leave the page. With A/B looping off, it stops at the last saved frame; pressing Play there starts again at the first saved frame. Playback follows the saved-frame list, including frames outside the latest tracking report: those frames show the existing unanalysed/missing-result message, never another frame's IDs. Replay does not record a camera, run a model or upload data.

## Drag the replay progress bar

The **Playback progress** slider shows the displayed saved-frame position and total count, and follows Play/Pause, Previous/Next and the saved-frame selector. Dragging pauses playback and previews the target alongside the still-displayed position. Release to load that frame; its RGB/depth, exact matching boxes/IDs and point cloud appear together once decoded. Loading or failed seeks do not relabel the old image as the target frame.

The bar uses saved-frame order, not elapsed video time or the source `frame_id`. It covers the entire Session, including frames outside the tracking report; the usual unanalysed/missing-result message applies there. Use native keyboard arrows and Home/End for precise movement. The bar is disabled for zero/one saved frame. Dragging back to the displayed frame requires no new request.

Drag movement itself sends no replay requests. New release requests invalidate older pending results; Session changes and page hiding cancel pending previews. A failed jump leaves the last displayed frame, IDs and committed progress intact and reports an error. The progress readout and accessible slider text are available in English and Traditional Chinese; no replay data is uploaded or added to the public source archive.

## Loop an A/B interval

Set **A (start)** and **B (end)** as saved-frame positions, or use each endpoint's button to copy the currently displayed frame. The default range is the first through last saved frame; enable **A/B loop** to repeat it at the selected playback speed. Both endpoints are included: after B is fully displayed, playback loads A again. The range requires at least two frames: **1 ≤ A < B ≤ total saved frames**. An invalid range disables Play while looping is enabled.

Changing an endpoint or toggling the loop pauses playback and cancels pending presentation. Press Play to resume inside the interval, or start at A if the displayed frame is outside it. The progress bar, saved-frame selector and Previous/Next still cover the whole Session; using them pauses playback and preserves the interval. Changing Sessions or refreshing resets A/B to the full saved range and turns looping off.

A/B uses saved-frame order, not source frame IDs or physical elapsed time. Each loop transition retains the exact-frame checks and presents decoded RGB/depth, matching boxes/IDs and point cloud together. A failed read or decode stops at the last complete frame with an error. Looping only reads the local archive; it does not run inference, change tracking results or upload data.

## Frame bookmarks and notes

Use **Mark shown frame** to pause playback and mark the last fully displayed frame; any pending replay is cancelled first. Select any combination of **Suspected ID switch**, **Occlusion** and **Crossing**, or leave the tags empty for a general bookmark. Add a plain-text note of up to **1000 Unicode characters**, then explicitly **Save/update**. Each saved frame has at most one bookmark. Remove the displayed frame's saved bookmark with **Remove bookmark**.

Choose a bookmark in the list to jump back to its exact saved frame. This pauses playback and retains the A/B interval; RGB/depth, tracking boxes/IDs and progress commit together through the usual replay checks. A bookmark anchors the Session ID, saved frame index and snapshot SHA-256, rather than the source `frame_id`. Tags flag observations for review; they do not establish that an ID switch occurred.

Unsent edits are kept in page memory per exact frame while navigating. Only **Save/update** writes them to disk; reloading the browser retains saved notes and discards unsaved drafts. Saved records live in **`outputs/sessions/<UUID4>/bookmarks.json`**, separate from `session.json`, original frame ZIPs and `tracking.json`. They remain local, are excluded from the public source archive, and are not added to downloaded original bundles or tracking reports. Bookmarking does not capture frames, run analysis/inference or upload anything.

The bookmark API uses the same storage opt-in and loopback restrictions as replay. GET and both mutations return the full `depthport.session-bookmarks.v1` document, containing `session_id` and a `bookmarks` list. PUT accepts unique tags from `id-switch`, `occlusion` and `crossing`; an empty list is allowed. PUT and DELETE require the exact frame's `snapshot_sha256`. Invalid or mismatched snapshots are rejected without changing saved records.

### Back up and restore bookmark JSON

Use **Export JSON** to download saved bookmarks to this machine. Save any edited notes first: unsaved drafts are excluded. The UTF-8 JSON contains the format version, Session UUID, saved-frame indices, snapshot SHA-256 digests, tags, notes and `updated_at` values. It contains no images, frame bundles or tracking results. Keep the backup locally; the app does not send it to cloud storage or GitHub.

To restore, select the **same original Session** with its exact saved frames still available, choose a local JSON file of at most **1 MiB**, then **Preview import**. Review the counts before **Apply import**. The default conflict policy keeps local notes; choose overwrite to replace differing notes/tags for incoming frames. Both policies retain existing bookmarks absent from the backup, and identical notes/tags require no change. This backs up notes only: it cannot recreate a Session or missing media.

The entire file is checked before any write, including format, Session, snapshot hashes, unique frame indices, tags, note limits and valid UTF-8/JSON. An invalid entry rejects the whole import. If saved notes change after preview, preview again before applying. Unsaved editor drafts remain separate; switching Sessions or refreshing clears the chosen file and preview. Applying writes the merged bookmarks atomically to the local private bookmark file.

For API clients, POST the raw `depthport.session-bookmarks.v1` document with `conflict=keep|overwrite`. `dry_run=true` returns a revision, merge counts and the merged document without writing; `dry_run=false` requires that revision in `If-Match`. Export and import use the existing storage opt-in, loopback and cross-origin protections. Actual backups, notes and media remain outside the public source archive.
