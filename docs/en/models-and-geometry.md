# Model contracts and geometry
[繁體中文](../zh-TW/models-and-geometry.md) · [Home](../../README.md)

## Contract

Adapters return aligned BGR, `depth: float32[H,W]`, `raw_depth`, unit kind, intrinsics, metadata and optional confidence/sky. They do not fabricate missing outputs. Invalid model types or shapes fail. Source and model generation IDs prevent a result from a previous request being published after a switch.

| Preset | Output used for projection | Important boundary |
|---|---|---|
| YOLO26 | `result.depth.data` | Retain published API scale; do not invert, exponentiate again or normalize to 1–5 |
| V2 Small | `1 + (1-clip((raw-p5)/(p95-p5),0,1))*4` | Larger raw means nearer; **display mapping only**, not metric or physical inversion |
| DA3-Small | positive raw relative depth | No geometry normalization; per-frame percentiles apply to colors only |
| DA3Metric | `raw * ((fx_processed+fy_processed)/2) / 300` | Use focal length in the processed image grid; reject already-metric outputs to avoid double conversion |

Near-constant V2 output becomes a virtual Z=3 plane, not an invented scene. NaN/Inf remain invalid. The current V2 p5/p95 saturation and per-frame changes can distort geometry and should not be used for cross-frame fusion or numerical metric comparisons. Raw aligned scores are preserved in the ZIP.

## Intrinsics and alignment

A provided pinhole/Brown-Conrady calibration JSON or an explicitly assumed HFOV defines camera rays. Intrinsics must match the same lens, zoom, view and stream mode. Scaling updates fx/fy/cx/cy. DA3 pre-resizes the full view to multiples of 14 and validates the returned dimensions; it does not silently accept an unexpected crop. Predicted DA3 intrinsics, when returned, are stored as unused metadata rather than replacing the common camera model.

V2 uses the DPT processor and aligns depth back to the input grid. `DA2_INPUT_SIZE=518` is a processor reference size, not a promise of a 518×518 tensor. Record `network_input_hw`. YOLO, V2 and DA3 default image sizes and precision differ; displayed wall times are not automatically a fair benchmark.

Projection into viewer camera coordinates:

```text
X = (u - cx) * Z / fx
Y = -(v - cy) * Z / fy
Z_view = -Z
```

This is not world coordinates or ray-range. Calibration changes ray geometry; depth-scale calibration changes another part of the problem. Neither is a distance-accuracy guarantee. Fisheye calibration, same-aspect crop detection and invalid-border masking after undistortion are not implemented.

## Filtering and display

Metric bounds apply only to estimated-meter outputs. Relative bounds are separate. Bounds remove points instead of clamping them onto a plane. Confidence-percentile filtering is not a confidence probability. Sky removal applies only if a real mask is available. These filters do not overwrite the model's raw depth array.

The viewer's scale/fit and optional depth stretch do not modify PLY/NPY. All outputs identify units; the same-frame bundle captures a single completed server frame. It may be newer than the frame currently drawn by the browser.

Primary references: [YOLO Depth](https://docs.ultralytics.com/tasks/depth/), [V2 checkpoint](https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf), [DA3 repository and metric scaling](https://github.com/ByteDance-Seed/Depth-Anything-3), [DA3-Small](https://huggingface.co/depth-anything/DA3-SMALL), [DA3Metric-Large](https://huggingface.co/depth-anything/DA3METRIC-LARGE).
