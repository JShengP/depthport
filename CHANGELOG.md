## v0.3.0-alpha.0 — Offline semantic tracking development addition

- Optional CPU-only manual YOLO Detect/Segment analysis on 2–24 manually archived Session frames, with class-gated short-term 2D Object IDs and candidate camera XYZ/depth history.
- Local SHA-256-checked tracking report with async status, bilingual Sessions UI, bounded limits and fake-backed regression tests.
- Genuine CUDA depth and CPU YOLO Detect/Segment passed a 24-frame public-video Session pilot; a separate frozen-detection comparison evaluated eight tracking methods on 179 consecutive public frames. See [the bilingual tracking evidence](docs/en/tracking-evaluation.md).
- No ReID, world-coordinate trajectory, continuous RTSP recording or measurement guarantee; physical-camera and broader scene acceptance remains pending.

- Added opt-in Roboflow BoT-SORT for v0.3 Session analysis via a disposable NumPy 2 worker; original detection geometry is retained. [Setup and public-sequence validation](docs/en/tracking-worker.md).
- v0.3 Session 新增選配 BoT-SORT，獨立 NumPy 2 worker 保留原始量測；預設仍為簡易關聯，v0.3 尚未發布。

- Added exact-snapshot RGB replay overlays with original tracking boxes, fixed-color Object IDs, overlap-label connectors, an overlay toggle, and Previous/Next controls. Missing/unanalysed/stale reports never borrow another frame's IDs.
- 回放 RGB 新增追蹤框／固定顏色 Object ID、標籤連線、疊圖切換與逐格檢視；以快照雜湊與保存序號防止錯格及過期結果。

- Added Play/Pause and 0.25×–2× saved-frame playback (1× target 5 frames/s), sequential decode/presentation without skipped frames, and pause/cancellation on seeking, Session changes, tracking reruns and tab hiding. Original snapshot/ID matching remains required.
- Session 回放新增播放／暫停與速度調整；讀取慢時放慢、不中途跳格，影像解碼後同步更新追蹤框／ID，手動操作與背景分頁會暫停。

- Added a bilingual replay progress slider with current/total saved-frame positions, drag-to-preview and release-to-seek, native keyboard controls, and exact-frame overlay commits. Dragging pauses playback; stale seeks are discarded and failed seeks retain the last complete frame.
- 回放新增可拖曳進度條，顯示目前／總格數；拖曳暫停、放開跳轉，快速跳轉只採最後目標，影像與追蹤框／ID 一起更新。

- Added opt-in A/B saved-frame looping with editable start/end positions, buttons to use the displayed frame, inclusive endpoints and the existing playback speeds. Endpoint changes pause and cancel pending presentation; exact-frame RGB/depth/ID commits and failed-read handling also apply across loop boundaries.
- 回放新增 A／B 區間循環，可輸入起始／結束影格或帶入目前影格，包含兩端並沿用播放速度；修改區間會暫停並取消待顯示結果，循環跳轉仍維持影像／深度／ID 同步與讀取失敗處理。

- Added local per-frame bookmarks with suspected ID-switch, occlusion and crossing tags, plain-text notes, explicit Save/update and removal, and exact-snapshot jumps that preserve A/B settings. Unsaved drafts remain in page memory; saved notes use a separate local `bookmarks.json` and never modify original bundles or tracking reports.
- 新增本機影格書籤，可標記疑似換 ID／遮擋／物件交會、填寫備註並明確保存／更新或移除；點選書籤會跳回同快照並保留 A／B 設定。草稿暫存本頁，已保存備註獨立於原始影格與追蹤報告，不加入公開封裝或自動上傳。

- Added local bookmark JSON export/import with whole-file validation, preview counts, explicit apply, keep-local/overwrite conflict policies and revision checks. Backups contain saved notes/tags and exact-frame anchors only; restoring requires the original Session and frames. Media, drafts and tracking results are excluded.
- 新增書籤 JSON 本機匯出／匯入，整份驗證後預覽筆數、明確套用，可保留本機或覆寫衝突並檢查版本。備份只含已保存備註／分類及同影格定位，還原須保留原 Session 與影格；不含影像、草稿或追蹤結果，不自動上傳。

- Added bookmark tag filters and literal saved-note search with matching/total counts, a no-match message and Clear filters. Tag and keyword conditions combine; search supports case-insensitive and equivalent full-width text. Filtering preserves replay and unsaved edits; JSON export still includes every saved bookmark. Search keywords remain in page memory.
- 新增書籤分類篩選與已保存備註文字搜尋，可組合分類／關鍵字，顯示符合／總筆數、無結果提示並一鍵清除；支援忽略英文大小寫及對應全形字元。篩選保留回放與未保存編輯，JSON 仍匯出全部已保存書籤；關鍵字只留在本頁記憶體。

- Added Previous/Next bookmark controls above replay and beside the list, following the current tag/keyword results in saved-frame order from the last displayed frame. Position counts and disabled boundaries make each review step clear; jumps pause playback, preserve A/B and drafts, and retain exact-frame RGB/depth/ID presentation. Superseded or failed loads cannot replace the last complete frame. Notes and exports remain unchanged and local.
- 回放上方與書籤列表旁新增「上一個／下一個書籤」，從目前已顯示影格依分類／關鍵字結果與保存順序逐筆檢查，顯示序位並在邊界停用。跳轉暫停並保留 A／B 與草稿，影像／深度／ID 同步更新；過期或失敗載入不取代上一份完整影格，備註及匯出內容維持本機且不變。

- Added `[` / `]` keyboard shortcuts for previous/next filtered bookmarks with a visible, default-on disable checkbox. Editing controls, IME composition, held-key repeats, modifier combinations, handled keys and hidden pages are ignored. Shortcuts retain the buttons' boundary/loading guards, A/B settings and drafts; the preference stays in page memory.
- 新增 `[`／`]` 快捷鍵跳到上一個／下一個篩選書籤，提供預設開啟的核取方塊供停用；編輯控制項、輸入法組字、長按重複、修飾鍵組合、已處理按鍵及背景頁面不觸發。沿用按鈕的邊界與載入防護，保留 A／B 與草稿，偏好只留在本頁記憶體。

- Added Space to play/pause and Left/Right Arrow to step one saved frame from the last fully displayed frame across the whole Session, using the existing keyboard-shortcuts checkbox. Typing/IME and native interactive Space actions are protected; pending manual work is serialized, and stepping pauses autoplay while preserving A/B settings, drafts and exact-frame overlays. Playback shortcuts only read local frames.
- 新增空白鍵播放／暫停、左右方向鍵從最後完整顯示影格逐格瀏覽整個 Session，沿用原有快捷鍵核取方塊；輸入／組字及互動控制項原生空白鍵操作不受影響。手動載入期間避免重疊操作，逐格移動先暫停自動播放，保留 A／B、草稿與同影格疊圖；只讀取本機影格。

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
