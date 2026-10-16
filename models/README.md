# Model storage
[繁體中文](README.zh-TW.md) · [Installation](../docs/en/installation.md)

No weights are included or meant to be committed. Configure trusted local paths in `.env` after installing the corresponding runtime. The download/serialization format and license belong to the upstream project.

| Preset | Environment variable | Local form |
|---|---|---|
| YOLO26 | `YOLO_MODEL` | Trusted depth `.pt`; not a detection model or `.yaml` |
| V2 Small | `DA2_SMALL_MODEL` | HF folder with config, processor config and safetensors |
| DA3-Small | `DA3_SMALL_MODEL` | Matching DA3 config and safetensors directory |
| DA3Metric | `DA3_METRIC_MODEL` | Matching standalone Metric config and safetensors directory |

Set `MODEL_OFFLINE=1` to request local-only model loading. Pin HF revisions when reproducibility is required, and record weight hashes. Never run untrusted pickle/checkpoint files. Do not replace a preset with a different model family merely because its file loads.
