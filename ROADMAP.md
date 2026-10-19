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
- **Exclusive competition / 排他競爭控制：** [Frozen fresh-cache MOT17-04 comparison](docs/en/tracking-exclusive-competition.md) / [繁中](docs/zh-TW/tracking-exclusive-competition.md), 1,050 frames / 12 runs. Availability-only and equivalent-one-to-one controls are separate; both have zero vetoes and exactly match reference. Legacy triggers once: FN +6, IDSW −1, FP unchanged, HOTA +.6147 pp. No treatment passes; new controls lack effective exposure. 完成先前場景新快取的控制比較，未調參、保留弱偵測；零觸發不代表修復，原始診斷留本機。
- **GT-free exposure / GT-free 曝光選取：** [Frozen complete discovery/confirmation ledger](docs/en/tracking-exposure-selection.md) / [繁中](docs/zh-TW/tracking-exposure-selection.md), 17,984 frames / 16 sources / 144 runs. Availability triggers eight times across six discovery sources (first by order: MOT17-10), but neither reserved source triggers; equivalent assignment never triggers. No independently replicated exposure or quality acceptance. All 197 reference alternatives have positive objective cost; no retuning. 全序列與零值均公開彙總，原診斷本機；04 的「新場景」文案已更正為先前場景的新快取。
- **Alternative structure / 替代關聯結構：** [Frozen 197-alternative diagnosis](docs/en/tracking-competition-structure.md) / [繁中](docs/zh-TW/tracking-competition-structure.md) reconciles full one-to-one costs without tracking, GT or retuning. 188 competitors already have accepted updates; 165 have better same-column scores. 56 alternatives remove the selected missed-row update; 12 preserve count but change updated row membership, and 39 costs include below-gate contributions. Exact equality tests solver ties, not validated identity ambiguity. 下一個控制點為交換分量內有效更新置換／跨格穩定性，不挑新容差、不新增 veto；原診斷留本機。
- **Temporal support / 跨格支援：** [Definitions frozen before extraction](docs/en/tracking-temporal-support.md) / [繁中](docs/zh-TW/tracking-temporal-support.md), all 197 reference alternatives / 17,984 trace frames. All eight occupancy/update-effect groups retained; nonempty recorded history prefixes and 120,360 age/counter checks reconcile. Next-frame support: 114 gate / 19 signed-gap / 69 selected-no-update; unknowns stay separate. Nine available competitors become retained, not active, in the reference continuation. No new temporal veto or fitted duration; next candidate is past-only accepted-observation support qualification with active/retained roles and update-displacement protection. 分組與跨格診斷完成，不讀 GT、不調參；出生索引未記錄，原始歷史留本機。
- **Past-only intervention / 決策前支援介入：** [Frozen factorial KITTI study](docs/en/tracking-past-support.md) / [繁中](docs/zh-TW/tracking-past-support.md): new complete 0000–0003 group / 978 original frames / 48 equal repeat runs plus four equal unhooked references, predictions sealed before GT. All scenes have zero active alternatives and zero vetoes: unchanged FN174/FP169/IDSW0/Frag1, 305 evaluated pedestrian observations, 0003 zero-GT. Every scene harm gate passes but all controls fail exposure/quality; no improvement or acceptance claim. Reporting-only empty-stage/file repairs retain original freeze/predictions with explicit amendment; no retuning/default changes. 因果資格、缺證據與更新配對保護已實作，獨立執行完成但有效曝光／效益未驗證；原始資料留本機。
- **Same-rule exposure / 同規則曝光：** [Frozen GT-free discovery/confirmation](docs/en/tracking-past-exposure.md) / [繁中](docs/zh-TW/tracking-past-exposure.md): all 16 seen MOT discovery sources / 17,984 frames, past/protection/joint vetoes 40/8/2 (11/6/2 exposed sources), selecting 09/10/MOT20-06 by fixed order. Complete discovery seals before output on untouched KITTI 0004/0005; both reserved sources have zero vetoes. All 18 sources / 216 factorial runs plus 18 unhooked references complete, repeated canonical/full traces/counts agree. No GT, tuning or independently replicated exposure; no quality/default promotion. 新流程與全清單完成，零值／失敗規則保留、沒有失敗，弱延續不變，原診斷留本機。
- **Applicability gap / 適用曝光落差：** [Read-only frozen-history diagnosis](docs/en/tracking-exposure-gap.md) / [繁中](docs/zh-TW/tracking-exposure-gap.md), all 18 sources/four arms/ 74,380 trace frames, no inference/tracking/GT/scoring rerun. Reference discovery:1,389 accepted missed weak opportunities,178 active-competition edges/ 197 alternatives; past supported 28/missing 56/ineligible 113, protection occupied 188/pass 9/calculated displacement 0. KITTI 0004's13 weak-input missed rows all below the original gate;0005's46 inputs all weak with no hypothesis rows. Both stop upstream of intervention, not at past/protection rejection; null denominators preserved. 原曝光／每筆決策與兩次遍歷核對，弱延續／預設保留、案例本機。另訂正buffer 30是30Hz基準，原配置／凍結JSON／結果不改。
- **Upstream lifecycle / 上游生命週期：** [Frozen read-only KITTI reference](docs/en/tracking-upstream-lifecycle.md) / [繁中](docs/zh-TW/tracking-upstream-lifecycle.md),611 original frames, three isolated passes per source: original canonical references equal, all new native outputs/final states equal, observed lifecycle repeats equal, all268 original stages/geometry checked. 0004:10 births/7 confirmations,3 immature age1 removals/7 confirmed age11 expiries;57 missed rows lack weak input,13 co-occurring rows all zero predicted/last-accepted overlap, including6 non-positive predicted boxes. 0005:46 weak-only inputs, no births/expiry. **Observation complete, quality/independent exposure open.** No GT/inference/tuning or control/default changes, weak continuation retained, raw geometry/state local. 下一步只讀追查非正預測寬高與觀測空窗，再決定獨立介入。
- **State/observation health / 狀態與觀測健康：** [Frozen full-history audit](docs/en/tracking-state-observation-health.md) / [繁中](docs/zh-TW/tracking-state-observation-health.md),611 original frames, no tracking/inference/GT/tuning.0004:4 confirmed hypotheses first become non-positive during prediction4/7/8/11 frames after a valid accepted posterior,18 invalid prediction rows overall; all22 accepted updates remain positive. Of77 terminal row frames,52 have no input;5 have high gate support without acceptance,0 weak gate support.0005 never initializes. All original reference bytes/native seals and268 stages reconcile, repeated audit bytes equal. **Mechanism audit complete; numerical root cause, intervention and independent quality/harm acceptance open.** 下一步另凍結內部估計器影子重播與5個高階段指派案例稽核，原診斷／精確邊界距離本機、弱延續／預設不變。



- **Real example / 真實範例：** 24 consecutive public Pexels frames exercise genuine depth, YOLO26n CPU detection, the isolated worker and browser replay. It has no identity ground truth and spans only **0.959 s** from first to last frame. The reused CUDA environment is not a fresh installation of the complete Alpha.2 recipe; screenshots/docs were added after its frozen release. 真實短片回放，不是長遮擋、精度或完整配方新安裝驗收；後補文件不改 Tag／下載包。
- **Current CI / 目前檢查：** Ubuntu/Windows × Python 3.11/3.12 application contracts and model API installation/import checks; no pretrained weights or inference in CI. 跨平台契約與實際 API 匯入，不等於 Windows 真推論或實機通過。

[Validation history / 驗證紀錄](docs/en/validation.md) · [繁中紀錄](docs/zh-TW/validation.md) · [Tracking studies / 研究入口](docs/versions/v0.3/README.md#validation--驗證紀錄) · [Real replay & terms / 真回放與條款](docs/zh-TW/tracking-replay-example.md)

### Unverified / 未驗證

- **Reliability / 可靠性：** generalised long-occlusion recovery and crossing/moving-camera ID stability; independent confirmation/competition, localisation and recovery experiments. Missing/new IDs in the short example are not verified ID switches. 長遮擋、交會及移動相機的泛化表現仍待驗證，不能僅憑短片的缺框／新 ID 認定換 ID。
- **Timing / 時間：** Session worker steps remain fixed at 30 Hz per saved frame; replay 1× targets 5 saved frames/s, while the example source is 23.976 fps. Snapshot gaps are not modelled; no real-time or object-speed claim. 固定步長與回放速度不代表來源影片時間，不能據此推算速度。
- **Hardware & geometry / 實機與幾何：** physical RTSP, fresh Windows pretrained depth/semantic inference and real worker integration, endurance/VRAM, NVIDIA hardware WebGL and independently calibrated distance accuracy remain open. Camera-space IDs/XYZ are local associations, not person identities or motion-compensated world trajectories. 實機與精度仍未通過；相機座標 ID／XYZ 不是身分辨識或世界軌跡。

### Next / 下一步

The [frozen state/observation-health audit](docs/en/tracking-state-observation-health.md) is complete. Four KITTI0004 hypotheses first lose positive dimensions during prediction after valid accepted input/posterior states,4/7/8/11 native frames later; the full population has18 invalid prediction rows. Terminal gaps mostly lack observations (52/77 row frames), while5 high-stage gate-supported rows remain unaccepted;0005 never initializes. No tracking intervention is installed. Next freeze an isolated numerical shadow replay with internal estimator state and unchanged native reference outputs, and separately audit original one-to-one selection on those5 high-stage rows before defining a control. Neither follow-up is implemented. Positive boxes do not establish correct identities or numerical state health. Preserve weak continuation/defaults, all negative/harm gates and untouched future confirmation.
[凍結狀態／觀測健康稽核](docs/zh-TW/tracking-state-observation-health.md)已完成：0004有4個假說在有效接受輸入／posterior後4／7／8／11原格，首次於預測失去正尺寸，全母體18次異常預測列；終端52／77列格無輸入、另5個高階段過gate卻未接受，0005仍無初始化。本輪不新增追蹤介入；下一步另凍結內部估計器數值影子重播並保持原生參考輸出，另稽核5個高階段的一對一指派，再定控制，兩項尚未實作。正尺寸不代表正確身分或內部數值健康；弱延續／預設、陰性／傷害門檻與未見確認要求保留。

## Next acceptance gates / 下一步驗收

These gates apply to current `main`; the version sections above identify which retained or new capabilities they cover. Define acceptance criteria before running; record exact commits, dependencies/devices, inputs/terms, commands, results and failures. A gate stays open until those criteria are met and supporting evidence is recorded.
以下以目前 `main` 驗收，對應上方各版功能。執行前先訂通過標準，記錄確切 commit、套件／裝置、輸入／條款、指令、結果與失敗；達標且附上證據後才標為完成。

### P0 — Tracking reliability / 追蹤可靠性

1. **Confirmation & competition / 確認與競爭：** [Same-rule GT-free search](docs/en/tracking-past-exposure.md) finds40/8/2 seen-discovery vetoes, none in both reserved KITTI sources. [Completed health audit](docs/en/tracking-state-observation-health.md) / [繁中](docs/zh-TW/tracking-state-observation-health.md) locates four first invalid predictions after valid accepted states,52/77 terminal row frames with no input and5 gate-supported/unaccepted high-stage row frames;0005 never initializes. Reference bytes/native seals stay unchanged. **Observation diagnosis complete; numerical cause, independent exposure, usefulness and harm remain open.** Next independently freeze internal-state shadow replay and high-stage assignment audit before a control; no threshold/default promotion. 原始案例與精確邊界距離本機、弱延續保留，零分母不當驗收。
2. **Localisation & recovery / 框品質與恢復：** isolate detector localisation/resolution from association recovery and hypothesis expiry. Observed geometric support can be absent, below the state/gate or assigned elsewhere; it is not proof a detector/gate fix is available. MOT20-01 recall remains 13.98% with zero complete long-event endpoint pairs; the completed KITTI health audit identifies prediction/observation gaps but does not isolate detector causality. Prioritize internal-state replay and high-stage assignment diagnosis before deciding a separate detector-localisation/resolution comparison. Keep it separate from deferral, confirmation or buffer changes. Full contexts stay local; geometric support is not a causal diagnosis. 健康稽核完成後，先做內部狀態重播／高階段指派診斷，再決定是否另凍結框品質／解析度比較，與到期、恢復控制分開；不直接歸因或盲目加 ReID／buffer。
3. **Independent sequence group / 獨立序列組：** The same-rule study reclassifies all 16 prior MOT sources, including formerly reserved03/05, as seen discovery. KITTI0000–0003 remains the earlier negative scored cohort; prospectively reserved0004/0005 adds611 native 10 Hz pixel-verified frames without GT/score access, after a full discovery seal. Both have zero treatment exposure, and are now seen too. Dataset/source-family separation does not establish independent sites/participants or adequate long-event coverage. Keep full ordered negative ledgers; future confirmation must be untouched, not a relabelled discovery source. 全部來源、零值／失敗保留，不用重複增加獨立證據；不冒稱品質驗收。
4. **Current dependencies / 目前依賴：** admission/diagnosis use shared 8.4.176 CPU caches for 09/10; recovery deferral uses separate 8.4.176 caches on MOT20-01 and moving 11/13. Exclusive competition uses another fresh 8.4.176 cache on MOT17-04. Reused runtime is not a fresh complete Alpha.2 installation. Exposure selection reuses six immutable 8.4.176 caches and adds ten full-source bounded-shard caches with continuous tracker state. KITTI adds four fixed 8.4.176 CPU caches on pixel-verified lossless 10 Hz originals with unchanged buffer parameter 30 (30-Hz reference; native 10 frames at 10 Hz, nominal 1 second; [erratum](docs/validation/v0.3-buffer-semantics-erratum.json)). The same-rule scan reuses all 16 MOT caches and adds two new KITTI 8.4.176 CPU caches only after discovery seals, with no GT scoring. Earlier studies keep 8.4.115 caches/scores; do not transfer or pool them. 本輪增加新場景限定證據，仍需更多獨立序列與完整配方驗收；歷史快取／分數保持分開。

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
