# Roadmap / 路線圖

Updated / 更新：2026-10-19 · [Project](README.md) · [繁體中文首頁](README.zh-TW.md) · [Alpha.2 notes / 發布說明](docs/releases/0.3.0-alpha.2.md) · [Changelog / 歷程](CHANGELOG.md)

[Status / 狀態判讀](#status--狀態判讀) · [v0.1](#v01--viewer-foundation--檢視器基礎) · [v0.2](#v02--spatial-analysis--空間分析) · [v0.3](#v03--sessions-and-tracking--回放與追蹤) · [Next gates / 下一步驗收](#next-acceptance-gates--下一步驗收) · [Maintenance / 維護](#repository-maintenance--repo-維護)

> [!IMPORTANT]
> v0.3 Alpha remains an **experimental development preview**. Implemented features, examples, CI and published source are not product or hardware acceptance. Priorities below are acceptance gates, not promised deadlines.
> v0.3 Alpha 維持**實驗性開發預覽**。功能完成、範例、CI 與發布程式不等於產品或實機驗收；以下為驗收優先順序，不承諾期限。

## Status / 狀態判讀

- **Implemented & recorded / 已完成與已記錄：** distinguish available code from the evidence actually collected. CI contracts, synthetic UI, real model execution and tracking benchmarks establish different things. 功能與證據分開說明，不把合成畫面、真模型執行或 benchmark 混為同一種驗收。
- **Unverified / 未驗證：** a missing acceptance result stays open even when the corresponding tool exists. 工具存在不表示精度、可靠性或實機項目已通過。
- **Next / 下一步：** future work targets current `main`, recording versions, conditions, results and failures separately. It does not retroactively validate historical tags. 後續以目前 `main` 為對象，另記版本、條件、結果與失敗，不回填成舊 Tag 的驗收。

Version READMEs describe each generation's differences, architecture, examples and limits. `main` retains the v0.1 viewer and v0.2 analysis alongside v0.3; release tags/downloads preserve their original snapshots.
各版 README 說明差異、架構、範例與限制；目前 `main` 延續前版功能，Tag／下載包維持原快照。

## v0.1 — Viewer foundation / 檢視器基礎

[Version README / 分版說明](docs/versions/v0.1/README.md) · [v0.1.0-alpha.1](https://github.com/JShengP/depthport/releases/tag/v0.1.0-alpha.1) · Historical Alpha / 歷史 Alpha

### Implemented & recorded / 已完成與已記錄

- **Implemented / 功能：** image/RTSP latest-frame input, four switchable depth presets, bilingual XYZRGB viewer and same-frame PLY/NPY/ZIP with raw depth/unit metadata. One shared source/model worker; no per-user model isolation. 圖片／RTSP 最新影格、四模型、雙語點雲及同影格匯出，採共用來源／模型 worker。
- **Recorded / 證據：** application contracts and actual viewer checks with explicitly synthetic data; the example is not pretrained inference. 應用契約與真介面合成資料檢查，不是真權重推論。

[Tagged validation](https://github.com/JShengP/depthport/blob/v0.1.0-alpha.1/docs/en/validation.md) · [本版繁中紀錄](https://github.com/JShengP/depthport/blob/v0.1.0-alpha.1/docs/zh-TW/validation.md)

### Unverified / 未驗證

Pretrained inference, fresh target/Windows installation and GPU execution were unverified in this snapshot, as were physical RTSP/codecs/reconnect, endurance/VRAM and calibrated metric accuracy. Later CUDA/replay results do not validate the v0.1 tag.
本版當時未完成真權重、全新目標／Windows 環境、GPU、實體串流／重連／編碼、長時穩定性與標定測距；不借用後版成果宣稱 v0.1 通過。

### Next / 下一步

Validate the retained viewer on current `main` through [P0 installation/camera gates](#p0--physical-camera-and-installation--實體相機與安裝) and [P1 geometry gates](#p1--geometry-and-temporal-evidence--幾何與時間證據). Spatial Analysis belongs to v0.2; Sessions and cross-frame Object IDs belong to v0.3.
以目前 `main` 補驗延續的檢視器能力，另記安裝／相機與幾何證據；空間分析及 Session／跨影格 ID 分別屬於後版新增功能。

## v0.2 — Spatial Analysis / 空間分析

[Version README / 分版說明](docs/versions/v0.2/README.md) · [v0.2.0-alpha.1](https://github.com/JShengP/depthport/releases/tag/v0.2.0-alpha.1) · Historical Alpha / 歷史 Alpha

### Implemented & recorded / 已完成與已記錄

- **Implemented / 功能：** retains v0.1; adds `/spatial` pixel raw-depth/camera-space XYZ inspection, sequential same-image four-engine comparison, optional YOLO Detect/Segment instance-to-point fusion, checkerboard calibration, candidate planes and independent metric-error tools. 延續檢視器，新增像素深度／XYZ、同圖比較、選配語意融合、標定／平面／誤差工具；尚無 Session 或連續追蹤。
- **Recorded / 證據：** four genuine CUDA depth calls and YOLO Detect/Segment on one public Ultralytics bus image in one fresh Ubuntu GPU environment on **2026-10-17**. Actual HTTP/browser checks used **SwiftShader software WebGL**, not NVIDIA display rendering. 單台全新 Ubuntu GPU 環境的一張公開圖真推論；瀏覽器繪圖是軟體 WebGL。

[Tagged validation](https://github.com/JShengP/depthport/blob/v0.2.0-alpha.1/docs/en/validation.md) · [本版繁中紀錄](https://github.com/JShengP/depthport/blob/v0.2.0-alpha.1/docs/zh-TW/validation.md) · [Example & provenance / 範例與來源](docs/versions/v0.2/README.md#examples--範例)

### Unverified / 未驗證

Physical RTSP/codecs/reconnect, fresh Windows pretrained inference, endurance/VRAM, NVIDIA hardware WebGL and independently calibrated distance accuracy remain open. A single-image execution result or calibration tool is not an accuracy/throughput benchmark.
實體串流、Windows 真權重、長時穩定性、硬體繪圖及獨立標定距離精度仍待驗證；單圖執行與工具存在不代表精度或吞吐量通過。

### Next / 下一步

Close the shared [P0 hardware/installation gates](#p0--physical-camera-and-installation--實體相機與安裝), then document measured intrinsics, independent distance truth and near/medium/far errors under [P1](#p1--geometry-and-temporal-evidence--幾何與時間證據). Keep native model units explicit.
補齊共用實機驗收及實測內參／獨立真值／近中遠距誤差；保留各模型原生單位，不能把相對或虛擬深度當公尺。

## v0.3 — Sessions and tracking / 回放與追蹤

[Version README / 分版說明](docs/versions/v0.3/README.md) · [v0.3.0-alpha.2](https://github.com/JShengP/depthport/releases/tag/v0.3.0-alpha.2) · Experimental Alpha / 實驗性 Alpha

### Implemented & recorded / 已完成與已記錄

- **Implemented / 功能：** retains v0.1/v0.2; adds opt-in manual same-frame local Sessions, SHA-256 replay, explicit offline YOLO analysis, local Object IDs and camera-space depth/XYZ histories. NumPy 1 application and optional NumPy 2 BoT-SORT worker use bounded IPC. **Storage stays off by default; simple association stays default.** 選用本機快照／離線分析與獨立 worker；不自動錄影，回放不重新推論，原預設不變。
- **Review / 檢查：** boxes/IDs, playback/speed/timeline/A-B loops, bookmark notes/tags/search/JSON backup and keyboard/IME guards are implemented. **ByteTrack is an offline benchmark backend, not another Session UI selector.** 疊圖、回放及本機書籤檢查已實作；ByteTrack 僅屬研究後端。
- **Research / 研究：** Baseline/ByteTrack/BoT-SORT comparisons, parameter profiles and ID-switch/false-positive diagnosis are recorded. Lower activation can add coverage and ID switches/FP together; no candidate has been promoted to a new default. 公開序列比較、參數研究與錯誤診斷已記錄，不代表長遮擋驗收通過。
- **Admission ablation / 新 ID 控制：** [1,179 frames / 72 runs](docs/en/tracking-admission-acceptance.md) / [繁中](docs/zh-TW/tracking-admission-acceptance.md), using fresh 8.4.176 caches on previously studied 09/10 scenes. Longer confirmation reduces FP but increases FN and lowers combined IDF1/HOTA; the birth-only IoU .5 veto never triggers. No candidate passes the frozen research screen. 本輪控制實驗已完成，沒有候選達標，不是獨立序列或可靠性驗收通過。
- **Association telemetry / 關聯診斷：** [16 observed reruns](docs/en/tracking-association-diagnosis.md) / [繁中](docs/zh-TW/tracking-association-diagnosis.md) reproduce exact predictions/official scores with repeated full-trace hashes. Promotion costs overlap; ByteTrack weak-stage missed-hypothesis recovery with an active competitor motivated the following control experiment. The flagged cohort includes 24 FP, 5 different-prior-GT TP and 5 same-GT TP, so it is not an accepted veto. 已完成成本／競爭記錄，不代表修復；原矩陣／ID／案例留本機。
- **Recovery deferral / 延後接回：** [Frozen two-arm MOT20-01 study](docs/en/tracking-recovery-acceptance.md) / [繁中](docs/zh-TW/tracking-recovery-acceptance.md), 429 new continuous frames / six repeat runs. Four deferrals pass the research screen: FP 55→52, FN 17,194→17,092, IDSW 21→13; IDF1/HOTA improve, but fragmentation 46→48, 22 added FN/one added IDSW, recall only 13.98% and 0/9 long-event complete endpoint pairs. 單場景研究達標，未完成可靠性驗收，原始診斷留本機、預設不變。
- **Moving-camera replication / 移動相機重驗：** [Unchanged-policy MOT17-11/13 study](docs/en/tracking-recovery-moving.md) / [繁中](docs/zh-TW/tracking-recovery-moving.md), 1,650 frames / 12 runs. FP −8, no added/removed FN or IDSW, but scene-13 HOTA 24.9588→24.9473% fails the per-scene screen; no long-event recovery gain. Prior static added misses split into two direct deferrals, 12 unmatched weak detections and eight retained detections losing the GT match. 重驗與失敗補析已完成，整組未達標、不調參或升預設；病例留本機。
- **History diagnosis / 歷史診斷：** [Frozen-output state/assignment analysis](docs/en/tracking-recovery-history.md) / [繁中](docs/zh-TW/tracking-recovery-history.md) reproduces original scores without tracking or retuning. Twelve added misses have retained but below-gate hypotheses; eight retained observations move to another CLEAR owner; the added switch shifts a prefix-equivalent transition by one frame. Bus HOTA loses five low-localisation GT-frame observations at .05–.35. All ten competitors were already assigned elsewhere; force-assignment costs overlap across TP/FP. 歷史／指標機制已釐清，下一點為競爭證據的實際排他性，不直接挑新門檻；原診斷留本機。
- **Exclusive competition / 排他競爭控制：** [Frozen new MOT17-04 comparison](docs/en/tracking-exclusive-competition.md) / [繁中](docs/zh-TW/tracking-exclusive-competition.md), 1,050 frames / 12 runs. Availability-only and equivalent-one-to-one controls are separate; both have zero vetoes and exactly match reference. Legacy triggers once: FN +6, IDSW −1, FP unchanged, HOTA +.6147 pp. No treatment passes; new controls lack effective exposure. 完成新固定相機序列控制比較，未調參、保留弱偵測；零觸發不代表修復，原始診斷留本機。
- **Real example / 真實範例：** 24 consecutive public Pexels frames exercise genuine depth, YOLO26n CPU detection, the isolated worker and browser replay. It has no identity ground truth and spans only **0.959 s** from first to last frame. The reused CUDA environment is not a fresh installation of the complete Alpha.2 recipe; screenshots/docs were added after its frozen release. 真實短片回放，不是長遮擋、精度或完整配方新安裝驗收；後補文件不改 Tag／下載包。
- **Current CI / 目前檢查：** Ubuntu/Windows × Python 3.11/3.12 application contracts and model API installation/import checks; no pretrained weights or inference in CI. 跨平台契約與實際 API 匯入，不等於 Windows 真推論或實機通過。

[Validation history / 驗證紀錄](docs/en/validation.md) · [繁中紀錄](docs/zh-TW/validation.md) · [Tracking studies / 研究入口](docs/versions/v0.3/README.md#validation--驗證紀錄) · [Real replay & terms / 真回放與條款](docs/zh-TW/tracking-replay-example.md)

### Unverified / 未驗證

- **Reliability / 可靠性：** generalised long-occlusion recovery and crossing/moving-camera ID stability; independent confirmation/competition, localisation and recovery experiments. Missing/new IDs in the short example are not verified ID switches. 長遮擋、交會及移動相機的泛化表現仍待驗證，不能僅憑短片的缺框／新 ID 認定換 ID。
- **Timing / 時間：** Session worker steps remain fixed at 30 Hz per saved frame; replay 1× targets 5 saved frames/s, while the example source is 23.976 fps. Snapshot gaps are not modelled; no real-time or object-speed claim. 固定步長與回放速度不代表來源影片時間，不能據此推算速度。
- **Hardware & geometry / 實機與幾何：** physical RTSP, fresh Windows pretrained depth/semantic inference and real worker integration, endurance/VRAM, NVIDIA hardware WebGL and independently calibrated distance accuracy remain open. Camera-space IDs/XYZ are local associations, not person identities or motion-compensated world trajectories. 實機與精度仍未通過；相機座標 ID／XYZ 不是身分辨識或世界軌跡。

### Next / 下一步

The [exclusive-competition experiment](docs/en/tracking-exclusive-competition.md) is recorded on a new static scene. Both new controls have zero effective exposure and equal reference; legacy adds misses despite identity-score gains. Next freeze GT-free exposure-based cohort selection, disclose all scenes examined and separate discovery from independent confirmation. No post-result relaxation, favourable-scene selection, default promotion or resolution of the prior bus failure. Keep weak continuation; detector localisation/resolution is a separate control.
[排他競爭比較](docs/zh-TW/tracking-exclusive-competition.md)已完成，兩個新控制零觸發、等同原對照，舊控制有漏追／身分分數取捨。下一步先凍結不靠 GT 分數的曝光選取規則，完整揭露檢查場景，分開發現與獨立確認；不因結果放寬條件或挑有利片段。弱偵測保留，定位／解析度另測，前輪公車失敗仍未解決。

## Next acceptance gates / 下一步驗收

These gates apply to current `main`; the version sections above identify which retained or new capabilities they cover. Define acceptance criteria before running; record exact commits, dependencies/devices, inputs/terms, commands, results and failures. A gate stays open until those criteria are met and supporting evidence is recorded.
以下以目前 `main` 驗收，對應上方各版功能。執行前先訂通過標準，記錄確切 commit、套件／裝置、輸入／條款、指令、結果與失敗；達標且附上證據後才標為完成。

### P0 — Tracking reliability / 追蹤可靠性

1. **Confirmation & competition / 確認與競爭：** [History diagnosis](docs/en/tracking-recovery-history.md) led to [separate frozen occupancy/equivalent-assignment controls](docs/en/tracking-exclusive-competition.md) / [繁中](docs/zh-TW/tracking-exclusive-competition.md). New MOT17-04 / 1,050 frames / 12 runs: both new arms equal reference with zero vetoes; legacy adds six FN, removes one IDSW and leaves FP unchanged. **Implementation/comparison complete; effectiveness lacks exposure. Next freeze GT-free exposure selection and separate discovery/confirmation.** Do not loosen equivalence or choose scenes on favourable scores. Preserve weak inputs/defaults, original raw diagnoses local; reliability remains unaccepted.
2. **Localisation & recovery / 框品質與恢復：** isolate detector localisation/resolution from association recovery and hypothesis expiry. Observed geometric support can be absent, below the state/gate or assigned elsewhere; it is not proof a detector/gate fix is available. MOT20-01 recall remains 13.98% with zero complete long-event endpoint pairs; next freeze a detector-localisation/resolution comparison separately from deferral, confirmation or buffer changes. Full contexts stay local; geometric support is not a causal diagnosis. 已記錄成本／競爭，下一步分開測框品質／解析度、到期與恢復，不直接歸因或盲目加 ReID／buffer。
3. **Independent sequence group / 獨立序列組：** MOT20-01 is one new static scene; unchanged 11/13 moving-camera replication is recorded, but those scenes appeared in earlier benchmarks and provide no long-event recovery gain. New static MOT17-04 is recorded, but has no effective exposure for either new control. Further untouched licensed scenes with effective competition and broader evidence remain open. Fix detector/versions/sampling, repeat runs and report IDF1/HOTA/CLEAR, event recovery and failures separately. Include worker IPC in end-to-end latency; do not mix it with direct-library timing. 固定條件、重複執行，同報整體分數與事件失敗，端到端耗時包含 worker IPC。
4. **Current dependencies / 目前依賴：** admission/diagnosis use shared 8.4.176 CPU caches for 09/10; recovery deferral uses separate 8.4.176 caches on MOT20-01 and moving 11/13. Exclusive competition uses another fresh 8.4.176 cache on MOT17-04. Reused runtime is not a fresh complete Alpha.2 installation. Earlier studies keep 8.4.115 caches/scores; do not transfer or pool them. 本輪增加新場景限定證據，仍需更多獨立序列與完整配方驗收；歷史快取／分數保持分開。

[Diagnosis / 錯誤診斷](docs/en/tracking-error-diagnosis.md) · [繁中診斷](docs/zh-TW/tracking-error-diagnosis.md) · [Parameter study / 參數研究](docs/en/tracking-parameter-acceptance.md) · [Expanded comparison / 三場景比較](docs/en/tracking-expanded-acceptance.md)

### P0 — Physical camera and installation / 實體相機與安裝

- **Fresh installation / 全新安裝：** Windows pretrained depth/semantic inference and real isolated-worker Session integration; record exact dependency/device versions and actual results per engine. Windows 真權重與真 worker，逐模型記錄結果。
- **Physical RTSP / 實體串流：** authentication, H.264/H.265, reconnect, camera-to-browser latency, long-run stability and sustained memory/VRAM use. 實測認證、編碼、重連、相機到瀏覽器延遲與長時資源。
- **Rendering / 繪圖：** NVIDIA hardware WebGL, separately from CUDA inference; previous browser checks used SwiftShader. 硬體 WebGL 與 CUDA 推論分開驗收，不能以軟體繪圖或 CI 替代。

[Hardware acceptance issue #6](https://github.com/JShengP/depthport/issues/6) · [Validation / 驗證紀錄](docs/en/validation.md) · [繁中紀錄](docs/zh-TW/validation.md)

### P1 — Geometry and temporal evidence / 幾何與時間證據

- **Metric accuracy / 測距精度：** measured intrinsics, independent ground-truth distances and near/medium/far errors before metric-accuracy claims. 實測內參、獨立真值及近中遠距誤差。
- **Temporal stability / 時間穩定性：** movement-controlled same-grid depth stability and camera-motion effects; distinguish source timestamps, snapshot gaps, tracker steps and replay timing. 受控運動與同網格深度穩定性，分清來源時間、快照間隔、追蹤步長與回放時間。
- **Scope / 範圍：** visible-surface 2.5D only; relative/virtual depth is not metres. No hidden-surface reconstruction, world trajectories, SLAM, identity recognition or certified distance claim. 僅可見表面 2.5D，不宣稱遮擋還原、世界追蹤或認證測距。

### P2 — Performance and deployment / 效能與部署

- Reproducible end-to-end latency, throughput, VRAM and multi-client load measurements. 可重現端到端延遲／吞吐量／VRAM／多人負載。
- Authentication, egress controls and source/model/session isolation before multi-user exposure. The local backend is not a public unauthenticated service. 多人部署前先補認證、連線控管及來源／模型／Session 隔離。

## Repository maintenance / Repo 維護

- **Integration / 整合：** `main` is the integration branch; version tags preserve release snapshots. Remove only fully merged, unprotected branches with no open PR. Keep unmerged dependency proposals separate until compatibility/deployment checks pass. Do not bundle them into a release for tidiness. 只清理完整合併、無開啟 PR 且未受保護的分支；未合併依賴保持獨立驗證。
- **Documentation / 文件：** update each version README's validation/limits and this roadmap together when evidence changes. Link dated records; distinguish post-release examples from tagged assets. 證據有變時同步分版 README 與路線圖，保留日期／版本及後補範例的界線，不改寫舊發布包。
- **Public data / 公開資料：** publish reviewed aggregate records and explicitly attributed examples only. Private camera settings, credentials, snapshots, bookmark notes, JSON backups and raw diagnostic traces stay local. 新序列先確認條款；公開內容僅限檢查過的彙總與註明來源範例，私人設定／憑證／影像／備註／備份／原始診斷留在本機。

No roadmap item promises a new depth model or physical safety certification. 本路線圖不承諾新深度模型或實體安全認證。
