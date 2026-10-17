## v0.3.0-alpha.0 — Offline semantic tracking development addition

- Optional CPU-only manual YOLO Detect/Segment analysis on 2–24 manually archived Session frames, with class-gated short-term 2D Object IDs and candidate camera XYZ/depth history.
- Local SHA-256-checked tracking report with async status, bilingual Sessions UI, bounded limits and fake-backed regression tests.
- Genuine CUDA depth and CPU YOLO Detect/Segment passed a 24-frame public-video Session pilot; a separate frozen-detection comparison evaluated eight tracking methods on 179 consecutive public frames. See [the bilingual tracking evidence](docs/en/tracking-evaluation.md).
- No ReID, world-coordinate trajectory, continuous RTSP recording or measurement guarantee; physical-camera and broader scene acceptance remains pending.

- Added opt-in Roboflow BoT-SORT for v0.3 Session analysis via a disposable NumPy 2 worker; original detection geometry is retained. [Setup and public-sequence validation](docs/en/tracking-worker.md).
- v0.3 Session 新增選配 BoT-SORT，獨立 NumPy 2 worker 保留原始量測；預設仍為簡易關聯，v0.3 尚未發布。

# Changelog / 版本紀錄

## 0.2.0-alpha.1 — 2026-10-17 (experimental Alpha pre-release)

[Bilingual release notes / 雙語版本說明](docs/releases/0.2.0-alpha.1.md)

- Added Spatial Analysis Lab (`/spatial`) with clickable point inspection, stale-frame detection, native-unit four-model sequential comparison, YOLO Detect/Segment 2D→3D object point subsets, and camera calibration / candidate-plane / independent validation tools.
- Added deterministic comparison archives and current-frame `spatial_analysis.json` in the existing export ZIP, keeping all original raw depth and geometry outputs.
- Preserved the four depth adapters, RTSP source and bilingual UI. Added attributed real-inference screenshots, curated Ubuntu / RTX 4090 smoke results, and a regression fix for comparison-cloud camera fitting. No FPS, physical RTSP or field distance accuracy is asserted.

- 新增 `/spatial` 點位查詢、四模型同圖依序比較、YOLO 物件語意融合、棋盤格標定與獨立誤差驗證。
- 比較包與同影格 ZIP 保留原始深度、單位與追溯資訊。原有四模型／RTSP／雙語／授權不變。
- 此版本為實驗性 Alpha 預發行版；2026-10-17 已在 Ubuntu／RTX 4090 通過真單圖 CUDA、四模型與 YOLO 語意 smoke test，實體 RTSP 與測距真值仍未驗證。

## 0.1.0-alpha.1 — 2026-10-16

First independently named **DepthPort** source-release candidate, derived from a four-model prototype. This starts a public-facing version line; it is not an upstream model release.

首個獨立命名的 **DepthPort** 原始碼候選發布版，整理自四模型 prototype；版本重新起算，不是上游模型的發行版本。

- Reorganized implementation into `depthport/`; retained image/RTSP, four adapters, geometry and exports.
- Added English / Traditional Chinese UI, persistent language choice and bilingual user documentation.
- Added source license, attribution, contribution/security policies, issue/PR templates and release guidance.
- Added an explicit public-source manifest, source-download route, hostname validation and non-echoing validation errors.
- Added a synthetic-only static demo builder, deterministic source archive, CI configuration and release checks.

- 程式整理至 `depthport/`，保留圖片／RTSP、四模型、幾何與匯出。
- 新增英文／繁體中文介面、語言記憶與雙語使用文件。
- 補齊授權、來源、貢獻／安全政策、Issue／PR 範本與發布說明。
- 新增公開清單、原始碼下載、Host 檢查及不回顯輸入的驗證錯誤。
- 新增合成靜態示範、可重現原始碼封裝、CI 與發布檢查。

**Not claimed / 不宣稱：** real pretrained inference, clean target installation, GPU/physical RTSP validation, GitHub-hosted CI success, public deployment or metric accuracy. See the bilingual validation records.

- v0.3 development: opt-in saved-session offline same-grid temporal depth consistency, normalized relative-depth shape diagnostics, JSON export and bilingual Session UI. These are **not** motion-corrected 3D drift or physical distance validation.
