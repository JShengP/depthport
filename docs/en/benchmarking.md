# Recording evidence, not a leaderboard
[繁體中文](../zh-TW/benchmarking.md) · [Home](../../README.md)

Use one legally shareable image, identical source SHA-256 and the same calibrated/assumed camera definition. State different model resolutions and precision rather than pretending they are equal. Separate a cold load/download from warm inference. Record host CPU/GPU, VRAM, driver, OS, Python, package versions, model revision/hash, source resolution, actual network input size, sample count, warmup policy, p50/p95 wall times and peak allocated/reserved memory where measured.

The CSV in [benchmark template](../templates/benchmark.csv) is empty on purpose. Do not fill unknown measurements with zero. Mark model inference, synthetic fixtures, papers and hardware runs separately. RTSP model switching uses different timestamps and is not synchronized comparison.

Compare depth shape on permitted scenes: floor flatness, object edges, reflected/transparent surfaces, and temporal scale drift. Metric error needs measured ground truth and correctly matched geometry; relative outputs require an explicit alignment protocol and cannot be scored as raw meters. V2's current virtual geometry should not be used for absolute metric error.

A live performance report should separate capture/decode, frame age, model loading, model/API time, cloud packing, transfer and browser rendering. The app's host-decode-to-publish value does not measure sensor-to-display latency. Never derive end-to-end FPS from a vendor's isolated kernel timing.
