# Changelog / 版本紀錄

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
