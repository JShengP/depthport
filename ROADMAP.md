# Roadmap / 路線圖

Updated / 更新：2026-10-19 · [v0.3 Alpha notes / 版本說明](docs/releases/0.3.0-alpha.1.md) · [Changelog / 歷程](CHANGELOG.md)

Priorities are acceptance gates, not promised deadlines. v0.3 Alpha remains an **experimental development preview**; publishing source is not product or hardware acceptance.
以下為驗收優先順序，不承諾期限。v0.3 Alpha 維持**實驗性開發預覽**，發布程式不等於產品或實機驗收。

## Available in main / 已整合到 main

- **v0.2 Spatial Analysis:** four-engine comparison, same-frame inspection, optional semantic fusion and calibration/error tools. Real single-image CUDA execution was recorded on one Ubuntu GPU host; measured-distance acceptance remains open.
- **v0.3 Sessions and review:** opt-in manual local snapshots, SHA-256 replay, offline Object IDs, isolated BoT-SORT worker, playback/overlays/A-B loops and local bookmark notes/search/JSON backup. Simple association stays default; Session storage stays off by default.
- **Reproducible tracking research:** public-sequence Baseline/ByteTrack/BoT-SORT comparisons, parameter profiles and activation-error diagnosis; aggregate evidence only. Lower IDSW can trade off Recall, and long-occlusion recovery is not accepted.
- **Dependency checks:** Ubuntu/Windows × Python 3.11/3.12 application contracts and actual four-model API installation/import CI without weights. This does not validate pretrained Windows inference or hardware operation.
- **已完成：** v0.2 空間分析、v0.3 手動本機 Session／回放與書籤檢查、選配獨立 BoT-SORT worker、公開序列彙總研究及跨平台依賴／API CI。原預設不變，長遮擋與實機驗收仍未完成。

## Next acceptance gates / 下一階段驗收

### P0 — Tracking reliability / 追蹤可靠性

1. Test stricter new-track confirmation/competition while retaining weak-box continuation. Pair added/removed ID switches and FP/FN at immutable detection locations; do not promote a profile solely for Recall gains.
2. Isolate detector localisation/resolution controls from association recovery. Instrument ambiguous costs and visibility loss before gate changes or ReID.
3. Use an independent licensed continuous-sequence group with long occlusion, crossing and camera motion. Fix detector/versions/sampling, repeat runs and report IDF1/HOTA/CLEAR, event recovery and failures separately. Include worker IPC in end-to-end latency; do not mix it with direct-library timing.
4. Revalidate the current dependency profile before transferring historical fixed-cache metrics to it. Prior caches used Ultralytics 8.4.115; synchronized application requirements use 8.4.176.

先分開測新 ID 確認／競爭、偵測框品質與遮擋恢復，再用獨立且授權明確的連續序列重驗。需同時呈現換 ID、FP／FN、事件恢復及包含 worker IPC 的耗時；不可只看 Recall 或把舊快取結果當新版驗收。

[Diagnosis / 錯誤診斷](docs/en/tracking-error-diagnosis.md) · [繁體中文](docs/zh-TW/tracking-error-diagnosis.md) · [Parameter study / 參數研究](docs/en/tracking-parameter-acceptance.md)

### P0 — Physical camera and installation / 實體相機與安裝

- Fresh Windows pretrained inference and real isolated-worker Session integration; record exact dependency/device versions and actual results per engine.
- Physical RTSP authentication, H.264/H.265, reconnect, camera-to-browser latency, long-run stability and sustained memory use.
- NVIDIA hardware WebGL rendering; previous browser validation used SwiftShader.
- Windows 真權重推論與真 worker 整合、實體 RTSP／重連／延遲、長時穩定性與 NVIDIA WebGL，均需實測記錄，不能以 CI 替代。

[Hardware acceptance issue #6](https://github.com/JShengP/depthport/issues/6) · [Validation / 驗證紀錄](docs/en/validation.md)

### P1 — Geometry and temporal evidence / 幾何與時間證據

- Measured intrinsics, independent ground-truth distances and near/medium/far errors before metric-accuracy claims.
- Movement-controlled same-grid depth stability and camera-motion effects; camera-space XYZ histories do not establish world trajectories, SLAM or 3D identity tracking.
- 實測內參、獨立真值與近中遠距誤差，以及受控運動下的深度穩定性；相機座標歷史不是世界軌跡或 SLAM。

### P2 — Performance and deployment / 效能與部署

- Reproducible end-to-end latency, throughput, VRAM and multi-client load measurements.
- Authentication, egress controls and source/model/session isolation before multi-user exposure. The local backend is not a public unauthenticated service.
- 可重現延遲／吞吐量／VRAM／負載；多人部署前先補認證、連線控管與來源／模型／Session 隔離。

## Repository maintenance / Repo 維護

main is the integration branch; version tags preserve release snapshots. Remove only fully merged, unprotected branches with no open PR. Keep unmerged dependency proposals separate until their own compatibility/deployment checks pass; do not bundle them into an Alpha release for tidiness.
main 用於整合，Tag 保存發行快照。只清理完整合併、無開啟 PR 且未受保護的分支；未合併依賴更新保留獨立驗證，不為整理而直接併入 Release。

No roadmap item implies hidden-surface recovery, physical safety certification or a new depth model.
上述方向不代表遮擋區域還原、安全認證或新深度模型。
