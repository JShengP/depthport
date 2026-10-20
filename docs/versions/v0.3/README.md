<div align="center">

# v0.3 · Sessions, Replay & Offline Tracking

**工作階段、回放與離線追蹤**<br>
Experimental Alpha / 實驗性 Alpha

[Project](../../../README.md) · [繁體中文首頁](../../../README.zh-TW.md) · [v0.1](../v0.1/README.md) · [v0.2](../v0.2/README.md) · **v0.3**

</div>

Adds opt-in local Sessions, replay review and offline Object IDs while retaining the viewer and Spatial Analysis.
保留檢視器與空間分析，新增選用本機 Session、回放檢查與離線 Object ID。

**Release / 發布快照:** [v0.3.0-alpha.2](https://github.com/JShengP/depthport/releases/tag/v0.3.0-alpha.2) · [Exact source / 對應程式](https://github.com/JShengP/depthport/tree/v0.3.0-alpha.2) · [Original README](https://github.com/JShengP/depthport/blob/v0.3.0-alpha.2/README.md) · [原版繁中 README](https://github.com/JShengP/depthport/blob/v0.3.0-alpha.2/README.zh-TW.md)

[Differences / 差異](#differences--差異) · [Architecture / 架構](#architecture--架構) · [Examples / 範例](#examples--範例) · [Getting started / 使用入口](#getting-started--使用入口) · [Validation / 驗證紀錄](#validation--驗證紀錄) · [Limits / 驗證限制](#limits--驗證限制)

> [!IMPORTANT]
> Session storage is off by default; simple association remains default. Short replay examples and API CI do not close tracking/hardware acceptance.
> Session 儲存預設關閉、預設仍為簡易關聯；短片範例與 API CI 不代表追蹤或實機驗收通過。

This maintained guide may include later illustrations/documentation; the tagged source, original READMEs and release assets stay fixed. 本頁可補充後續插圖／文件，既有 Tag、原版 README 與下載包不變。

## Differences / 差異

- **New local archive / 新增本機封存:** opt-in manual same-frame RGB/depth/PLY/raw NPY, SHA-256 replay and model-grouped summaries; no automatic recording or inference during replay. 選用手動保存與完整性回放，不自動錄影，回放不重新推論。
- **New offline association / 新增離線關聯:** explicitly requested YOLO Detect/Segment analysis creates local Object IDs and camera-space depth/XYZ histories. Simple association stays default; optional BoT-SORT uses an isolated NumPy 2 worker. 明確操作才分析，NumPy 1 應用與 worker 隔離，原預設不變。
- **New review controls / 新增檢查操作:** boxes/IDs, playback/speed/timeline/A-B loops, searchable bookmark notes/tags, JSON backup and editor/IME guards. 疊圖、回放、書籤備註與輸入／中文組字防誤觸。
- **Retained & research scope / 延續與研究範圍:** retains v0.1/v0.2 features; Baseline/ByteTrack/BoT-SORT comparison tools support offline studies. **ByteTrack is a benchmark backend, not another Session UI selector.** 保留前版；ByteTrack 僅屬研究後端，沒有新增 UI 選項或 ReID。

<details>
<summary>Capability illustration / 展開功能示意圖</summary>

![v0.3 generated capability and workflow schematic](../../assets/v0.3-workflow.svg)

*Generated schematic, not a UI screenshot, model output or acceptance evidence. 程式生成的功能示意，不是實際介面、推論結果或驗收證據。*

</details>

## Architecture / 架構

**Flow / 主流程:** explicit snapshot → integrity-checked local archive → offline YOLO → association → replay overlays and local review.

- **Application / 主應用:** NumPy 1 depth runtime and saved RGB/depth remain aligned. 深度、RGB 與保存資料對齊。
- **Optional worker / 選配 worker:** one disposable stdio subprocess isolates NumPy 2; bounded JSONL/PNG IPC returns original detection indices and IDs. 單次工作子程序透過有界 IPC 回傳原始偵測索引與 ID。
- **Review / 回放檢查:** the parent samples original boxes/masks and saved depth, not Kalman-predicted locations; notes and JSON backups stay local. 依原框／遮罩取深度，不用預測位置代替，備註與備份留在本機。

**Contract / 邊界:** manual snapshots advance a fixed tracker step; elapsed snapshot gaps are not modelled. Camera-space XYZ histories do not establish motion-compensated world tracking or speed. 手動快照採固定步長，未建模真實時間間隔，也不是世界軌跡或速度。

<details>
<summary>Flowchart / 展開架構流程圖</summary>

```mermaid
flowchart TD
    D[Depth-model worker / NumPy 1 app] --> S[Explicit manual snapshot]
    S --> A[Local Session archive / hash checks]
    A --> R[Replay saved RGB / depth / PLY]
    R --> U[Overlay / playback / local bookmarks]
    A --> Y[Explicit CPU YOLO offline analysis]
    Y --> B[Default simple association]
    Y --> J[Bounded JSONL / PNG IPC]
    J --> W[Disposable BoT-SORT worker / NumPy 2]
    W --> I[Original detection indices and Object IDs]
    B --> H[Camera-space depth / XYZ histories]
    I --> H
    H --> U
```

</details>

## Examples / 範例

**Real short replay example / 真實短片回放範例.** Genuine YOLO26n CPU Detect + isolated BoT-SORT on public footage by **Lukas Kosc via Pexels**, using Alpha.2 code. The 24 consecutive source frames show Object IDs, crossing, partial occlusion and missing/new observations. 真實推論與介面，24 格連續來源影格保留缺框／新 ID，沒有手動修正。

<details>
<summary>View screenshot / 展開範例畫面</summary>

<p align="center">
  <img src="../../assets/tracking-replay-crossing.zh-TW.jpg" width="960" alt="v0.3 real replay with Object IDs during pedestrian crossing and partial occlusion">
</p>

</details>

Source / 來源：[Lukas Kosc / Pexels](https://www.pexels.com/video/urban-street-scene-with-people-crossing-34597902/), combined with actual UI and explanation under the [Pexels terms](https://www.pexels.com/terms-of-service/). Footage retains its own terms, not the application's AGPL; no endorsement is implied. 原素材保留 Pexels 條款，不因程式 AGPL 改授權或暗示背書。

[Three-frame walkthrough & exact conditions](../../en/tracking-replay-example.md) · [三張前後影格與完整條件](../../zh-TW/tracking-replay-example.md) · [Curated record / 彙總紀錄](../../validation/v0.3-public-replay-example.json)

Session #12 = source frame 43 at 1.752 s. This example reused a documented CUDA environment, not a fresh installation of the complete Alpha.2 requirements. Screenshots/docs were added after Alpha.2; its tag/download assets are unchanged. 圖中 Session #12 對應來源第 43 格；沿用 CUDA 環境，不是完整依賴配方的新安裝驗收，後補文件不覆寫發布包。

## Getting started / 使用入口

1. Install the tagged application, then set `ENABLE_SESSION_STORAGE=1` **locally** and restart. Storage defaults off; open `/sessions`. 安裝本版、明確開啟本機 Session 設定並重啟，再進入 `/sessions`。
2. For BoT-SORT, install the [isolated worker](../../en/tracking-worker.md) / [繁中 worker](../../zh-TW/tracking-worker.md), configure its local Python interpreter and explicitly select that backend. 選配 worker 需獨立安裝並主動選取。
3. Follow the [Session/replay guide](../../en/sessions.md) / [繁中操作](../../zh-TW/sessions.md). `/` and `/spatial` remain available. 保留原檢視器與空間分析。

Private snapshots, bookmarks, notes and JSON backups stay local and are excluded from the public Repo/Release. 私人快照、書籤、備註與備份不加入公開 Repo／Release。

## Validation / 驗證紀錄

- **CI / 跨平台檢查:** Ubuntu/Windows × Python 3.11/3.12 application contracts and real model API installation/import. No pretrained weights or inference in CI. 應用契約與實際 API 匯入，不含真權重推論。
- **Replay example / 回放範例:** the recorded short public clip exercises genuine depth, CPU detection, the isolated worker and the actual browser replay. It has no identity ground truth. 已記錄真深度／偵測／worker／瀏覽器操作，沒有身分真值。
- **Research / 研究證據:** public-sequence studies keep their fixed detection caches and recorded versions. New dependencies do not inherit those accuracy results; lower activation can add coverage and ID switches/FP together. 舊快取與舊分數不能當新版精度，原預設不變，長遮擋恢復未通過。
- **Admission controls / 新 ID 控制:** [1,179 frames / 72 runs](../../en/tracking-admission-acceptance.md) / [繁中](../../zh-TW/tracking-admission-acceptance.md) separately test confirmation and birth competition using fresh 8.4.176 detections on previously studied scenes. Fewer FP trade off more FN/lower combined IDF1/HOTA; birth veto never triggers. No candidate passes the research screen; defaults and independent acceptance gates remain unchanged. 完成本輪控制實驗，不等於獨立序列或可靠性驗收通過。
- **Association diagnosis / 關聯診斷:** [16 observed reruns](../../en/tracking-association-diagnosis.md) / [繁中](../../zh-TW/tracking-association-diagnosis.md) reproduce exact outputs/scores, recording promotion/recovery costs and competition locally. The diagnosis motivated the subsequent ByteTrack missed-hypothesis weak-stage control; its flagged cohort includes valid same-GT recoveries, so no control/default is promoted. 成本／競爭診斷已記錄，原始矩陣／ID 留本機，尚未修復或通過獨立驗收。
- **Recovery control / 恢復控制:** [Frozen new MOT20-01 experiment](../../en/tracking-recovery-acceptance.md) / [繁中](../../zh-TW/tracking-recovery-acceptance.md): 429 frames / six runs, FP −3/FN −102/IDSW −8; passes the research screen with ordinary weak continuation preserved. Recall 13.98%, fragmentation increases and 0/9 long-event endpoint pairs are complete. 研究達標仍有新增失敗，更多場景／移動相機與長遮擋驗收待補，維持離線選用及原預設。
- **Moving replication / 移動重驗:** [Unchanged 11/13 control and added-error audit](../../en/tracking-recovery-moving.md) / [繁中](../../zh-TW/tracking-recovery-moving.md): 1,650 frames / 12 runs, FP −8 with zero added FN/IDSW; scene-13 HOTA slightly decreases, so the group fails its screen. No long-event recovery gain. 未調參、未升預設，補析前輪直接延後與後續關聯失敗，原始診斷留本機。
- **History evidence / 歷史證據:** [Frozen-output diagnosis](../../en/tracking-recovery-history.md) / [繁中](../../zh-TW/tracking-recovery-history.md) separates retained-state gating, CLEAR ownership and low-threshold HOTA losses. All ten flagged competitors already have other assignments; costs do not support a new cutoff. 不重跑追蹤或調參，下一控制點為有效排他競爭，弱延續與預設保留。
- **Exclusive controls / 排他控制:** [Frozen fresh-cache comparison](../../en/tracking-exclusive-competition.md) / [繁中](../../zh-TW/tracking-exclusive-competition.md), 1,050 frames / 12 runs. Availability and equivalent assignment tested separately, both zero vetoes and exactly reference; legacy adds six misses with unchanged FP. 完成實作／比較，尚缺有效曝光，不升預設；弱偵測延續保留。
- **GT-free exposure / GT-free 曝光:** [Complete frozen discovery/confirmation](../../en/tracking-exposure-selection.md) / [繁中](../../zh-TW/tracking-exposure-selection.md), 16 sources / 17,984 frames / 144 runs. Availability vetoes eight times in six discovery sources, none in reserved confirmation; equivalent assignment never triggers. 無獨立曝光重現或品質驗收，不調參，完整陰性紀錄保留。
- **Alternative structure / 替代結構:** [197 frozen reference alternatives](../../en/tracking-competition-structure.md) / [繁中](../../zh-TW/tracking-competition-structure.md): 188 occupied competitors, 56 lost missed-row updates, 12 equal-count row replacements, 39 below-gate cost contributions. Exact equality is not validated identity ambiguity; next study component-level update displacement and temporal stability. 不調參、不讀 GT，原始診斷留本機，預設不變。
- **Temporal support / 跨格支援:** [Frozen risk groups/history definitions](../../en/tracking-temporal-support.md) / [繁中](../../zh-TW/tracking-temporal-support.md), all 197 reference alternatives. +1 gate 114 / signed-gap 19 / selected-no-update 69; all eight groups and unknowns retained. No time veto or fitted N; next candidate uses past accepted-observation support, active/retained roles and update protection. 不調參／不讀 GT，出生索引未記錄，原始歷史本機保留。
- **Causal support/protection / 因果支援與保護:** [New KITTI factorial](../../en/tracking-past-support.md) / [繁中](../../zh-TW/tracking-past-support.md),978 original frames/ four arms × three equal repeats. Zero active alternatives/vetoes, unchanged scores and no added FN/IDSW; every treatment fails exposure/quality. Next freeze GT-free actual-trigger discovery and untouched reserved confirmation. 已完成規則凍結與獨立執行，不是介入效益驗收；原封存／報表修補公開，原始診斷留本機，弱延續與預設保留。
- **Same-rule exposure / 同規則曝光:** [Complete GT-free discovery/confirmation](../../en/tracking-past-exposure.md) / [繁中](../../zh-TW/tracking-past-exposure.md):16 seen MOT discovery sources, treatment vetoes 40/8/2; original-order selections 09/10/MOT20-06 seal before new KITTI 0004/0005 outputs. Both reserved sources zero, no independent exposure/quality acceptance. 全18段／216次對照與18次未掛參考完成，不讀GT、不調參，原始診斷本機、弱延續與預設保留。
- **Applicability diagnosis / 適用性診斷:** [Full frozen-history funnel](../../en/tracking-exposure-gap.md) / [繁中](../../zh-TW/tracking-exposure-gap.md): all 18 sources, four histories; KITTI 0004's13 weak-input missed rows have no gate-supported column,0005 has 46 weak-only inputs and no hypotheses. Past/protection tests are not reached; no new gate, run or GT score. 原計數／決策核對，下一步補只讀預測／出生／到期記錄並要求輸出不變；buffer語意勘誤，原配置／結果保留。
- **Upstream lifecycle / 上游生命週期:** [Frozen reference observation](../../en/tracking-upstream-lifecycle.md) / [繁中](../../zh-TW/tracking-upstream-lifecycle.md):611 original KITTI frames; original canonical reference and new native outputs/final states unchanged. 0004:13 zero-overlap missed weak-input rows,6 non-positive predictions,3 immature/7 expired removals;0005:46 weak-only inputs/no births. 不讀GT、不推論、不調參，弱延續／預設保留；只讀記錄完成，後續先診斷狀態估計健康／觀測空窗，效益與獨立曝光未驗證。
- **State/observation health / 狀態與觀測健康:** [Frozen full-history audit](../../en/tracking-state-observation-health.md) / [繁中](../../zh-TW/tracking-state-observation-health.md):4 first invalid predictions after valid accepted states,18 invalid rows overall;52/77 terminal row frames lack input,5 high gate-supported rows unaccepted;0005 never initializes. 原參考檔／原生雜湊及268階段不變，不重跑追蹤、不讀GT、不調參；後續已完成下項數值影子與高階段指派稽核，弱延續／預設保留，原案例與邊界距離本機。
- **Numerical shadow / 數值影子:** [Frozen numerical replay and independent assignment](../../en/tracking-estimator-shadow.md) / [繁中](../../zh-TW/tracking-estimator-shadow.md):611 frames/six equal complete native references,124 exact shadow operations, four constant corner-velocity collapses; five occupied high-stage edges would replace accepted rows without adding updates.0005 has no estimator exposure. 不讀GT、不推論、不調參／改介入，原state與病例本機；後續幾何控制已完成下項驗證，弱延續／預設保留，品質與獨立曝光未驗證。
- **Geometry control / 幾何控制:** [Frozen source-held-out comparison](../../en/tracking-geometry-validity.md) / [繁中](../../zh-TW/tracking-geometry-validity.md):1,070 new frames/611 seen frames,20 equal repeated passes;0006 invalid predictions9→0 with one retained-confirmed projection,0007 zero trigger. All scene proxy-harm gates pass and outputs remain equal, but both-source exposure gate fails. 不讀GT／調參，弱延續與預設不變；沒有新增恢復／身分效益，下一步另凍結實際投影的GT-free曝光選取及未見確認，原始資料本機。




[Validation history](../../en/validation.md) · [繁中紀錄](../../zh-TW/validation.md) · [Alpha.2 release notes / 發布說明](../../releases/0.3.0-alpha.2.md)

<details>
<summary>Research evidence / 展開研究紀錄</summary>

- [Expanded comparison](../../en/tracking-expanded-acceptance.md) / [三場景比較](../../zh-TW/tracking-expanded-acceptance.md)
- [Parameter study](../../en/tracking-parameter-acceptance.md) / [參數研究](../../zh-TW/tracking-parameter-acceptance.md)
- [Error diagnosis](../../en/tracking-error-diagnosis.md) / [錯誤診斷](../../zh-TW/tracking-error-diagnosis.md)
- [Confirmation/competition ablation](../../en/tracking-admission-acceptance.md) / [確認／競爭控制實驗](../../zh-TW/tracking-admission-acceptance.md)
- [Promotion/recovery cost diagnosis](../../en/tracking-association-diagnosis.md) / [升格／恢復成本診斷](../../zh-TW/tracking-association-diagnosis.md)
- [Competing-recovery deferral experiment](../../en/tracking-recovery-acceptance.md) / [競爭時延後接回實驗](../../zh-TW/tracking-recovery-acceptance.md)
- [Moving-camera replication and error audit](../../en/tracking-recovery-moving.md) / [移動相機重驗與失敗補析](../../zh-TW/tracking-recovery-moving.md)
- [GT-free exposure selection and reserved confirmation](../../en/tracking-exposure-selection.md) / [GT-free 曝光選取與保留確認](../../zh-TW/tracking-exposure-selection.md)
- [Exclusive competition controls](../../en/tracking-exclusive-competition.md) / [排他競爭控制](../../zh-TW/tracking-exclusive-competition.md)
- [State/association-history diagnosis](../../en/tracking-recovery-history.md) / [狀態與關聯歷史診斷](../../zh-TW/tracking-recovery-history.md)
- [Alpha.2 dependency record / 依賴驗證](../../validation/v0.3-dependency-followup.json)

Alpha.2 packages reviewed dependency compatibility updates and workflow illustrations. [Alpha.1](https://github.com/JShengP/depthport/releases/tag/v0.3.0-alpha.1) remains available; publication does not close acceptance gates. Alpha.2 封裝相容性更新與流程圖，發布不等於驗收完成。

</details>

## Limits / 驗證限制

- **Tracking / 追蹤:** generalised long occlusion, crossing/camera-motion ID stability and independent confirmation/competition/localisation/recovery tests remain open. The example spans only 0.959 s between first/last frames and is not long-occlusion acceptance; missing/new IDs are not verified ID switches. 短片不代表長遮擋或確認換 ID。
- **Timing / 時間:** worker steps are fixed at 30 Hz per saved frame; replay 1× targets 5 saved frames/s. These do not represent the source's 23.976 fps or real-time speed. worker 步長與 UI 回放速度不同於此來源影片，不宣稱即時性或物體速度。
- **Hardware gates / 實機項目:** physical RTSP, fresh Windows pretrained depth/semantic inference and real worker integration, endurance/VRAM and NVIDIA hardware WebGL remain unverified. 實體串流、Windows 真權重／worker、長時穩定性與硬體繪圖仍待驗證。
- **Geometry / 幾何:** measured intrinsics and independent calibrated distance accuracy remain open. Relative/virtual depth is not metres; camera-space IDs/XYZ are not identities, world trajectories, hidden-surface reconstruction, SLAM or certified measurement. 深度與相機座標不能視為身分、世界軌跡或認證測量。

[Release scope / 本版範圍](../../releases/0.3.0-alpha.2.md) · [Acceptance roadmap / 驗收路線圖](../../../ROADMAP.md)
