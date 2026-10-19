# v0.3 optional Roboflow BoT-SORT worker

The separate direct-library [parameter sensitivity study](tracking-parameter-acceptance.md) leaves worker and application defaults unchanged; its timings exclude IPC.


**Expanded evidence, 2026-10-19:** [Three-scene MOT17 comparison](tracking-expanded-acceptance.md) evaluates direct Baseline/ByteTrack/BoT-SORT calls separately from this worker pilot. It does not certify extended worker/RTSP or long-occlusion recovery.
[繁體中文](../zh-TW/tracking-worker.md) · [Sessions](sessions.md) · [Offline benchmark](offline-video-tracking.md)

Available in the v0.3 Alpha experimental development preview; broader acceptance remains pending. Sessions keep **Simple association** as the default. Choose **Roboflow BoT-SORT** to associate real YOLO Detect/Segment observations in an explicitly requested offline analysis. Neither backend adds automatic camera recording.

## Install in a separate environment

Roboflow Trackers 2.6.1 needs NumPy >=2.0.2; the current DA3 environment needs NumPy <2. Keep the depth-model environment unchanged. With Python 3.11 or 3.12:

```bash
python3 -m venv .venv-tracking
.venv-tracking/bin/python -m pip install -r requirements-tracking-worker.txt
.venv-tracking/bin/python -m pip check
# Set the absolute executable path locally, then start the usual application.
export TRACKING_WORKER_PYTHON="$PWD/.venv-tracking/bin/python"
export ENABLE_SESSION_STORAGE=1
bash RUN_UBUNTU.sh
```

Windows PowerShell:

```powershell
py -3.12 -m venv .venv-tracking
.\.venv-tracking\Scripts\python.exe -m pip install -r requirements-tracking-worker.txt
.\.venv-tracking\Scripts\python.exe -m pip check
$env:TRACKING_WORKER_PYTHON = (Resolve-Path .\.venv-tracking\Scripts\python.exe).Path
$env:ENABLE_SESSION_STORAGE = '1'
.\RUN_WINDOWS.bat
```

Alternatively set `TRACKING_WORKER_PYTHON` in the ignored local `.env`, then restart. The worker checks exact versions: trackers 2.6.1, supervision 0.27.0, NumPy 2.2.6 and opencv-python 4.11.0.86. The base installation and base CI do not install these optional dependencies. Trackers and Supervision retain their upstream Apache-2.0 notices; detector/weight terms still apply.

Open `/sessions`, save at least two completed frames, select Detect or Segment, select BoT-SORT, and run analysis. An unavailable worker disables the option. A configured but invalid environment produces an explicit job error; there is no silent fallback. API clients send `{"mode":"segment","backend":"roboflow-botsort","max_frames":12}` to the existing tracking endpoint. Executable paths are administrator environment settings and cannot be supplied in request JSON.

## Association and geometry contract

- Main process: genuine CPU YOLO inference, original bounding boxes/masks, aligned saved native-depth data and camera-space XYZ. Worker: CPU BoT-SORT with full BGR frames for CMC, no ReID, no depth-model imports.
- One disposable stdio subprocess per job, launched without a shell using isolated Python (`-I`). Only a small OS environment allowlist is inherited. Images are PNG/base64 in bounded JSONL messages; detections carry only class, score and box. The subprocess has no upload or listening endpoint and does not save frame files.
- Replies contain **original detection indices and IDs only**. The parent selects the original observation; it never substitutes Kalman-predicted boxes or infers depth at a predicted location. No ID is fabricated for unconfirmed or discarded detections. Reports include input detection counts and the total `unassociated_detections` (including confidence filtering, not only `tracker_id=-1`).
- Each class has its own tracker. Absent classes still receive empty updates. Recorded source-kind, depth model, intrinsics, units or grid changes reset association; public IDs remain unique within that analysis. IDs are local to one analysis and do not identify people. Switching cameras with identical saved metadata cannot be detected; start a separate Session.
- Sessions advance **one fixed 1/30-second tracker step per saved frame**. Actual elapsed gaps between manual snapshots are not modelled. CMC does not make sparse snapshots continuous video or camera/world-coordinate trajectories. Use a dense sequence to assess tracking; do not interpret IDs as speed or metric 3D accuracy.
- Limits: Session analysis 2–24 saved frames, at most 20 detections/frame; worker protocol at most 64 detections, 4096-pixel sides, 4 Mi pixels, 12 MiB PNG, 20 MiB request and 64 KiB reply. Each exchange times out after 30 seconds. Malformed replies, missing packages, dead/blocked workers fail the job with fixed messages; stderr is discarded to avoid returning private paths or frame details. Processes are terminated/reaped after jobs, errors, application shutdown and interpreter exit.

## Public-sequence validation — 2026-10-18

[Curated aggregate record](../validation/v0.3-botsort-worker.json) contains sources, hashes, runtime versions and results. The local non-commercial test used the official compressed **MOT15 train / TUD-Stadtmitte** MP4 and independent MOT15 ground truth under the [dataset's CC-BY-NC-SA-3.0 conditions](https://motchallenge.net/data/MOT15/). Media, annotations, per-frame observations, model weights and local logs are not distributed.

On all **179 frames at 25 fps**, the worker produced the same **982 observations** and a bijective ID mapping as direct Roboflow 2.6.1 using the same frozen real YOLO26n person detections and defaults. TrackEval: **7 ID switches, 81.57% recall, IDF1 81.01%, HOTA 58.11%**. This is one short compressed training clip, not the full original-image benchmark or a held-out accuracy result. Compared with the original simple association, fewer switches come with lower recall; these defaults are not a universal ranking.

The real 24-frame saved Session path also exercises both Detect and Segment against genuine previously saved CUDA DA V2 depth. Every retained observation must match the original detector's box, mask-derived depth and XYZ exactly. The report records separate Session diagnostics; those are not official TrackEval scores. Physical RTSP, long occlusion/crossing and camera-motion audits across scenes, Windows real-model/worker execution, endurance, calibrated metric 3D and real-time performance remain pending. CI exercises synthetic contracts and subprocess failures without pretrained weights; it is not a real-video accuracy benchmark.
