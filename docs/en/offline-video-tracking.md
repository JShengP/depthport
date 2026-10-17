# Offline Video Tracking Benchmark (experimental)

[繁體中文](../zh-TW/offline-video-tracking.md) · [Home](../../README.md)

This **optional, offline** benchmark compares DepthPort's existing 2D IoU/centroid heuristic against [Roboflow Trackers](https://github.com/roboflow/trackers) **ByteTrack** and **BoT-SORT** with the **same immutable YOLO detections** on every decoded video frame. No production tracker is installed in DepthPort's inference worker; it does not record cameras, perform monocular depth inference, recover 3D motion, or alter the existing UI/session API.

## Important isolated environments

Roboflow `trackers==2.6.1` is **Apache-2.0** (upstream) and expects NumPy >=2, whereas this DepthPort depth/DA3 recipe pins NumPy 1.26.4. Do **not** install this requirement in `.venv-depthport`. Use **two isolated environments** and exchange only the JSON detection cache. Check upstream terms and third-party detector/weight licensing separately.

```bash
# Existing DepthPort environment with working Ultralytics (create separately per installation guide)
.venv-depthport/bin/python tools/cache_video_detections.py \
  --video samples/clip.mp4 --model yolo26n.pt --confidence 0.10 \
  --output outputs/benchmark/detections.json

# Separate benchmark environment: Python 3.11 or 3.12
python3.11 -m venv .venv-trackers
.venv-trackers/bin/python -m pip install -r requirements-tracking-benchmark.txt
.venv-trackers/bin/python tools/benchmark_video_tracking.py \
  --video samples/clip.mp4 --detections outputs/benchmark/detections.json \
  --output outputs/benchmark/comparison.json
```

For Windows, use the analogous `.venv-depthport\\Scripts\\python.exe` and `.venv-trackers\\Scripts\\python.exe` commands. Use a short **continuous, locally authorized** clip. Maximum: 1,800 frames, 64 detections/frame, <= 8192-pixel dimensions. The cache covers *all* frames; truncated or modified video is rejected via SHA-256. Preserve low-confidence detections (0.10 suggested) for ByteTrack's second association stage rather than discarding them before caching. Never check in video, weights, GT or result files.

Optional independent human ground truth (`depthport.tracking-ground-truth.v1`) enables Precision/Recall, ID Switch, Fragmentation, and scenario breakdown:

```bash
.venv-trackers/bin/python tools/benchmark_video_tracking.py \
  --video samples/clip.mp4 --detections outputs/benchmark/detections.json \
  --gt samples/clip.gt.json --output outputs/benchmark/scored.json
```

Set GT `session_id` to `video-` plus the **first 24 hex characters** of `video_sha256` from `detections.json`, set `sampling` to `dense_video`, and annotate frame indices starting at **1**. Use `tags` including `crossing`, `occlusion`, `fast_motion` and `camera_motion` to inspect scenario-specific errors; `evaluated=false` excludes uncertain frames. Incomplete or sparse GT cannot justify full-video scores. The optional score is a **DepthPort custom class-aware IoU diagnostic**, not official HOTA/IDF1/MOTA. Trackers' upstream evaluation CLI can be evaluated separately on standard MOT datasets where appropriate.

### Fairness and limits

- **Hold fixed:** video SHA-256, resolution, frame rate, detector weights/checkpoint hash and confidence threshold, detections JSON, ground truth and evaluation threshold.
- **Measure separately:** detector inference + decoding (cache generation), tracker-only p50/p95/total `update` milliseconds, and video decoding per backend. CMC in BoT-SORT receives full BGR frames; its additional cost **is part of** the tracker time. ByteTrack deliberately receives no frame.
- **Handle unconfirmed tracks:** Roboflow returns `tracker_id=-1` for unconfirmed boxes; report their number and do not fabricate an object ID. This may reduce recall versus a baseline that labels every valid detection.
- **Do not claim:** ReID (BoT-SORT upstream implementation does not include the optional appearance branch), camera/world-aligned trajectories, physical 3D speed, or measured real-video accuracy without GT.
- **Reproduce:** keep separate versions of OpenCV, NumPy, PyTorch, Ultralytics, `trackers`, `supervision`, OS and CPU/GPU. Results depend on scene, confidence and tracker hyperparameters; choose after measurement, not on a claimed universal winner.

**CI tests use synthetic video and an explicit fake Roboflow API adapter. No real Roboflow package, YOLO weight, camera or tracking accuracy is demonstrated by CI.**

For the integrated isolated process, see [BoT-SORT worker setup](tracking-worker.md). Run the benchmark in the existing NumPy 1 application environment with `--methods baseline botsort-worker` and `TRACKING_WORKER_PYTHON` set. The worker supports up to 4096-pixel sides / 4 Mi pixels; it receives the cache FPS (Session analysis uses a fixed 30). Worker step latency includes PNG encoding, IPC, decoding and association; startup and detector inference are excluded. Direct `botsort` remains a separate-environment reference.
