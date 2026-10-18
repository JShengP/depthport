/* SPDX-License-Identifier: AGPL-3.0-only */
(() => {'use strict';
const by=id=>document.getElementById(id);
const tr={
  en:{shortcutHelpVisitHistoryClearTargets:"This return-target visit Undo clear / Redo clear each show their own target frame position / total and saved #index beside the button. Targets follow this return position’s clear history, independently of the shown frame or bookmark filters. Known but blocked targets retain their identity with an unavailable marker; missing/stale targets show No available target. Undo follows its cleared notice visibility; Redo remains visible and disables when unavailable. Each button is associated with its own live summary. No notes are shown. Display changes never navigate or modify drafts, playback, review settings or existing clear/return/deletion history. Click a target frame number, or press Enter/Space on its button, to pause and replay that exact saved snapshot while keeping both frames’ drafts, review settings and all existing clear/return/deletion history. No valid target or busy action disables the jump. Failed reads/hash checks/decoding keep the shown frame/editor and allow retry; stale Session/generation replies are rejected. Jumping never restores, clears, consumes or replaces any return point or undo/redo eligibility. The target buttons work with shortcuts off.",shortcutHelpRedoClearVisitHistoryPosition:"Press Shift+P outside editors or use this return-target visit Redo clear button to redo clearing only the just-restored return-target visit position. Success shows “Return-target visit position cleared” and disables return; P or Undo clear can restore it again. Keep the shown frame, unsaved drafts, active/pending playback, review settings and all existing clear/return/deletion history. Accepts Shift+p and Shift+P. Ignored in note/search/native/custom/composed-path/active editors, during IME/keyCode 229, with Ctrl/Alt/Meta, repeated/handled/hidden events, dialogs, shortcuts off or without a valid just-restored position/while busy. New, consumed or stale positions are not eligible. No requests or writes. The Redo clear button works with shortcuts off and disables without a valid just-restored position or while busy; successful redo disables it until another successful Undo clear.",shortcutHelpUndoClearVisitHistoryPosition:"Press P outside editors to undo clearing only this return-target visit position. Success shows “Return-target visit position restored” with its target. Keep the shown frame, unsaved drafts, playback, review settings and all existing clear/return/deletion history. Accepts p or Caps Lock P without Shift. Ignored in note/search/native/custom/composed-path/active editors, during IME/keyCode 229, with Ctrl/Alt/Meta/Shift, repeated/handled/hidden events, dialogs, shortcuts off or without a valid backup/while busy. The Undo clear button still works with shortcuts off.",bookmarkVisitClearHistoryReturnRestored:"Return-target visit position restored",bookmarkVisitClearHistoryReturnCleared:"Return-target visit position cleared",bookmarkClearVisitHistoryPosition:"Clear this return-target visit position",shortcutHelpClearVisitHistoryReturn:"Press Shift+N outside editors or use Clear this return-target visit position to clear only the Return before this return-target visit position and disable both buttons. Successful button or Shift+N clearing shows “Return-target visit position cleared” until Undo clear, a new return point or Session/frame-list/page reload. Missing/blocked actions do not create a success notice. The button works with shortcuts off and disables without a valid position or while busy. Keep the shown frame, every unsaved draft, playback including pending presentation, review settings and all existing clear/return/deletion history. The shortcut is ignored in note/search/native/custom/composed-path/active editors, during IME/keyCode 229, with Ctrl/Alt/Meta, repeats/handled/hidden events, dialogs, shortcuts off or without a valid position/while busy. A later successful different-frame target visit can create a new return point. Page-memory only; no requests or writes. Successful clearing shows an Undo clear button beside the notice. It restores only the last cleared position without navigating or changing drafts, playback or existing history, works with shortcuts off, disables without a valid backup or while busy, and hides after success. A new return point, successful return or Session/frame-list/page reload discards the backup; same-frame/failed target visits retain it. Successful Undo clear shows “Return-target visit position restored” with its target in the live status summary. Ordinary navigation, review/language changes and failed returns retain it; clearing again, a new return point, successful return or Session/frame-list/page reload removes it. Missing/blocked undo actions never create a success notice.",bookmarkVisitClearHistoryReturn:"Return before this return-target visit",shortcutHelpVisitClearHistoryReturn:"After visiting this clear-target visit return Undo clear / Redo clear target, press N outside editors or use Return before this return-target visit to pause and replay the last fully shown origin. Keep both frames’ drafts, review settings and every existing clear/return/deletion history. One separate return point per page/Session; a later successful different-frame target visit replaces it, while same-frame/failed visits do not. Successful return consumes only this point; failure keeps it for retry. Disabled without a valid point or while blocked/busy; Session/frame-list/page reload clears it. Exact Session/generation/snapshot checks reject stale replies. N ignores note/search/native/custom/composed-path/active editors, IME/keyCode 229, repeats/handled/hidden events, Ctrl/Alt/Meta, dialogs, shortcuts off and missing/busy positions. Shift+N uses the separate clear action. The button works with shortcuts off.",shortcutHelpVisitReturnClearTargets:"This clear-target visit return Undo clear / Redo clear each show their own target frame position / total and saved #index beside the button. Targets follow this return clear history, not the shown frame or bookmark filters. Known blocked targets keep their identity with an unavailable marker; missing/stale targets show No available target. Undo follows the cleared notice visibility; Redo remains visible and disables when unavailable. Click a target frame number, or press Enter/Space on it, to pause and replay that exact saved snapshot while preserving each frame’s drafts, review settings and every existing clear/return/deletion history. Missing/busy targets disable the jump; failed jumps keep the shown frame/editor and allow retry, and stale Session/snapshot replies are rejected. Navigation never restores, clears, consumes or replaces a return point or undo/redo eligibility. No notes are shown.",shortcutHelpRedoClearVisitJumpPosition:"Press Shift+K outside editors or use this clear-target visit return Redo clear button to redo clearing only the just-restored position. The button works with shortcuts off and disables without a valid just-restored position or while busy. Success shows “This clear-target visit return position cleared”; K can restore it again. Keep the shown frame, unsaved drafts, playback, review settings and every existing clear/return/deletion history. Ignored in note/search/native/custom/composed-path/active editors, during IME/keyCode 229, with Ctrl/Alt/Meta, repeated/handled/hidden events, dialogs, shortcuts off or without a valid just-restored position/while busy.",shortcutHelpUndoClearVisitJumpPosition:"Press K outside editors to undo clearing only this clear-target visit return position. Success shows “This clear-target visit return position restored” with its target. Keep the shown frame, unsaved drafts, playback, review settings and every existing clear/return/deletion history. Ignored in note/search/native/custom/composed-path/active editors, during IME/keyCode 229, with modifiers, repeated/handled/hidden events, dialogs, shortcuts off or without a valid backup/while busy. The Undo clear button still works with shortcuts off.",bookmarkVisitClearJumpReturnRestored:"This clear-target visit return position restored",bookmarkVisitClearJumpReturnCleared:"This clear-target visit return position cleared",bookmarkClearVisitJumpPosition:"Clear this clear-target visit return position",shortcutHelpClearVisitClearJumpReturn:"Press Shift+J outside editors or use Clear this clear-target visit return position to clear only the Return before this clear-target visit position and disable both buttons. Successful button or Shift+J clearing shows “This clear-target visit return position cleared” with an Undo clear button beside it. Undo restores only the last cleared position without navigating or changing drafts/playback or existing history. It works with shortcuts off, disables without a valid backup or while busy, and hides after success. Successful Undo clear shows “This clear-target visit return position restored” with its target until clearing, establishing a new return point, successfully returning or reloading the Session/frame list/page. A new return point or Session/frame-list/page reload discards the backup. The button works with shortcuts off and disables without a valid position or while busy. Keep the shown frame, all unsaved drafts, playback, review settings and every existing clear/return/deletion history. The shortcut is ignored in note/search/native/custom/composed/active editors, during IME, with Ctrl/Alt/Meta, repeated/handled/hidden events, dialogs, shortcuts off or without a valid position/while busy. A later successful different-frame target visit can create a new return point.",bookmarkVisitClearJumpReturn:"Return before this clear-target visit",shortcutHelpVisitClearJumpReturn:"After visiting a target-visit return Undo clear / Redo clear target, press J outside editors or use Return before this clear-target visit to pause and replay the last fully shown origin. Keep both frames’ drafts, review settings and all existing clear/return/deletion history. One separate return point per page/Session; a later successful different-frame target visit replaces it, while same-frame/failed visits do not. Successful return consumes only this point; failure keeps it for retry. Disabled without a valid point or while busy; reload clears it. J ignores note/search/native/custom/composed/active editors, IME/keyCode 229, repeats/handled/hidden events, Ctrl/Alt/Meta, dialogs, opt-out and missing/busy return points. Shift+J uses the separate clear action. The button works with shortcuts off.",shortcutHelpTargetJumpClearTargets:"Target-visit return Undo clear / Redo clear each show their own target frame position / total and saved #index beside the button. They follow this visit-return clear history, not the shown frame or bookmark filters. Known blocked targets keep their identity with an unavailable marker; missing/stale targets show No available target. Click a target number, or press Enter/Space on it, to pause and replay that exact saved snapshot while keeping both frames’ drafts, review settings and all existing clear/return/deletion history. No valid target or busy action disables the jump. Failed jumps keep the shown frame/editor and allow retry; stale Session/snapshot replies are rejected. Navigation does not restore, clear, consume or replace any return position or undo/redo eligibility. Undo follows the cleared notice visibility; Redo stays visible and disables when unavailable. No notes are shown.",shortcutHelpRedoClearTargetJumpPosition:"Press Shift+H outside editors or use the target-visit return Redo clear button to redo clearing only the just-restored position. The button works with shortcuts off and disables without an eligible restored position or while busy. Success shows “This target-jump return position cleared”; H can restore the same position again. Keep the shown frame, unsaved drafts, playback, review settings and all existing clear/return/deletion history. The shortcut is ignored in editors, during IME, with Ctrl/Alt/Meta, shortcuts off or without an eligible restored position/while busy.",shortcutHelpUndoClearTargetJumpPosition:"Press H outside editors to undo clearing only this target-jump return position. Success shows “This target-jump return position restored” with its target. Keep the shown frame, unsaved drafts, playback, review settings and all existing clear/return/deletion history. Ignored in note/search/native/custom/composed editors, during IME/keyCode 229, with modifiers, repeats/handled/hidden events, dialogs, shortcuts off or without an available backup/while busy. The Undo clear button still works with shortcuts off.",bookmarkTargetClearJumpReturnRestored:"This target-jump return position restored",bookmarkTargetClearJumpReturnCleared:"This target-jump return position cleared",bookmarkClearTargetJumpPosition:"Clear this target-jump return position",shortcutHelpClearTargetJumpReturn:"Press Shift+G outside editors or use Clear this target-jump return position to clear only the Return before this target jump position and disable both buttons. The button works with shortcuts off and disables without a valid position or while busy. Successful button or Shift+G clearing shows “This target-jump return position cleared” with Undo clear. Undo restores only the last cleared position without navigating or changing drafts/playback or existing history. It works with shortcuts off; unavailable/busy undo is disabled and successful undo hides it. Successful Undo clear shows “This target-jump return position restored” with its target. A new return point or Session reload discards the backup. Keep the shown frame, all unsaved drafts, playback, review settings and all existing clear/return/deletion history. The shortcut is ignored in editors, during IME, with Ctrl/Alt/Meta, shortcuts off or without a valid position/while busy. A later successful different-frame target visit can create a new return point.",bookmarkTargetClearJumpReturn:"Return before this target jump",shortcutHelpTargetClearJumpReturn:"After jumping to an independent target-jump return Undo clear / Redo clear target, press G outside editors or use Return before this target jump to pause and replay the previously shown frame. Keep both frames’ drafts, review settings and all existing clear/return/deletion history. One separate return point per page/Session; successful return consumes it, failure allows retry. Disabled without a valid point or while busy; reload clears it. Later successful different-frame target jumps replace it; same-frame/failed jumps do not. G ignores note/search/native/composed editors, IME/keyCode 229, repeats/handled/hidden events, Ctrl/Alt/Meta, dialogs, opt-out and missing/busy return points. Shift+G uses the separate clear action. The button works with shortcuts off.",shortcutHelpTargetClearTargets:"Target-jump return Undo clear / Redo clear each show their own target frame position / total and saved #index beside the button. Targets follow this independent return history, not the shown frame or filters; temporarily blocked targets are marked unavailable. Missing/stale targets show No available target. Click a target number, or press Enter/Space on it, to pause and replay that exact saved frame while preserving each frame’s drafts, filters and all independent/original return/clear/deletion history. Missing/busy targets disable the jump. Failed jumps keep the shown frame/editor and allow retry; stale Session/snapshot replies are rejected. No notes are shown.",shortcutHelpRedoClearTargetPosition:"Press Shift+Y outside editors or use the target-jump return Redo clear button to redo clearing only the just-restored position. The button works with shortcuts off and disables without a valid just-restored position or while busy. Success shows “Target-jump return position cleared”; Y can restore it again. Keep the shown frame, unsaved drafts, playback and original clear history. Ignored in editors, during IME, with Ctrl/Alt/Meta, shortcuts off or without a valid just-restored position/while busy. Ctrl+Y keeps redoing bookmark deletion.",shortcutHelpUndoClearTargetPosition:"Press Y outside editors to undo clearing only the target-jump return position. Success shows “Target-jump return position restored” with its target. Keep the shown frame, drafts, playback and original clear history. Ignored in editors, during IME, with modifiers, shortcuts off or without an available backup/while busy. The Undo clear button still works with shortcuts off. Ctrl+Y keeps redoing bookmark deletion.",bookmarkClearTargetPositionRestored:"Target-jump return position restored",bookmarkClearTargetPositionCleared:"Target-jump return position cleared",bookmarkClearTargetPosition:"Clear target-jump return position",shortcutHelpClearTargetPosition:"Use Shift+T outside editors or the Clear target-jump return position button to clear only the Return before clear-target jump position and disable both buttons. Success shows “Target-jump return position cleared” with Undo clear. Successful Undo clear shows “Target-jump return position restored” with the target. Undo restores only this last cleared position without navigating or changing drafts/playback or original clear history. It works with shortcuts off; unavailable/busy undo is disabled. A new independent return position or Session reload discards the backup. Keep the shown frame, all unsaved drafts, playback, review settings and original clear history. The button works with shortcuts off; unavailable/busy actions are disabled. The shortcut is ignored in editors or during IME.",bookmarkClearTargetReturn:"Return before clear-target jump",shortcutHelpClearTargetReturn:"Press T outside editors or use the button after a successful Undo clear / Redo clear target jump to pause and return to the previously shown frame. Keep drafts, review settings and all original clear history. One separate return position per page/Session; success consumes it, failure allows retry. Disabled without a position or while busy; reload clears it. T is ignored in note/search editors, during IME, with modifiers or shortcuts off.",shortcutHelpClearTargets:"Undo clear / Redo clear show their own target frame position / total and saved #index beside each button. Targets follow the return history, not the shown frame or filters; temporarily blocked targets are marked unavailable. Click a target frame number, or press Enter/Space on it, to pause and jump to that exact snapshot while keeping drafts and review settings. Missing/busy targets are disabled. This only navigates; it does not restore, clear or replace return history. No notes are shown.",bookmarkHistoryRedoClear:"Redo clear",shortcutHelpRedoClear:"Shift+U or the Redo clear button clears only the just-restored return position again and shows Return position cleared. The button works with shortcuts off and disables without available restored history or while busy. Keep the shown frame, unsaved notes, playback and review settings; U can restore it again. The shortcut is ignored in editors, during IME, with shortcuts off or without available restored history/while busy.",shortcutHelpUndoClear:"Press U outside editors to restore the last cleared return position, keeping the shown frame, unsaved notes, playback and review settings. Success shows Return position restored with the target. Ignored during IME, with shortcuts off, or without an available position/while busy. The Undo clear button also works with shortcuts off.",bookmarkHistoryReturnRestored:"Return position restored",bookmarkHistoryUndoClear:"Undo clear",bookmarkHistoryReturnCleared:"Return position cleared",bookmarkHistoryClearReturn:"Clear return position",shortcutHelpClearReturn:"Use Shift+R outside editors or the Clear return position button to disable Return to previous frame. Keep the shown frame, unsaved notes, playback and review settings. The button works with shortcuts off; unavailable/busy actions are disabled. Successful clearing shows “Return position cleared” with Undo clear. Successful Undo clear shows “Return position restored” with the target frame. It restores only the last cleared position without navigation or changing drafts/playback; a new return position or Session reload discards it. The shortcut is ignored in editors or during IME.",bookmarkHistoryReturn:"Return to previous frame",shortcutHelpHistoryReturn:"Press R outside editors, or use Return to previous frame, after a successful target jump. Pause and return to the previously shown frame, keeping drafts and review settings. One return position per page/Session; success consumes it, failure allows retry. Disabled without a position or while busy.",bookmarkHistoryJump:"Pause and jump to target frame",bookmarkHistoryTarget:"Target",bookmarkHistoryEmpty:"No available target",bookmarkHistoryBlocked:"Temporarily unavailable",bookmarkUndoDelete:"Undo deletion",bookmarkRedoDelete:"Redo deletion",bookmarkHistoryHelp:"Undo/Redo deletion buttons work with keyboard shortcuts off. Unavailable history and busy actions are disabled. History stays in this page’s current Session; refresh clears it. Click the target frame number to pause and jump there, keeping unsaved notes and filters. No target or busy action disables the jump. Saved tags are shown; notes stay hidden.",shortcutHelpRedoBookmark:"Pause and confirm redoing the last restored bookmark’s deletion. Cancel keeps redo available; newer saved edits clear it. Keep unsaved drafts. Ctrl+Y, Ctrl+Shift+Z and the Redo deletion button use the same confirmation; the button is disabled when unavailable. Click its target frame number to pause and jump, keeping drafts and filters; unavailable targets are disabled. Saved tags appear without notes.",bookmarkRedoConfirm:"Redo removal of the restored bookmark for frame {frame} / {total}, including its saved note and tags? Unsaved drafts stay in this page.",bookmarkRestored:"Bookmark restored",bookmarkRestoreKept:"Existing bookmark kept",shortcutHelpUndoBookmark:"Pause and restore the last successfully deleted bookmark’s saved note and tags in this Session. One undo per page; refresh or Session change clears it. Keep drafts and newer bookmarks. The Undo deletion button does the same and is disabled when unavailable. Click its target frame number to pause and jump, keeping drafts and filters; unavailable targets are disabled. Saved tags appear without notes.",bookmarkDeleteTitle:"Remove saved bookmark?",bookmarkDeleteCancel:"Cancel",bookmarkDeleteAccept:"Remove bookmark",shortcutHelpDeleteBookmark:"Pause and ask before removing the shown frame’s saved bookmark, including saved note/tags. Cancel keeps it; unsaved drafts stay in this page. Use Shift+D if Shift+Delete is intercepted.",bookmarkDeleteConfirm:"Remove the saved bookmark for displayed frame {frame} / {total}, including its saved note and tags? Unsaved drafts stay in this page.",shortcutHelpGeneralize:"Pause and save the shown frame as a general bookmark: clear saved tags, keep the saved note and unsaved drafts.",shortcutHelpQuickTags:"Shift+1: suspected ID switch · Shift+2: occlusion · Shift+3: object crossing. Pause and save the shown frame, adding the tag while keeping saved notes/other tags and unsaved drafts.",shortcutHelpQuickMark:"Pause and save a general bookmark for the shown frame. Keep existing saved notes/tags and unsaved drafts; no editor focus change.",shortcutHelpBookmarkEdges:"Pause and jump to the first / last bookmark matching the current tag and search filters.",shortcutHelpClearQuery:"Clear bookmark search text, keeping the tag filter, focus and playback state.",shortcutHelpAllTags:"Show all tags, keeping search text, focus and playback state.",shortcutHelpTagFilters:"1: suspected ID switch · 2: occlusion · 3: object crossing · 4: general bookmark (no tags). Keep search text, focus and playback state.",shortcutHelpClearFilters:"Clear search and tag filters, show all bookmarks and focus search; keep saved notes.",shortcutHelpSearchEscape:"Leave bookmark search for the displayed replay, keeping query and tag filters; pause replay.",bookmarkSearchShortcutHelp:"With Keyboard shortcuts enabled: Esc returns to the displayed replay, keeping query and tag filters. Ignored during IME composition.",shortcutHelpSearch:"Focus and scroll to bookmark search, keeping its text and playback state.",shortcutHelpOverlay:"Toggle tracking boxes and Object IDs without changing playback.",shortcutHelpLoopJump:"Pause and jump to the configured A / B endpoint. Requires a valid interval; looping may be off.",shortcutHelpPages:"Pause and jump back / forward 10 saved frames from the shown frame. Clamp to the full Session’s ends; ignore filters and A/B.",shortcutHelpEdges:"Pause and jump to the first / last saved frame in the full Session, regardless of filters or A/B.",shortcutHelpSpeedReset:"Reset speed to 1×; keeps replay playing or paused.",shortcutHelpSpeed:"Increase / decrease speed: 0.25×, 0.5×, 1×, 2×. Keeps replay playing or paused; stops at either limit.",shortcutHelpBookmarksTitle:'Bookmarks',shortcutHelpOpen:"Shortcut help (?)",shortcutHelpTitle:"Keyboard shortcut help",shortcutHelpClose:"Close",shortcutHelpIntro:"Opening help pauses replay. Close it, then press Space to continue.",shortcutHelpEnabled:"Keyboard shortcuts are enabled.",shortcutHelpDisabled:"Keyboard shortcuts are disabled. The help button remains available.",shortcutHelpPlayback:"Playback and A/B loop",shortcutHelpNotes:"Notes",shortcutHelpSpaceKey:"Space",shortcutHelpSpace:"Play / pause saved-frame replay.",shortcutHelpFrames:"Pause and step one saved frame across the full Session.",shortcutHelpBounds:"Set A / B from the last fully displayed frame; pause replay.",shortcutHelpLoop:"Toggle A/B looping and pause; press Play to resume.",shortcutHelpBookmarks:"Previous / next matching bookmark using the current filters.",shortcutHelpMark:"Pause and focus the shown frame’s bookmark note.",shortcutHelpSave:"Save this frame’s tags and note, only from the note field.",shortcutHelpEscape:"Leave the note for replay, keeping unsaved edits.",shortcutHelpEnter:"Insert a new line in the note.",shortcutHelpScope:"? toggles this panel outside input fields; Esc also closes the panel. Note and search typing never opens help. IME composition does not trigger shortcuts. Ctrl+Enter saves only from the note; Esc returns from the note or bookmark search.",bookmarkSaveShortcutHelp:'With Keyboard shortcuts enabled: Ctrl+Enter saves this frame’s bookmark and note from the note field only. Enter adds a new line. Esc returns to replay with unsaved edits kept. Ignored during IME composition.',loopShortcutHelp:'A/B: set start/end to the shown frame · L: toggle loop. These actions pause playback.',bookmarkShortcuts:'Keyboard shortcuts',bookmarkShortcutHelp:'Press ? for shortcut help. Replay keys are inactive in input fields or during IME composition.',bookmarkReplayNav:'Replay bookmark navigation',bookmarkListNav:'Filtered bookmark navigation',bookmarkPrevious:'Previous bookmark',bookmarkNext:'Next bookmark',bookmarkNavCurrent:'Bookmark',bookmarkNavOutside:'Shown frame is outside the filtered bookmarks',bookmarkNavStart:'Next opens the first matching bookmark',bookmarkNavLoading:'Loading bookmark',bookmarkFind:'Find bookmarks',bookmarkFilterTag:'Tag',bookmarkFilterAll:'All tags',bookmarkSearch:'Search saved notes',bookmarkFilterClear:'Clear filters',bookmarkFilterHelp:'Tag and note keyword must both match. Search is literal and ignores English case.',bookmarkFilterShown:'Shown',bookmarkFilterNoMatch:'No matching bookmarks.',bookmarkBackup:'JSON backup / restore',bookmarkBackupNote:'Export saved bookmarks only; save drafts first. This JSON contains notes, not images. Restore requires the original Session and frames.',bookmarkExport:'Export JSON',bookmarkImportFile:'Local bookmark JSON (up to 1 MiB)',bookmarkImportPolicy:'Same-frame conflicts',bookmarkImportKeep:'Keep local content',bookmarkImportOverwrite:'Use imported content',bookmarkImportPreview:'Preview import',bookmarkImportApply:'Apply import',bookmarkImportChoose:'Choose a local JSON file, then preview before applying.',bookmarkFileReading:'Reading local JSON…',bookmarkFileReady:'File ready. Preview before applying.',bookmarkFileLimit:'Choose a nonempty JSON file up to 1 MiB.',bookmarkFileReadFailed:'Could not read this local file. Select it again.',bookmarkImportChecking:'Checking import…',bookmarkImportPreviewed:'Preview only · not saved',bookmarkImportApplying:'Applying import…',bookmarkImportDone:'Import complete',bookmarkImportFailed:'Import did not complete. Check the file and preview again.',bookmarkImportAdded:'Add',bookmarkImportUpdated:'Update',bookmarkImportUnchanged:'Unchanged',bookmarkImportConflicts:'Same-frame differences',bookmarkImportIncoming:'Incoming',bookmarksTitle:'Frame bookmarks & notes',bookmarksNote:'Mark a shown frame to pause playback, add tags and a note, then Save. Saved bookmarks stay in this local Session.',bookmarkMark:'Mark shown frame',bookmarkTags:'Review tags (optional)',bookmarkIdSwitch:'Suspected ID switch',bookmarkOcclusion:'Occlusion',bookmarkCrossing:'Object crossing',bookmarkNote:'Note (up to 1000 characters)',bookmarkSave:'Save frame bookmark',bookmarkDelete:'Remove frame bookmark',bookmarksLoading:'Loading local bookmarks…',bookmarksEmpty:'No saved bookmarks in this Session.',bookmarksCount:'Saved bookmarks',bookmarksFailed:'Could not load local bookmarks. Refresh to retry.',bookmarkChoose:'Replay a frame to add or edit its bookmark.',bookmarkNew:'No saved bookmark',bookmarkSaved:'Bookmark saved',bookmarkRemoved:'Bookmark removed',bookmarkDraft:'Unsaved changes',bookmarkInvalid:'Use up to 1000 text characters; control characters are not allowed.',bookmarkSaving:'Saving bookmark…',bookmarkGeneral:'General bookmark',loopTitle:'A/B loop',loopEnable:'Loop A–B',loopStart:'A · Start frame',loopEnd:'B · End frame',loopSetStart:'Set A to shown frame',loopSetEnd:'Set B to shown frame',loopUnavailable:'Save at least two frames to loop.',loopInvalid:'Choose whole-frame positions with A before B.',loopReady:'Loop enabled · Press Play to repeat',loopOff:'Loop off · Saved-frame positions, including both endpoints',replayPosition:'Playback progress',replayFrame:'Frame',seekTarget:'Jump to',seekCurrent:'Shown',seekRelease:'Release to seek',seekLoading:'Loading frame',replayNotShown:'No frame replayed',play:'Play',pause:'Pause',playbackSpeed:'Speed',playbackNote:'Saved-frame playback: 1× targets 5 frames/s; loading may slow it down.',playbackPlaying:'Playing',playbackPaused:'Paused',playbackEnded:'End of saved frames',playbackError:'Playback stopped after an error',previousFrame:'Previous frame',nextFrame:'Next frame',overlayToggle:'Tracking boxes and Object IDs',overlayLabel:'Tracking boxes and Object IDs',overlayOff:'Tracking overlay hidden.',overlayMissing:'Run tracking analysis, then replay an analysed frame to see IDs.',overlayUnanalysed:'This frame was not analysed. Use Replay analysed frames or run tracking again.',overlayMismatch:'Tracking result does not match this snapshot. Refresh and rerun analysis.',overlayLoading:'Loading saved image…',overlayEmpty:'No confirmed tracked detections in this frame.',overlayReady:'Tracked detections',replayTracked:'Replay analysed frames',title:'Session / Replay',language:'Language',subtitle:'Manually save completed AI result frames to local storage. No automatic camera recording; replay does not rerun inference.',sessions:'Sessions',label:'Label (optional)',create:'Create session',refresh:'Refresh',capture:'Save latest frame',scope:'Storage is opt-in (ENABLE_SESSION_STORAGE=1), localhost-only and limited to 20 sessions × 120 frames.',frames:'Saved frames',replay:'Replay selected frame',download:'Download exact snapshot ZIP',view:'Recorded RGB, depth & point cloud',rgb:'Aligned RGB',depth:'Depth preview',trend:'Temporal metadata trends',trendNote:'Frame-level depth median only: not tracked pixels, metric drift or motion-compensated geometry.',consistency:'Temporal depth consistency',consistencyNote:'Same-grid pixel comparison only. No motion compensation, calibrated distance accuracy or continuous video recording.',pair:'Saved pair',nativeMae:'Native MAE',normalizedMae:'Shape MAE',overlap:'Valid overlap',downloadReport:'Export temporal JSON',noPairs:'Save two compatible frames to compare.',skip:'Skipped incompatible pairs',warning:'Recorded depth is an AI estimate. Relative depth is not metres; no safety or accuracy certification.',disabled:'Enable local storage with ENABLE_SESSION_STORAGE=1 then restart the app.',saved:'Frame saved',created:'Session created',failed:'Request failed',tracking:'Semantic Object Tracking (offline)',trackingNote:'Manually analyse saved frames with YOLO Detect/Segment. CPU only. Object IDs are heuristic 2D associations, NOT identity or world-space trajectories.',trackBackend:'Association',trackBaseline:'Simple association',trackBotSort:'Roboflow BoT-SORT',trackWorkerMissing:'BoT-SORT is unavailable until the local worker is configured.',trackMode:'Mode',segment:'Instance segmentation',detect:'Bounding-box regions',trackRun:'Analyse saved frames',trackDownload:'Export tracking JSON',trackEmpty:'Run an analysis to see Object IDs, depth and camera-space XYZ history.',trackCount:'Objects',trackFrame:'Frame',trackClass:'Class',trackDepth:'Depth',trackXYZ:'Camera XYZ',trackWarning:'Object association may fail when objects cross or disappear; XYZ is in unverified native depth units.',trackRunning:'Tracking analysis running on saved frames…',trackDone:'Tracking analysis completed'},
  'zh-TW':{shortcutHelpVisitHistoryClearTargets:"此次目標跳轉返回位置的「復原清除／重做清除」按鈕旁各自顯示「影格位置／總格數 · #保存索引」，依這一層返回位置的清除歷史更新，不受目前影格或書籤篩選影響。已知但暫時受阻的目標保留編號並標示暫時不可用；無有效或過期目標顯示「目前無可操作目標」。復原列跟隨清除提示顯示，重做列保持顯示並在不可用時停用。各按鈕關聯自己的即時摘要，不顯示備註。顯示更新不跳格、不修改草稿、播放、檢查設定或既有清除／返回／刪除歷史。 點擊目標影格編號，或在其按鈕上按 Enter／空白鍵，會暫停並回放精確保存影格，保留兩格草稿、檢查設定與全部既有清除／返回／刪除歷史。無有效目標或操作中停用跳轉。讀取／雜湊／解碼失敗保留目前影格與編輯內容並可重試，過期 Session／世代回覆不顯示。跳轉不復原、清除、消耗或取代任何返回位置及復原／重做資格。關閉快捷鍵仍可使用目標按鈕。",shortcutHelpRedoClearVisitHistoryPosition:"在非編輯欄位按 Shift＋P，或按此次目標跳轉返回位置的「重做清除」按鈕，只重做清除剛復原的此次目標跳轉返回位置。成功顯示「已清除此次目標跳轉返回位置」並停用返回，P 或「復原清除」可再次恢復同一位置。保留目前影格、未儲存草稿、播放（含待完成呈現）、檢查設定與全部既有清除／返回／刪除歷史。支援 Shift＋p／Shift＋P；備註／搜尋／原生與自訂編輯欄位（含 composed path 與目前編輯焦點）、中文組字／keyCode 229、Ctrl／Alt／Meta、長按／已處理／背景事件、對話框、關閉快捷鍵及無剛復原的有效位置／操作中均不觸發、不攔截原生輸入。新建、已消耗或過期位置不適用。不新增請求或寫入。 「重做清除」按鈕在關閉快捷鍵時仍可使用，無剛復原的有效位置或操作中自動停用；重做成功後停用，直到再次成功復原清除。",shortcutHelpUndoClearVisitHistoryPosition:"在非編輯欄位按 P，只復原剛清除的此次目標跳轉返回位置，成功顯示「已恢復此次目標跳轉返回位置」及目標。保留目前影格、未儲存草稿、播放、檢查設定與全部既有清除／返回／刪除歷史。支援小寫 p 或未搭配 Shift 的 Caps Lock 大寫 P；備註／搜尋／原生與自訂編輯欄位（含 composed path 與目前編輯焦點）、中文組字／keyCode 229、Ctrl／Alt／Meta／Shift、長按／已處理／背景事件、對話框、關閉快捷鍵及無有效備份／操作中均不觸發、不攔截原生輸入。關閉快捷鍵仍可使用「復原清除」按鈕。",bookmarkVisitClearHistoryReturnRestored:"已恢復此次目標跳轉返回位置",bookmarkVisitClearHistoryReturnCleared:"已清除此次目標跳轉返回位置",bookmarkClearVisitHistoryPosition:"清除此次目標跳轉返回位置",shortcutHelpClearVisitHistoryReturn:"在非編輯欄位按 Shift＋N，或按「清除此次目標跳轉返回位置」，只清除「返回此次目標跳轉前影格」的位置並停用兩個按鈕。按鈕或 Shift＋N 成功清除後顯示「已清除此次目標跳轉返回位置」，直到復原清除、建立新返回位置或重新載入 Session／影格清單／頁面；無可用位置或受阻操作不產生成功提示。關閉快捷鍵仍可用按鈕；無有效位置或操作中停用。保留目前影格、各格未儲存草稿、播放（含待完成呈現）、檢查設定與全部既有清除／返回／刪除歷史。快捷鍵在備註／搜尋／原生與自訂編輯欄位（含 composed path 與目前編輯焦點）、中文組字／keyCode 229、Ctrl／Alt／Meta、長按／已處理／背景事件、對話框、關閉快捷鍵或無有效位置／操作中不觸發。之後成功跳到不同目標可建立新返回位置。只清除本頁記憶體，不新增請求或寫入。 成功清除會在提示旁顯示「復原清除」按鈕，只恢復剛清除的位置，不跳格、不修改草稿、播放或既有歷史；關閉快捷鍵仍可使用，無有效備份或操作中停用，成功後隱藏。建立新返回位置、成功返回或重新載入 Session／影格清單／頁面會捨棄備份；同格／失敗目標跳轉保留備份。 成功復原後在即時摘要顯示「已恢復此次目標跳轉返回位置」及目標。一般跳格、檢查設定／語言變更與返回失敗保留提示；再次清除、建立新返回位置、成功返回或重新載入 Session／影格清單／頁面會移除。無有效備份或受阻的復原不產生成功提示。",bookmarkVisitClearHistoryReturn:"返回此次目標跳轉前影格",shortcutHelpVisitClearHistoryReturn:"查看這次目標跳轉返回位置的「復原清除／重做清除」目標後，在非編輯欄位按 N，或按「返回此次目標跳轉前影格」可暫停並回放跳轉前最後完整顯示的影格。保留兩格草稿、檢查設定與全部既有清除／返回／刪除歷史。本頁目前 Session 另存一筆返回位置；後續成功跳到不同目標會取代，同格／失敗跳轉不取代。成功返回只消耗這筆，失敗保留並可重試。無有效位置或操作受阻／進行中停用，重新載入 Session／影格清單／頁面會清除；沿用精確 Session／世代／快照驗證拒絕過期回覆。N 在備註／搜尋／原生與自訂編輯欄位（含 composed path 與目前編輯焦點）、中文組字／keyCode 229、長按／已處理／背景事件、Ctrl／Alt／Meta、對話框、關閉快捷鍵或無有效位置／操作中不觸發；Shift＋N 使用獨立清除動作；關閉快捷鍵仍可使用按鈕。",shortcutHelpVisitReturnClearTargets:"這次目標跳轉返回位置的「復原清除／重做清除」各自在按鈕旁顯示目標影格位置／總數與保存索引 #編號。目標跟隨這筆返回位置的清除歷史，不跟隨目前影格或書籤篩選；暫時受阻仍保留編號並標示暫不可操作，無有效／過期目標顯示「目前無可操作目標」。復原摘要隨清除提示顯示，重做維持顯示、不可用時停用。點擊目標編號，或在編號上按 Enter／空白鍵，會暫停並回放該保存快照，保留各格草稿、檢查設定與全部既有清除／返回／刪除歷史。無有效目標或操作中停用跳轉；失敗保留目前影格與編輯內容、可重試，拒絕過期 Session／快照回覆。跳轉不復原、不清除、不消耗或取代任何返回位置或復原／重做資格，不顯示備註。",shortcutHelpRedoClearVisitJumpPosition:"在非編輯欄位按 Shift＋K，或使用這次目標跳轉返回位置的「重做清除」按鈕，只重做清除剛復原的位置。關閉快捷鍵仍可用按鈕；沒有剛復原的有效位置或操作中停用。成功顯示「已清除這次目標跳轉返回位置」，K 可再次恢復同一位置。保留目前影格、未儲存草稿、播放、檢查設定與全部既有清除／返回／刪除歷史。備註／搜尋／原生與自訂編輯欄位（含 composed path 與目前編輯焦點）、中文組字／keyCode 229、Ctrl／Alt／Meta、長按／已處理／背景事件、對話框、關閉快捷鍵或無剛復原有效位置／操作中不觸發。",shortcutHelpUndoClearVisitJumpPosition:"在非編輯欄位按 K，只復原清除這次目標跳轉返回位置；成功顯示「已恢復這次目標跳轉返回位置」與目標。保留目前影格、未儲存草稿、播放、檢查設定與全部既有清除／返回／刪除歷史。備註／搜尋／原生與自訂編輯欄位（含 composed path 與目前編輯焦點）、中文組字／keyCode 229、搭配修飾鍵、長按／已處理／背景事件、對話框、關閉快捷鍵或無有效備份／操作中不觸發。「復原清除」按鈕在關閉快捷鍵時仍可用。",bookmarkVisitClearJumpReturnRestored:"已恢復這次目標跳轉返回位置",bookmarkVisitClearJumpReturnCleared:"已清除這次目標跳轉返回位置",bookmarkClearVisitJumpPosition:"清除這次目標跳轉返回位置",shortcutHelpClearVisitClearJumpReturn:"在非編輯欄位按 Shift＋J，或使用「清除這次目標跳轉返回位置」，只清除「返回這次目標跳轉前影格」的位置並停用兩個按鈕。按鈕或 Shift＋J 成功清除後顯示「已清除這次目標跳轉返回位置」，旁邊提供「復原清除」。只恢復剛清除的位置，不跳格、不改草稿／播放或既有歷史；關閉快捷鍵仍可復原，無有效備份或操作中停用，成功後隱藏並顯示「已恢復這次目標跳轉返回位置」與目標影格；清除、建立新返回位置、成功返回或重新載入 Session／影格清單／頁面後重設。建立新返回位置或重新載入 Session／影格清單／頁面會丟棄備份。關閉快捷鍵仍可使用按鈕；無有效位置或操作中停用。保留目前影格、各格未儲存草稿、播放、檢查設定與全部既有清除／返回／刪除歷史。快捷鍵在備註／搜尋／原生與自訂編輯欄位（含 composed path 與目前編輯焦點）、中文組字、Ctrl／Alt／Meta、長按／已處理／背景事件、對話框、關閉快捷鍵或無有效位置／操作中不觸發。之後成功跳到不同目標可建立新的返回位置。",bookmarkVisitClearJumpReturn:"返回這次目標跳轉前影格",shortcutHelpVisitClearJumpReturn:"查看本次目標跳轉返回位置的「復原清除／重做清除」目標後，在非編輯欄位按 J，或按「返回這次目標跳轉前影格」，暫停並回放跳轉前最後完整顯示的影格。保留兩格草稿、檢查設定與全部既有清除／返回／刪除歷史。本頁目前 Session 另存一筆返回位置；後續成功跳到不同目標會取代，同格／失敗跳轉不取代。成功返回只消耗這筆，失敗保留並可重試；無有效位置或操作中停用，重新載入會清除。J 在備註／搜尋／原生與自訂編輯欄位（含 composed path 與目前編輯焦點）、中文組字／keyCode 229、長按／已處理／背景事件、Ctrl／Alt／Meta、對話框、關閉快捷鍵或無有效位置／操作中不觸發；Shift＋J 使用獨立清除動作，關閉快捷鍵仍可用按鈕。",shortcutHelpTargetJumpClearTargets:"本次目標跳轉返回位置的「復原清除／重做清除」旁各自顯示目標影格位置／總格數與保存索引 #編號，依這一層返回位置的清除歷史更新，不跟著目前影格或書籤篩選變動。已知但暫時受阻的目標會加上不可用標記；無有效目標時顯示「目前無可操作目標」。點擊目標編號或在其上按 Enter／空白鍵，暫停並回放精確保存影格，保留兩格草稿、檢查設定與全部既有清除／返回／刪除歷史。無有效目標或操作中停用跳轉；失敗保留目前影格／編輯內容並可重試，拒絕過期 Session／快照回覆。跳轉不復原、清除、消耗或取代任何返回位置及復原／重做資格。「復原清除」列跟隨清除提示顯示；「重做清除」列保持顯示，無可用目標時停用。摘要不顯示備註。",shortcutHelpRedoClearTargetJumpPosition:"在非編輯欄位按 Shift＋H，或按本次目標跳轉返回位置的「重做清除」，只重做清除剛復原的位置。關閉快捷鍵仍可用按鈕；無剛復原的有效位置或操作中自動停用。成功顯示「已清除本次目標跳轉返回位置」；H 可再次恢復同一位置。保留目前影格、未儲存草稿、播放、檢查設定與全部既有清除／返回／刪除歷史。快捷鍵在輸入欄位、中文組字、Ctrl／Alt／Meta、關閉快捷鍵或無剛復原的有效位置／操作中不觸發。",shortcutHelpUndoClearTargetJumpPosition:"在非編輯欄位按 H，只復原清除本次目標跳轉返回位置。成功顯示「已恢復本次目標跳轉返回位置」及目標。保留目前影格、未儲存草稿、播放、檢查設定與全部既有清除／返回／刪除歷史。備註／搜尋／原生與自訂編輯欄位（含 composed path）、中文組字／keyCode 229、修飾鍵、長按／已處理／背景事件、對話框、關閉快捷鍵或無可用備份／操作中不觸發。關閉快捷鍵仍可用「復原清除」按鈕。",bookmarkTargetClearJumpReturnRestored:"已恢復本次目標跳轉返回位置",bookmarkTargetClearJumpReturnCleared:"已清除本次目標跳轉返回位置",bookmarkClearTargetJumpPosition:"清除本次目標跳轉返回位置",shortcutHelpClearTargetJumpReturn:"在非編輯欄位按 Shift＋G，或按「清除本次目標跳轉返回位置」，只清除「返回本次目標跳轉前影格」的位置並停用兩個按鈕。關閉快捷鍵仍可用按鈕；無有效位置或操作中自動停用。按鈕或 Shift＋G 清除成功後顯示「已清除本次目標跳轉返回位置」及「復原清除」。復原只恢復最近清除的位置，不跳格、不改動草稿／播放或既有歷史。關閉快捷鍵仍可用；無可用備份或操作中停用，成功復原後隱藏。成功復原後顯示「已恢復本次目標跳轉返回位置」及其目標。建立新返回位置或重新載入 Session 會丟棄備份。保留目前影格、全部未儲存草稿、播放、檢查設定與全部既有清除／返回／刪除歷史。快捷鍵在輸入欄位、中文組字、Ctrl／Alt／Meta、關閉快捷鍵、無有效位置或操作中不觸發。之後成功跳到不同目標仍可建立新的返回位置。",bookmarkTargetClearJumpReturn:'返回本次目標跳轉前影格',shortcutHelpTargetClearJumpReturn:"查看目標跳轉返回位置的「復原清除／重做清除」目標後，在非編輯欄位按 G，或按「返回本次目標跳轉前影格」，暫停並回放跳轉前顯示的影格，保留兩格草稿、檢查設定與全部既有清除／返回／刪除歷史。本頁目前 Session 另存一筆返回位置；成功返回後消耗，失敗可重試。沒有有效位置或操作中停用，重新載入後清除；後續成功跳到不同目標會取代，同格／失敗跳轉不取代。G 在備註／搜尋／原生與 composed 編輯欄、中文組字／keyCode 229、長按／已處理／背景事件、Ctrl／Alt／Meta、對話框、關閉快捷鍵或無有效位置／操作中不觸發。Shift＋G 使用獨立清除動作。關閉快捷鍵仍可點按鈕。",shortcutHelpTargetClearTargets:"目標跳轉返回位置的「復原清除／重做清除」各自旁邊顯示目標在 Session 中第幾格／總格數及保存索引 #編號。跟隨此獨立返回紀錄，不受目前影格或篩選影響；暫時受阻標示無法操作，沒有有效目標顯示「目前無可操作目標」。點目標編號或在其上按 Enter／空白鍵，暫停並回放該精確保存影格，保留各格草稿、篩選及全部獨立／原有返回／清除／刪除歷史。無目標或操作中停用跳轉；失敗保留目前影格／編輯內容並可重試，拒絕過期 Session／快照回覆，不顯示備註。",shortcutHelpRedoClearTargetPosition:"在非編輯欄位按 Shift＋Y，或點目標跳轉返回位置的「重做清除」，只重做清除剛復原的位置。關閉快捷鍵仍可用按鈕；沒有有效剛復原位置或操作中自動停用；成功顯示「已清除目標跳轉返回位置」，可再按 Y 復原。保留目前影格、未儲存草稿、播放與原有清除歷史。輸入欄位、中文組字、Ctrl／Alt／Meta、關閉快捷鍵、無有效剛復原位置或操作中不觸發。Ctrl＋Y 維持重做書籤刪除。",shortcutHelpUndoClearTargetPosition:"在非編輯欄位按 Y，只復原清除目標跳轉返回位置；成功顯示「已恢復目標跳轉返回位置」及目標影格。保留目前影格、草稿、播放與原有清除歷史。輸入欄位、中文組字、修飾鍵、關閉快捷鍵、無可用備份或操作中不觸發；關閉快捷鍵仍可點「復原清除」。Ctrl＋Y 維持重做書籤刪除。",bookmarkClearTargetPositionRestored:'已恢復目標跳轉返回位置',bookmarkClearTargetPositionCleared:'已清除目標跳轉返回位置',bookmarkClearTargetPosition:'清除目標跳轉返回位置',shortcutHelpClearTargetPosition:"在非編輯欄位按 Shift＋T，或按「清除目標跳轉返回位置」，只清除此獨立返回位置並停用兩個按鈕，成功顯示「已清除目標跳轉返回位置」與「復原清除」。成功復原顯示「已恢復目標跳轉返回位置」及目標影格。復原只恢復最近清除此位置，不跳格、不改草稿／播放或原有清除歷史；關閉快捷鍵仍可用，不可用或操作中停用。新獨立返回位置或重新載入 Session 會丟棄備份。保留目前影格、全部未儲存草稿、播放、檢查設定與原有清除歷史。關閉快捷鍵仍可用按鈕；無有效位置或操作中停用。快捷鍵在輸入欄位或中文組字時不生效。",bookmarkClearTargetReturn:"返回清除目標跳轉前影格",shortcutHelpClearTargetReturn:"成功跳到復原清除／重做清除的目標後，在非編輯欄位按 T 或點按鈕，暫停並返回原本顯示的影格，保留草稿、檢查設定及全部原有清除歷史。本頁目前 Session 另存一個返回位置；成功後消耗、失敗可重試。無位置／操作中停用，重新載入後清除。備註／搜尋輸入、中文組字、修飾鍵或停用快捷鍵時，T 不觸發。",shortcutHelpClearTargets:"復原清除／重做清除各自旁邊顯示目標在 Session 中第幾格／總格數及保存索引 #編號。跟隨返回紀錄，不受目前影格或篩選影響；暫時受阻時標示無法操作。點擊目標編號或在其上按 Enter／空白鍵，暫停並跳到精確快照，保留草稿與檢查設定；無目標／操作中停用。只跳轉，不復原、不清除或改寫返回紀錄，也不顯示備註。",bookmarkHistoryRedoClear:"重做清除",shortcutHelpRedoClear:"按 Shift＋U 或點「重做清除」，只重做清除剛復原的返回位置，顯示「已清除返回位置」。關閉快捷鍵仍可點按鈕；沒有可用復原紀錄或操作中自動停用。保留目前影格、未儲存備註、播放與檢查設定，可再按 U 復原。快捷鍵於輸入欄、中文組字、停用快捷鍵、沒有可用復原紀錄或操作中不觸發。",shortcutHelpUndoClear:"在非編輯欄位按 U 復原最近清除的返回位置，保留目前影格、未儲存備註、播放與檢查設定。成功顯示「已恢復返回位置」及目標。中文組字、關閉快捷鍵、無可用位置或操作中不觸發；「復原清除」按鈕在關閉快捷鍵時仍可使用。",bookmarkHistoryReturnRestored:"已恢復返回位置",bookmarkHistoryUndoClear:"復原清除",bookmarkHistoryReturnCleared:"已清除返回位置",bookmarkHistoryClearReturn:"清除返回位置",shortcutHelpClearReturn:"在非編輯欄位按 Shift＋R，或點「清除返回位置」，停用「返回跳轉前影格」。保留目前影格、未儲存備註、播放與檢查設定。關閉快捷鍵後按鈕仍可使用；無位置／操作中停用。清除成功後顯示「已清除返回位置」與「復原清除」。復原成功顯示「已恢復返回位置」及目標影格，只恢復最近清除的位置，不跳格、不改草稿或播放；新返回位置或重新載入 Session 會清除復原機會。輸入或中文組字時不觸發快捷鍵。",bookmarkHistoryReturn:"返回跳轉前影格",shortcutHelpHistoryReturn:"成功跳到復原／重做目標後，在非編輯欄位按 R，或點「返回跳轉前影格」，暫停並返回原本顯示的影格，保留草稿及檢查設定。本頁目前 Session 只保留一個返回位置；成功後清除，失敗可重試。無位置或操作中停用。",bookmarkHistoryJump:"暫停並跳到目標影格",bookmarkHistoryTarget:"目標",bookmarkHistoryEmpty:"目前無可操作目標",bookmarkHistoryBlocked:"暫不可操作",bookmarkUndoDelete:"復原刪除",bookmarkRedoDelete:"重做刪除",bookmarkHistoryHelp:"關閉鍵盤快捷鍵時仍可使用復原／重做刪除按鈕；沒有可用紀錄或操作中會停用。紀錄只暫存於本頁目前 Session，重新整理後清除。點擊按鈕旁的目標影格編號會暫停並跳轉，保留未儲存備註與篩選；無目標或操作中停用跳轉。顯示已存標籤，不顯示備註。",shortcutHelpRedoBookmark:"暫停並確認後重新刪除剛復原的書籤。取消仍可重做；另行保存變更會清除重做。保留未儲存草稿。Ctrl＋Y、Ctrl＋Shift＋Z 與「重做刪除」按鈕使用相同確認流程；無可用紀錄時停用按鈕。點擊旁邊的目標影格編號可暫停跳轉，保留草稿與篩選；無可用目標時停用。顯示已存標籤，不顯示備註。",bookmarkRedoConfirm:"要重新刪除剛復原的第 {frame}／{total} 格書籤（含已存備註與標籤）嗎？未儲存草稿仍留在本頁。",bookmarkRestored:"書籤已復原",bookmarkRestoreKept:"已保留現有書籤",shortcutHelpUndoBookmark:"暫停並復原本 Session 最近一次成功刪除書籤的已存備註與標籤。本頁只保留一筆；重新整理或切換 Session 後清除。保留草稿及新建書籤。「復原刪除」按鈕執行相同操作，無可用紀錄時停用。點擊旁邊的目標影格編號可暫停跳轉，保留草稿與篩選；無可用目標時停用。顯示已存標籤，不顯示備註。",bookmarkDeleteTitle:"移除已保存書籤？",bookmarkDeleteCancel:"取消",bookmarkDeleteAccept:"移除書籤",shortcutHelpDeleteBookmark:"暫停並確認後移除目前影格的已保存書籤（含備註與標籤）；取消會保留，未儲存草稿仍留在本頁；Shift＋Delete 被攔截時可改用 Shift＋D。",bookmarkDeleteConfirm:"要移除目前顯示第 {frame}／{total} 格的已保存書籤（含備註與標籤）嗎？未儲存草稿仍留在本頁。",shortcutHelpGeneralize:"暫停並將目前影格存成一般書籤：清除已保存標籤，保留已保存備註與未儲存草稿。",shortcutHelpQuickTags:"Shift＋1：疑似換 ID · Shift＋2：遮擋 · Shift＋3：物件交會。暫停並保存目前影格，加上標籤且保留已有備註、其他標籤與未儲存草稿。",shortcutHelpQuickMark:"暫停並將目前顯示影格存成一般書籤，保留已有備註／標籤與未儲存草稿，不移入編輯欄。",shortcutHelpBookmarkEdges:"暫停並跳到目前標籤與搜尋篩選的第一個／最後一個書籤。",shortcutHelpClearQuery:"只清除書籤搜尋文字，保留標籤篩選、焦點與播放狀態。",shortcutHelpAllTags:"切回全部標籤，保留搜尋文字、焦點與播放狀態。",shortcutHelpTagFilters:"1：疑似換 ID · 2：遮擋 · 3：物件交會 · 4：一般書籤（無標籤）。保留搜尋文字、焦點與播放狀態。",shortcutHelpClearFilters:"清除搜尋文字與標籤篩選，顯示全部書籤並移入搜尋欄，保留已儲存備註。",shortcutHelpSearchEscape:"離開書籤搜尋並回到已顯示的回放，保留搜尋文字與標籤條件，並暫停回放。",bookmarkSearchShortcutHelp:"快捷鍵開啟時，Esc 回到已顯示的回放，保留搜尋文字與標籤條件；中文選字時不生效。",shortcutHelpSearch:"將焦點移到書籤搜尋欄並捲動至該處，保留搜尋文字與播放狀態。",shortcutHelpOverlay:"切換追蹤框與 Object ID 疊圖顯示，維持目前播放或暫停狀態。",shortcutHelpLoopJump:"暫停並跳到已設定的 A／B 起點／終點；需有效區間，循環關閉時也可使用。",shortcutHelpPages:"暫停並從目前顯示影格往前／往後跳 10 格；到 Session 兩端停止，不受書籤篩選或 A／B 限制。",shortcutHelpEdges:"暫停並跳到整個 Session 的第一格／最後一格，不受書籤篩選或 A／B 限制。",shortcutHelpSpeedReset:"速度恢復為 1×，維持目前播放或暫停狀態。",shortcutHelpSpeed:"加速／減速：0.25×、0.5×、1×、2×；維持播放或暫停，到達上下限不循環。",shortcutHelpBookmarksTitle:'書籤操作',shortcutHelpOpen:"快捷鍵說明（?）",shortcutHelpTitle:"快捷鍵說明",shortcutHelpClose:"關閉",shortcutHelpIntro:"開啟說明會暫停回放；關閉後可按空白鍵繼續。",shortcutHelpEnabled:"鍵盤快捷鍵已開啟。",shortcutHelpDisabled:"鍵盤快捷鍵已停用，仍可使用說明按鈕查閱。",shortcutHelpPlayback:"播放與 A／B 循環",shortcutHelpNotes:"備註操作",shortcutHelpSpaceKey:"空白鍵",shortcutHelpSpace:"播放／暫停已保存影格。",shortcutHelpFrames:"暫停並逐格移動，範圍為整個 Session。",shortcutHelpBounds:"以目前完整顯示影格設定 A／B，並暫停回放。",shortcutHelpLoop:"切換 A／B 循環並暫停，按播放繼續。",shortcutHelpBookmarks:"依目前篩選跳到上一個／下一個符合的書籤。",shortcutHelpMark:"暫停並移到目前影格的書籤備註欄。",shortcutHelpSave:"儲存目前影格的標籤與備註，僅在備註欄生效。",shortcutHelpEscape:"離開備註欄回到回放，保留未儲存內容。",shortcutHelpEnter:"在備註欄換行。",shortcutHelpScope:"在非輸入欄位按 ? 開啟／關閉說明，面板內也可按 Esc 關閉。輸入備註或搜尋時不會開啟說明；中文選字不觸發快捷鍵。Ctrl＋Enter 僅在備註欄保存；Esc 可從備註或書籤搜尋回到回放。",bookmarkSaveShortcutHelp:'快捷鍵開啟時，在備註欄按 Ctrl＋Enter 儲存這格的書籤與備註；Enter 換行；Esc 回到回放並保留未儲存內容。中文選字時不生效。',loopShortcutHelp:'A／B：以目前顯示影格設定起點／終點；L：切換循環。操作會暫停播放。',bookmarkShortcuts:'鍵盤快捷鍵',bookmarkShortcutHelp:'按 ? 查閱快捷鍵說明。輸入欄位或中文選字時不啟用回放快捷鍵。',bookmarkReplayNav:'回放書籤跳轉',bookmarkListNav:'篩選書籤跳轉',bookmarkPrevious:'上一個書籤',bookmarkNext:'下一個書籤',bookmarkNavCurrent:'書籤',bookmarkNavOutside:'目前影格不在篩選書籤中',bookmarkNavStart:'按下一個前往第一個符合的書籤',bookmarkNavLoading:'正在載入書籤',bookmarkFind:'快速尋找書籤',bookmarkFilterTag:'標籤',bookmarkFilterAll:'全部標籤',bookmarkSearch:'搜尋已儲存的備註',bookmarkFilterClear:'清除條件',bookmarkFilterHelp:'標籤與備註關鍵字需同時符合；以字面文字比對，不分英文大小寫。',bookmarkFilterShown:'顯示',bookmarkFilterNoMatch:'沒有符合條件的書籤。',bookmarkBackup:'JSON 備份／還原',bookmarkBackupNote:'匯出只包含已儲存的書籤，草稿請先儲存。JSON 含備註、不含影像；還原時仍需原本的 Session 與影格。',bookmarkExport:'匯出 JSON',bookmarkImportFile:'本機書籤 JSON（最多 1 MiB）',bookmarkImportPolicy:'同影格內容不同時',bookmarkImportKeep:'保留本機內容',bookmarkImportOverwrite:'使用匯入內容覆寫',bookmarkImportPreview:'檢查匯入',bookmarkImportApply:'套用匯入',bookmarkImportChoose:'請選擇本機 JSON，先檢查預覽再套用。',bookmarkFileReading:'正在讀取本機 JSON…',bookmarkFileReady:'檔案已讀取，請先檢查匯入。',bookmarkFileLimit:'請選擇非空白且不超過 1 MiB 的 JSON 檔案。',bookmarkFileReadFailed:'無法讀取本機檔案，請重新選取。',bookmarkImportChecking:'正在檢查匯入…',bookmarkImportPreviewed:'匯入預覽 · 尚未儲存',bookmarkImportApplying:'正在套用匯入…',bookmarkImportDone:'書籤匯入完成',bookmarkImportFailed:'匯入未完成，請檢查檔案並重新預覽。',bookmarkImportAdded:'新增',bookmarkImportUpdated:'更新',bookmarkImportUnchanged:'相同',bookmarkImportConflicts:'同格差異',bookmarkImportIncoming:'檔案書籤數',bookmarksTitle:'影格書籤與備註',bookmarksNote:'標記目前顯示的影格會暫停回放；選擇標籤、填寫備註後按儲存。已存書籤只保留在本機 Session。',bookmarkMark:'標記目前影格',bookmarkTags:'檢查標籤（可多選）',bookmarkIdSwitch:'疑似換 ID',bookmarkOcclusion:'遮擋',bookmarkCrossing:'物件交會',bookmarkNote:'備註（最多 1000 字）',bookmarkSave:'儲存影格書籤',bookmarkDelete:'移除影格書籤',bookmarksLoading:'正在讀取本機書籤…',bookmarksEmpty:'此 Session 尚無已存書籤。',bookmarksCount:'已存書籤數',bookmarksFailed:'無法讀取本機書籤，請重新整理再試。',bookmarkChoose:'請先回放影格，再新增或編輯書籤。',bookmarkNew:'尚未建立書籤',bookmarkSaved:'書籤已儲存',bookmarkRemoved:'書籤已移除',bookmarkDraft:'尚未儲存的變更',bookmarkInvalid:'備註最多 1000 字，不可含控制字元。',bookmarkSaving:'正在儲存書籤…',bookmarkGeneral:'一般書籤',loopTitle:'A／B 區間循環',loopEnable:'循環播放 A–B',loopStart:'A · 起始影格',loopEnd:'B · 結束影格',loopSetStart:'將目前影格設為 A',loopSetEnd:'將目前影格設為 B',loopUnavailable:'至少保存兩個影格才能循環播放。',loopInvalid:'請輸入整數影格位置，A 必須小於 B。',loopReady:'已啟用循環 · 按播放反覆觀看',loopOff:'循環已關閉 · 使用保存順序，包含起訖影格',replayPosition:'回放進度',replayFrame:'影格',seekTarget:'跳轉至',seekCurrent:'目前顯示',seekRelease:'放開後跳轉',seekLoading:'正在跳轉至',replayNotShown:'尚未回放影格',play:'播放',pause:'暫停',playbackSpeed:'速度',playbackNote:'依保存順序回放：1× 目標為每秒 5 格；載入較慢時會放慢。',playbackPlaying:'播放中',playbackPaused:'已暫停',playbackEnded:'已播至最後一格',playbackError:'播放因錯誤停止',previousFrame:'上一格',nextFrame:'下一格',overlayToggle:'疊加追蹤框與 Object ID',overlayLabel:'追蹤框與 Object ID',overlayOff:'追蹤疊圖已隱藏。',overlayMissing:'請先執行追蹤分析，再回放已分析影格以查看 ID。',overlayUnanalysed:'這格尚未分析；請點「回放已分析影格」，或重新執行追蹤。',overlayMismatch:'追蹤結果與這份快照不符；請重新整理並重跑分析。',overlayLoading:'正在載入已存影像…',overlayEmpty:'這格沒有已確認的追蹤偵測。',overlayReady:'已追蹤偵測數',replayTracked:'回放已分析影格',title:'工作階段／回放',language:'語言',subtitle:'只在手動操作時將已完成的 AI 影格保存到本機；不會自動錄製相機，也不會在回放時重新推論。',sessions:'工作階段',label:'名稱（可不填）',create:'建立工作階段',refresh:'重新整理',capture:'儲存最新影格',scope:'需主動設定 ENABLE_SESSION_STORAGE=1；僅允許本機，最多 20 個工作階段 × 每個 120 影格。',frames:'已儲存影格',replay:'回放選取影格',download:'下載原始快照 ZIP',view:'已保存的 RGB、深度與 3D 點雲',rgb:'對齊 RGB',depth:'深度預覽',trend:'時間序列摘要',trendNote:'只比較影格層級深度中位數；不表示像素追蹤、物理尺度漂移或姿態補償。',consistency:'時間深度一致性',consistencyNote:'只比較相同影像格點的深度；不含運動補償、測距精度驗證或連續錄影。',pair:'保存影格對',nativeMae:'原始單位 MAE',normalizedMae:'形狀 MAE',overlap:'有效重疊比例',downloadReport:'匯出時間分析 JSON',noPairs:'至少保存兩個相容的影格才能比較。',skip:'不相容而略過的影格對',warning:'深度是 AI 估計；相對深度不是公尺，亦無安全／精度認證。',disabled:'請設定 ENABLE_SESSION_STORAGE=1 後重啟應用。',saved:'影格已保存',created:'工作階段已建立',failed:'操作失敗',tracking:'語意物件追蹤（離線）',trackingNote:'手動以 YOLO Detect／Segment 分析已存影格，僅使用 CPU。Object ID 是 2D 關聯結果，不是身份或世界座標軌跡。',trackBackend:'關聯方式',trackBaseline:'簡易關聯',trackBotSort:'Roboflow BoT-SORT',trackWorkerMissing:'本機 worker 尚未設定，BoT-SORT 暫時無法使用。',trackMode:'模式',segment:'實例分割',detect:'方框區域',trackRun:'分析已存影格',trackDownload:'匯出追蹤 JSON',trackEmpty:'執行分析後會顯示 Object ID、深度與相機座標 XYZ 歷史。',trackCount:'物件數',trackFrame:'影格',trackClass:'類別',trackDepth:'深度',trackXYZ:'相機 XYZ',trackWarning:'物件交會或消失可能造成 ID 中斷；XYZ 使用尚未驗證的深度單位。',trackRunning:'正在分析已存影格…',trackDone:'追蹤分析已完成'}
};
let lang=new URLSearchParams(location.search).get('lang');
if(!tr[lang])try{lang=localStorage.getItem('depthport-language')}catch(e){}
if(!tr[lang])lang='en';
function apply(){document.documentElement.lang=lang;by('lang').value=lang;
  document.querySelectorAll('[data-i]').forEach(e=>e.textContent=tr[lang][e.dataset.i]||e.textContent);
  by('tracking-overlay').setAttribute('aria-label',tr[lang].overlayLabel);updateReplayShortcutHints();}
by('lang').onchange=()=>{lang=by('lang').value;try{localStorage.setItem('depthport-language',lang)}catch(e){}apply();if(lastConsistency)renderConsistency(lastConsistency);if(lastTracking)renderTracking(lastTracking);drawOverlay();renderBookmarks();updatePlaybackControls()};apply();
async function req(url,opt){const r=await fetch(url,{cache:'no-store',...opt});
 let o;try{o=await r.json()}catch(e){o={detail:'Non-JSON response'}}
 if(!r.ok)throw Error(o.detail||('HTTP '+r.status));return o;}
function message(s){by('status').textContent=s}
let viewer=null,lastConsistency=null,lastTracking=null,currentReplay=null;
let replayGeneration=0,framesGeneration=0,trackingGeneration=0,replayLoading=false;
let resizeObserver=null,playbackRestart=false,progressPreview=null;
let bookmarkRows=[],bookmarkReady=false,bookmarkLoadError=false,bookmarkGeneration=0,bookmarkWrite=null,bookmarkEditorKey=null,bookmarkNotice='';
let bookmarkTransfer=null,bookmarkJump=null,bookmarkComposing=false,bookmarkUndo=null,bookmarkRedo=null,bookmarkReturn=null,bookmarkReturnCleared=false,bookmarkClearedReturn=null,bookmarkReturnRestored=false,clearTargetReturn=null,clearTargetReturnCleared=false,clearedTargetReturn=null,clearTargetReturnRestored=false,targetClearJumpReturn=null,targetClearJumpReturnCleared=false,targetClearJumpClearedReturn=null,targetClearJumpReturnRestored=false,visitClearJumpReturn=null,visitClearJumpReturnCleared=false,visitClearJumpClearedReturn=null,visitClearJumpReturnRestored=false,visitClearHistoryReturn=null,visitClearHistoryReturnCleared=false,visitClearHistoryClearedReturn=null,visitClearHistoryReturnRestored=false;
const bookmarkDrafts=new Map(),savedFrameHashes=new Map();
const bookmarkTags=['id-switch','occlusion','crossing'];
const bookmarkTagKeys={'id-switch':'bookmarkIdSwitch',occlusion:'bookmarkOcclusion',crossing:'bookmarkCrossing'};
const playback=window.DepthPortReplayPlayback.create({advance:advancePlayback,onState:updatePlaybackControls,
 onError:()=>message(tr[lang].failed+': '+tr[lang].playbackError)});
function updatePlaybackControls(){
 const state=playback.getState(),available=by('frames-list').options.length>0;
 by('playback-play').disabled=state.playing||!available||replayLoading||progressPreview!==null||(by('loop-enabled').checked&&!loopRange());
 by('playback-pause').disabled=!state.playing;
 const key={playing:'playbackPlaying',paused:'playbackPaused',ended:'playbackEnded',error:'playbackError'}[state.status];
 const text=tr[lang][key]+' · '+state.speed+'×';
 if(by('playback-status').textContent!==text)by('playback-status').textContent=text;
 by('overlay-status').setAttribute('aria-live',state.playing?'off':'polite');updateProgress();updateLoopControls();updateBookmarkEditor();
}
function cancelBookmarkJump(){if(!bookmarkJump)return false;bookmarkJump=null;replayGeneration++;replayLoading=false;return true}
function pausePlayback(){playbackRestart=false;progressPreview=null;cancelBookmarkJump();playback.pause()}
function shownPosition(){
 const sel=by('frames-list');
 return currentReplay?.session_id===by('sessions-list').value?[...sel.options].findIndex(o=>o.value===String(currentReplay.index))+1:0;
}
function loopRange(){
 const count=by('frames-list').options.length,a=Number(by('loop-start').value),b=Number(by('loop-end').value);
 return by('sessions-list').value&&Number.isInteger(a)&&Number.isInteger(b)&&a>=1&&a<b&&b<=count?{start:a-1,end:b-1}:null;
}
function updateLoopControls(){
 const count=by('frames-list').options.length,available=count>=2,shown=shownPosition(),range=loopRange();
 by('loop-enabled').disabled=!available;
 for(const id of ['loop-start','loop-end']){const input=by(id);input.min='1';input.max=String(Math.max(1,count));input.step='1';input.disabled=!available;input.setAttribute('aria-invalid',String(available&&!range))}
 by('loop-set-start').disabled=by('loop-set-end').disabled=!available||!shown;
 const text=!available?tr[lang].loopUnavailable:!range?tr[lang].loopInvalid+' · 1 ≤ A < B ≤ '+count:
  (by('loop-enabled').checked?tr[lang].loopReady:tr[lang].loopOff)+' · A '+(range.start+1)+' → B '+(range.end+1)+(by('loop-enabled').checked?' → A':'');
 if(by('loop-status').textContent!==text)by('loop-status').textContent=text;
}
function resetLoop(){by('loop-enabled').checked=false;by('loop-start').value='1';by('loop-end').value=String(Math.max(1,by('frames-list').options.length))}
function editLoop(){pausePlayback();replayGeneration++;replayLoading=false;updatePlaybackControls()}
function markLoop(id){const shown=shownPosition();if(shown&&by('frames-list').options.length>=2){by(id).value=String(shown);editLoop()}}
function updateProgress(){
 const range=by('replay-progress'),sel=by('frames-list'),count=sel.options.length,sid=by('sessions-list').value;
 range.min='1';range.max=String(Math.max(1,count));range.step='1';range.disabled=count<=1;
 const shown=currentReplay?.session_id===sid?[...sel.options].findIndex(o=>o.value===String(currentReplay.index))+1:0;
 const preview=progressPreview?.sid===sid&&progressPreview.framesGeneration===framesGeneration?progressPreview:null;
 range.value=String(preview?preview.position:shown||1);
 const position=shown+' / '+count;
 const text=preview?(preview.loading?tr[lang].seekLoading:tr[lang].seekTarget)+' '+preview.position+' / '+count+' · '+tr[lang].seekCurrent+' '+position+(preview.loading?'':' · '+tr[lang].seekRelease):
  (shown?tr[lang].replayFrame+' '+position:tr[lang].replayNotShown+' · '+position);
 by('replay-progress-text').textContent=text;range.setAttribute('aria-valuetext',text);
}
function previewProgress(){
 const position=Number(by('replay-progress').value),sel=by('frames-list'),sid=by('sessions-list').value;
 if(!sid||sel.options.length<=1||!Number.isInteger(position)||position<1||position>sel.options.length){progressPreview=null;updatePlaybackControls();return}
 pausePlayback();replayGeneration++;replayLoading=false;
 const shown=currentReplay?.session_id===sid?[...sel.options].findIndex(o=>o.value===String(currentReplay.index))+1:0;
 if(position===shown){updatePlaybackControls();return}
 progressPreview={position,sid,framesGeneration};updatePlaybackControls();
}
async function seekProgress(){
 const preview=progressPreview,sel=by('frames-list');
 if(preview?.loading)return;
 if(!preview||preview.sid!==by('sessions-list').value||preview.framesGeneration!==framesGeneration||
    Number(by('replay-progress').value)!==preview.position||!sel.options[preview.position-1]){progressPreview=null;updatePlaybackControls();return}
 preview.loading=true;
 const valid=()=>progressPreview===preview&&preview.framesGeneration===framesGeneration;
 try{await presentReplay(preview.sid,sel.options[preview.position-1].value,valid,true)}
 finally{if(progressPreview===preview){progressPreview=null;updatePlaybackControls()}}
}
async function decodedImage(src,id){
 const image=new Image();image.id=id;image.alt=by(id).alt;
 if(typeof image.decode==='function'){image.src=src;await image.decode()}
 else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=src});
 if(!image.naturalWidth||!image.naturalHeight)throw Error('Saved frame image could not be decoded');
 return image;
}
async function presentReplay(sid,index,valid=()=>true,keepPrevious=false,expectedSnapshot=null){
 const generation=++replayGeneration;
 if(!keepPrevious){currentReplay=null;by('result').hidden=true;by('tracking-overlay').replaceChildren();by('overlay-status').textContent='';by('download').hidden=true}
 replayLoading=true;updatePlaybackControls();
 const current=()=>generation===replayGeneration&&sid===by('sessions-list').value&&valid();
 try{
  const data=await req('/api/sessions/'+sid+'/frames/'+index+'/replay');
  if(!current())return false;
  if(data.session_id!==sid||String(data.index)!==String(index))throw Error('Saved frame response does not match selection');
  if(expectedSnapshot&&data.snapshot_sha256!==expectedSnapshot)throw Error('Saved frame does not match bookmark snapshot');
  const [image,depth]=await Promise.all([decodedImage('data:image/png;base64,'+data.rgb_png,'rgb'),decodedImage('data:image/jpeg;base64,'+data.depth_jpeg,'depth')]);
  if(!current())return false;
  const oldImage=by('rgb');if(resizeObserver)resizeObserver.unobserve(oldImage);
  by('tracking-overlay').replaceChildren();oldImage.replaceWith(image);by('depth').replaceWith(depth);
  currentReplay={...data,imageReady:true};by('frames-list').value=String(index);
  by('result').hidden=false;drawOverlay();updateNavigation();
  if(resizeObserver)resizeObserver.observe(image);
  by('model').textContent=data.engine+' · '+data.model+' · '+data.units+' · #'+data.index+' · Frame '+data.frame_id;
  by('details').textContent=JSON.stringify({intrinsics:data.intrinsics,depth_stats:data.depth_stats,frame_timestamp:data.frame_timestamp,note:data.note},null,2);
  by('download').href='/api/sessions/'+sid+'/frames/'+index+'/bundle.zip';by('download').hidden=false;
  if(!viewer)viewer=new window.CloudViewer(by('cloud'));
  viewer.setPacked(data.points,data.count,true,data.color_range||[.1,20]);
  return true;
 }catch(error){if(current())throw error;return false}
 finally{if(generation===replayGeneration){replayLoading=false;updatePlaybackControls()}}
}
async function advancePlayback(valid){
 const sid=by('sessions-list').value,sel=by('frames-list');
 if(!sid||!sel.options.length)return false;
 const isShown=currentReplay?.session_id===sid&&String(currentReplay.index)===sel.value;
 let next=playbackRestart?0:sel.selectedIndex+(isShown?1:0);
 if(by('loop-enabled').checked){
  const range=loopRange();if(!range)return false;
  if(sel.selectedIndex<range.start||sel.selectedIndex>range.end||next>range.end)next=range.start;
 }
 if(next<0||next>=sel.options.length)return false;
 const committed=await presentReplay(sid,sel.options[next].value,valid,true);
 if(committed)playbackRestart=false;return committed;
}
function clearReplay(){
 pausePlayback();replayGeneration++;replayLoading=false;currentReplay=null;by('result').hidden=true;
 by('tracking-overlay').replaceChildren();by('overlay-status').textContent='';by('download').hidden=true;updatePlaybackControls();
}
function updateNavigation(){
 const sel=by('frames-list');by('frame-prev').disabled=sel.selectedIndex<=0;
 by('frame-next').disabled=sel.selectedIndex<0||sel.selectedIndex>=sel.options.length-1;updatePlaybackControls();
}
function drawOverlay(){
 const svg=by('tracking-overlay');svg.replaceChildren();
 if(!currentReplay)return;
 let text;
 if(!by('overlay-enabled').checked)text=tr[lang].overlayOff;
 else if(!currentReplay.imageReady)text=tr[lang].overlayLoading;
 else{
  const image=by('rgb');const result=window.DepthPortTrackingOverlay.match(lastTracking,currentReplay,image.naturalWidth,image.naturalHeight);
  if(result.state==='ready'){
   window.DepthPortTrackingOverlay.draw(svg,result.objects,image.naturalWidth,image.naturalHeight,image.clientWidth);
   text=result.objects.length ? tr[lang].overlayReady+': '+result.objects.length+' · #'+currentReplay.index : tr[lang].overlayEmpty;
  }else text=tr[lang][{missing:'overlayMissing',unanalysed:'overlayUnanalysed',mismatch:'overlayMismatch'}[result.state]];
 }
 by('overlay-status').textContent=text;
}
async function replaySelected(){
 pausePlayback();const sid=by('sessions-list').value,index=by('frames-list').value;
 if(!sid||!index)throw Error('Select a saved frame');
 await presentReplay(sid,index);updateNavigation();
}
async function stepReplay(delta){pausePlayback();const sel=by('frames-list');const i=sel.selectedIndex+delta;
 if(i<0||i>=sel.options.length)return;sel.selectedIndex=i;await replaySelected();}

// Bookmarks are private Session data. Drafts live only in this page until Save.
function bookmarkKey(target){return target.session_id+':'+target.index+':'+target.snapshot_sha256}
function bookmarkTarget(){
 if(!shownPosition()||!currentReplay?.imageReady||savedFrameHashes.get(currentReplay.index)!==currentReplay.snapshot_sha256)return null;
 return {session_id:currentReplay.session_id,index:currentReplay.index,snapshot_sha256:currentReplay.snapshot_sha256};
}
function validBookmarkNote(note){
 if(typeof note!=='string')return false;
 const chars=[...note];
 return chars.length<=1000&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(note)&&
  chars.every(c=>c.codePointAt(0)<0xd800||c.codePointAt(0)>0xdfff);
}
function bookmarkFields(){return {note:by('bookmark-note').value,tags:bookmarkTags.filter(tag=>by('bookmark-tag-'+tag).checked)}}
function savedBookmark(target){return target&&bookmarkRows.find(row=>row.index===target.index&&row.snapshot_sha256===target.snapshot_sha256)}
function updateBookmarkEditor(){
 const target=bookmarkTarget(),key=target?bookmarkKey(target):null,saved=savedBookmark(target);
 if(key!==bookmarkEditorKey){
  bookmarkEditorKey=key;const fields=bookmarkDrafts.get(key)||saved||{note:'',tags:[]};
  by('bookmark-note').value=fields.note;
  for(const tag of bookmarkTags)by('bookmark-tag-'+tag).checked=fields.tags.includes(tag);
 }
 const available=!!target&&bookmarkReady&&!bookmarkWrite,editable=available&&!replayLoading&&!progressPreview;
 by('bookmark-mark').disabled=!available;
 by('bookmark-note').disabled=!editable;
 for(const tag of bookmarkTags)by('bookmark-tag-'+tag).disabled=!editable;
 const fields=bookmarkFields(),valid=validBookmarkNote(fields.note);
 by('bookmark-save').disabled=!editable||!valid;
 by('bookmark-delete').disabled=!editable||!saved;
 by('bookmark-note').setAttribute('aria-invalid',String(!valid));
 const draft=bookmarkDrafts.get(key);
 const busyKey=bookmarkWrite?.kind==='import'?(bookmarkWrite.dryRun?'bookmarkImportChecking':'bookmarkImportApplying'):'bookmarkSaving';
 const text=!target?tr[lang].bookmarkChoose:tr[lang].replayFrame+' '+shownPosition()+' / '+by('frames-list').options.length+' · '+
  (bookmarkWrite?tr[lang][busyKey]:!valid?tr[lang].bookmarkInvalid:draft?tr[lang].bookmarkDraft:saved?tr[lang].bookmarkSaved:tr[lang].bookmarkNew)+' · '+[...fields.note].length+' / 1000';
 if(by('bookmark-editor-status').textContent!==text)by('bookmark-editor-status').textContent=text;
 updateBookmarkTransferControls();updateBookmarkNavigation();updateBookmarkHistoryControls();
}
function updateBookmarkHistoryControls(){
 const busy=document.hidden||!!bookmarkJump||progressPreview!==null||by('bookmark-delete-dialog').open||by('shortcut-help-dialog').open;
 for(const [id,target] of [['bookmark-undo-delete',undoBookmarkTarget()],['bookmark-redo-delete',redoBookmarkTarget()]]){
  by(id).disabled=busy||!target;
  const ordinal=target?[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1:0;
  const frame=target?tr[lang].replayFrame+' '+ordinal+' / '+by('frames-list').options.length+' · #'+target.index:tr[lang].bookmarkHistoryEmpty;
  const prefix=target?tr[lang].bookmarkHistoryTarget+': ':'';
  const tags=target?' · '+(target.tags.length?target.tags.map(tag=>tr[lang][bookmarkTagKeys[tag]]).join(' · '):tr[lang].bookmarkGeneral)+(busy?' · '+tr[lang].bookmarkHistoryBlocked:''):'';
  const jump=by(id+'-jump');jump.disabled=by(id).disabled;
  if(jump.textContent!==frame)jump.textContent=frame;
  jump.setAttribute('aria-label',tr[lang].bookmarkHistoryJump+': '+prefix+frame+tags);
  const summary=by(id+'-target');if(summary.textContent!==prefix+frame+tags)summary.replaceChildren(document.createTextNode(prefix),jump,document.createTextNode(tags));
 }
 const target=bookmarkReturnTarget();by('bookmark-history-return').disabled=busy||!target;
 by('bookmark-history-clear-return').disabled=busy||!target;
 by('bookmark-history-redo-clear').disabled=busy||!bookmarkReturnRestored||!target;
 const undoClear=by('bookmark-history-undo-clear');undoClear.hidden=!bookmarkReturnCleared;
 by('bookmark-history-undo-clear-action').hidden=undoClear.hidden;
 undoClear.disabled=busy||!clearedBookmarkReturnTarget();
 const position=target?[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1:0;
 const text=target?(bookmarkReturnRestored?tr[lang].bookmarkHistoryReturnRestored+' · ':'')+tr[lang].bookmarkHistoryTarget+': '+tr[lang].replayFrame+' '+position+' / '+by('frames-list').options.length+' · #'+target.index+(busy?' · '+tr[lang].bookmarkHistoryBlocked:''):tr[lang][bookmarkReturnCleared?'bookmarkHistoryReturnCleared':'bookmarkHistoryEmpty'];
 if(by('bookmark-history-return-target').textContent!==text)by('bookmark-history-return-target').textContent=text;
 for(const [id,row] of [['bookmark-history-undo-clear',!bookmarkReturn&&bookmarkReturnCleared?matchingBookmarkReturn(bookmarkClearedReturn):null],
    ['bookmark-history-redo-clear',bookmarkReturnRestored?matchingBookmarkReturn(bookmarkReturn):null]]){
  const ordinal=row?[...by('frames-list').options].findIndex(o=>o.value===String(row.index))+1:0;
  const frame=row?tr[lang].replayFrame+' '+ordinal+' / '+by('frames-list').options.length+' · #'+row.index:tr[lang].bookmarkHistoryEmpty;
  const prefix=row?tr[lang].bookmarkHistoryTarget+': ':'',suffix=row&&by(id).disabled?' · '+tr[lang].bookmarkHistoryBlocked:'';
  const jump=by(id+'-jump');jump.disabled=by(id).disabled;
  if(jump.textContent!==frame)jump.textContent=frame;
  jump.setAttribute('aria-label',tr[lang].bookmarkHistoryJump+': '+prefix+frame+suffix);
  const summary=by(id+'-target');if(summary.textContent!==prefix+frame+suffix)summary.replaceChildren(document.createTextNode(prefix),jump,document.createTextNode(suffix));
 }
 const origin=matchingBookmarkReturn(clearTargetReturn),returnButton=by('bookmark-clear-target-return');
 returnButton.disabled=busy||!validBookmarkReturn(clearTargetReturn);
 by('bookmark-clear-target-position').disabled=returnButton.disabled;
 by('bookmark-redo-clear-target-position').disabled=!clearTargetReturnRestored||returnButton.disabled;
 const undoClearTarget=by('bookmark-undo-clear-target-position');undoClearTarget.hidden=!clearTargetReturnCleared;
 by('bookmark-undo-clear-target-position-action').hidden=undoClearTarget.hidden;
 undoClearTarget.disabled=busy||!clearTargetReturnCleared||!!clearTargetReturn||!validBookmarkReturn(clearedTargetReturn);
 for(const [id,row] of [['bookmark-undo-clear-target-position',!clearTargetReturn&&clearTargetReturnCleared?matchingBookmarkReturn(clearedTargetReturn):null],
    ['bookmark-redo-clear-target-position',clearTargetReturnRestored?matchingBookmarkReturn(clearTargetReturn):null]]){
  const position=row?[...by('frames-list').options].findIndex(o=>o.value===String(row.index))+1:0;
  const frame=row?tr[lang].replayFrame+' '+position+' / '+by('frames-list').options.length+' · #'+row.index:tr[lang].bookmarkHistoryEmpty;
  const prefix=row?tr[lang].bookmarkHistoryTarget+': ':'',suffix=row&&by(id).disabled?' · '+tr[lang].bookmarkHistoryBlocked:'';
  const jump=by(id+'-jump');jump.disabled=by(id).disabled;
  if(jump.textContent!==frame)jump.textContent=frame;
  jump.setAttribute('aria-label',tr[lang].bookmarkHistoryJump+': '+prefix+frame+suffix);
  const summary=by(id+'-target');if(summary.textContent!==prefix+frame+suffix)summary.replaceChildren(document.createTextNode(prefix),jump,document.createTextNode(suffix));
 }
 const ordinal=origin?[...by('frames-list').options].findIndex(o=>o.value===String(origin.index))+1:0;
 const returnText=origin?(clearTargetReturnRestored?tr[lang].bookmarkClearTargetPositionRestored+' · ':'')+tr[lang].bookmarkHistoryTarget+': '+tr[lang].replayFrame+' '+ordinal+' / '+by('frames-list').options.length+' · #'+origin.index+
  (returnButton.disabled?' · '+tr[lang].bookmarkHistoryBlocked:''):tr[lang][clearTargetReturnCleared?'bookmarkClearTargetPositionCleared':'bookmarkHistoryEmpty'];
 if(by('bookmark-clear-target-return-target').textContent!==returnText)by('bookmark-clear-target-return-target').textContent=returnText;
 const jumpOrigin=matchingBookmarkReturn(targetClearJumpReturn),jumpReturnButton=by('bookmark-target-clear-jump-return');
 jumpReturnButton.disabled=busy||!validBookmarkReturn(targetClearJumpReturn);
 by('bookmark-clear-target-jump-position').disabled=jumpReturnButton.disabled;
 by('bookmark-redo-clear-target-jump-position').disabled=!targetClearJumpReturnRestored||jumpReturnButton.disabled;
 const undoJumpClear=by('bookmark-undo-clear-target-jump-position');undoJumpClear.hidden=!targetClearJumpReturnCleared;
 undoJumpClear.disabled=busy||!targetClearJumpReturnCleared||!!targetClearJumpReturn||!validBookmarkReturn(targetClearJumpClearedReturn);
 by('bookmark-undo-clear-target-jump-position-action').hidden=undoJumpClear.hidden;
 for(const [id,row] of [['bookmark-undo-clear-target-jump-position',!targetClearJumpReturn&&targetClearJumpReturnCleared?matchingBookmarkReturn(targetClearJumpClearedReturn):null],
    ['bookmark-redo-clear-target-jump-position',targetClearJumpReturnRestored?matchingBookmarkReturn(targetClearJumpReturn):null]]){
  const position=row?[...by('frames-list').options].findIndex(o=>o.value===String(row.index))+1:0;
  const frame=row?tr[lang].replayFrame+' '+position+' / '+by('frames-list').options.length+' · #'+row.index:tr[lang].bookmarkHistoryEmpty;
  const prefix=row?tr[lang].bookmarkHistoryTarget+': ':'',suffix=row&&by(id).disabled?' · '+tr[lang].bookmarkHistoryBlocked:'';
  const jump=by(id+'-jump');jump.disabled=by(id).disabled;
  if(jump.textContent!==frame)jump.textContent=frame;
  jump.setAttribute('aria-label',tr[lang].bookmarkHistoryJump+': '+prefix+frame+suffix);
  const summary=by(id+'-target');if(summary.textContent!==prefix+frame+suffix)summary.replaceChildren(document.createTextNode(prefix),jump,document.createTextNode(suffix));
 }
 const jumpPosition=jumpOrigin?[...by('frames-list').options].findIndex(o=>o.value===String(jumpOrigin.index))+1:0;
 const jumpText=jumpOrigin?(targetClearJumpReturnRestored?tr[lang].bookmarkTargetClearJumpReturnRestored+' · ':'')+tr[lang].bookmarkHistoryTarget+': '+tr[lang].replayFrame+' '+jumpPosition+' / '+by('frames-list').options.length+' · #'+jumpOrigin.index+
  (jumpReturnButton.disabled?' · '+tr[lang].bookmarkHistoryBlocked:''):tr[lang][targetClearJumpReturnCleared?'bookmarkTargetClearJumpReturnCleared':'bookmarkHistoryEmpty'];
 if(by('bookmark-target-clear-jump-return-target').textContent!==jumpText)by('bookmark-target-clear-jump-return-target').textContent=jumpText;
 const visitOrigin=matchingBookmarkReturn(visitClearJumpReturn),visitReturnButton=by('bookmark-visit-clear-jump-return');
 visitReturnButton.disabled=busy||!validBookmarkReturn(visitClearJumpReturn);
 by('bookmark-clear-visit-jump-position').disabled=visitReturnButton.disabled;
 by('bookmark-redo-clear-visit-jump-position').disabled=!visitClearJumpReturnRestored||visitReturnButton.disabled;
 const undoVisitClear=by('bookmark-undo-clear-visit-jump-position');undoVisitClear.hidden=!visitClearJumpReturnCleared;
 undoVisitClear.disabled=busy||!visitClearJumpReturnCleared||!!visitClearJumpReturn||!validBookmarkReturn(visitClearJumpClearedReturn);
 by('bookmark-undo-clear-visit-jump-position-action').hidden=undoVisitClear.hidden;
 for(const [id,row] of [['bookmark-undo-clear-visit-jump-position',!visitClearJumpReturn&&visitClearJumpReturnCleared?matchingBookmarkReturn(visitClearJumpClearedReturn):null],
    ['bookmark-redo-clear-visit-jump-position',visitClearJumpReturnRestored?matchingBookmarkReturn(visitClearJumpReturn):null]]){
  const position=row?[...by('frames-list').options].findIndex(o=>o.value===String(row.index))+1:0;
  const frame=row?tr[lang].replayFrame+' '+position+' / '+by('frames-list').options.length+' · #'+row.index:tr[lang].bookmarkHistoryEmpty;
  const prefix=row?tr[lang].bookmarkHistoryTarget+': ':'',suffix=row&&by(id).disabled?' · '+tr[lang].bookmarkHistoryBlocked:'';
  const jump=by(id+'-jump');jump.disabled=by(id).disabled;
  if(jump.textContent!==frame)jump.textContent=frame;
  jump.setAttribute('aria-label',tr[lang].bookmarkHistoryJump+': '+prefix+frame+suffix);
  const summary=by(id+'-target');if(summary.textContent!==prefix+frame+suffix)summary.replaceChildren(document.createTextNode(prefix),jump,document.createTextNode(suffix));
 }
 const visitPosition=visitOrigin?[...by('frames-list').options].findIndex(o=>o.value===String(visitOrigin.index))+1:0;
 const visitText=visitOrigin?(visitClearJumpReturnRestored?tr[lang].bookmarkVisitClearJumpReturnRestored+' · ':'')+tr[lang].bookmarkHistoryTarget+': '+tr[lang].replayFrame+' '+visitPosition+' / '+by('frames-list').options.length+' · #'+visitOrigin.index+
  (visitReturnButton.disabled?' · '+tr[lang].bookmarkHistoryBlocked:''):tr[lang][visitClearJumpReturnCleared?'bookmarkVisitClearJumpReturnCleared':'bookmarkHistoryEmpty'];
 if(by('bookmark-visit-clear-jump-return-target').textContent!==visitText)by('bookmark-visit-clear-jump-return-target').textContent=visitText;
 const historyOrigin=matchingBookmarkReturn(visitClearHistoryReturn),historyReturnButton=by('bookmark-visit-clear-history-return');
 historyReturnButton.disabled=busy||!validBookmarkReturn(visitClearHistoryReturn);
 by('bookmark-clear-visit-history-position').disabled=historyReturnButton.disabled;
 by('bookmark-redo-clear-visit-history-position').disabled=!visitClearHistoryReturnRestored||historyReturnButton.disabled;
 const undoHistoryClear=by('bookmark-undo-clear-visit-history-position');undoHistoryClear.hidden=!visitClearHistoryReturnCleared;
 undoHistoryClear.disabled=busy||!visitClearHistoryReturnCleared||!!visitClearHistoryReturn||!validBookmarkReturn(visitClearHistoryClearedReturn);
 by('bookmark-undo-clear-visit-history-position-action').hidden=undoHistoryClear.hidden;
 for(const [id,row] of [['bookmark-undo-clear-visit-history-position',!visitClearHistoryReturn&&visitClearHistoryReturnCleared?matchingBookmarkReturn(visitClearHistoryClearedReturn):null],
    ['bookmark-redo-clear-visit-history-position',visitClearHistoryReturnRestored?matchingBookmarkReturn(visitClearHistoryReturn):null]]){
  const position=row?[...by('frames-list').options].findIndex(o=>o.value===String(row.index))+1:0;
  const frame=row?tr[lang].replayFrame+' '+position+' / '+by('frames-list').options.length+' · #'+row.index:tr[lang].bookmarkHistoryEmpty;
  const prefix=row?tr[lang].bookmarkHistoryTarget+': ':'',suffix=row&&by(id).disabled?' · '+tr[lang].bookmarkHistoryBlocked:'';
  const jump=by(id+'-jump');jump.disabled=by(id).disabled;
  if(jump.textContent!==frame)jump.textContent=frame;
  jump.setAttribute('aria-label',tr[lang].bookmarkHistoryJump+': '+prefix+frame+suffix);
  const summary=by(id+'-target');if(summary.textContent!==prefix+frame+suffix)summary.replaceChildren(document.createTextNode(prefix),jump,document.createTextNode(suffix));
 }
 const historyPosition=historyOrigin?[...by('frames-list').options].findIndex(o=>o.value===String(historyOrigin.index))+1:0;
 const historyText=historyOrigin?(visitClearHistoryReturnRestored?tr[lang].bookmarkVisitClearHistoryReturnRestored+' · ':'')+tr[lang].bookmarkHistoryTarget+': '+tr[lang].replayFrame+' '+historyPosition+' / '+by('frames-list').options.length+' · #'+historyOrigin.index+
  (historyReturnButton.disabled?' · '+tr[lang].bookmarkHistoryBlocked:''):tr[lang][visitClearHistoryReturnCleared?'bookmarkVisitClearHistoryReturnCleared':'bookmarkHistoryEmpty'];
 if(by('bookmark-visit-clear-history-return-target').textContent!==historyText)by('bookmark-visit-clear-history-return-target').textContent=historyText;
}
function freezeBookmark(){
 pausePlayback();replayGeneration++;replayLoading=false;updatePlaybackControls();
}
function editBookmark(){
 if(bookmarkWrite||!bookmarkReady)return;
 freezeBookmark();const target=bookmarkTarget();if(!target)return;
 bookmarkDrafts.set(bookmarkKey(target),bookmarkFields());updateBookmarkEditor();
}
function markBookmark(){
 if(by('bookmark-mark').disabled)return;
 freezeBookmark();by('bookmark-note').focus();
}
function checkBookmarks(data,sid){
 if(data?.format!=='depthport.session-bookmarks.v1'||data.session_id!==sid||!Array.isArray(data.bookmarks)||data.bookmarks.length>120)throw Error('Invalid bookmark response');
 const seen=new Set();
 for(const row of data.bookmarks){
  if(!row||!Number.isInteger(row.index)||seen.has(row.index)||!savedFrameHashes.has(row.index)||
   typeof row.snapshot_sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.snapshot_sha256)||savedFrameHashes.get(row.index)!==row.snapshot_sha256||
   !Array.isArray(row.tags)||row.tags.length>3||new Set(row.tags).size!==row.tags.length||row.tags.some(tag=>!bookmarkTags.includes(tag))||
   !validBookmarkNote(row.note)||!Number.isFinite(row.updated_at))throw Error('Invalid bookmark response');
  seen.add(row.index);
 }
 return data.bookmarks.slice().sort((a,b)=>a.index-b.index);
}
function bookmarkFilterTag(){const selected=by('bookmark-filter-tag').value;return [...bookmarkTags,'general'].includes(selected)?selected:'all'}
function filteredBookmarks(){
 const tag=bookmarkFilterTag(),query=by('bookmark-search').value.trim().normalize('NFKC').toLowerCase();
 const order=new Map([...by('frames-list').options].map((o,i)=>[o.value,i]));
 return bookmarkRows.filter(row=>(tag==='all'||(tag==='general'?row.tags.length===0:row.tags.includes(tag)))&&row.note.normalize('NFKC').toLowerCase().includes(query))
  .sort((a,b)=>(order.get(String(a.index))??Infinity)-(order.get(String(b.index))??Infinity));
}
function bookmarkNavigation(){
 const order=new Map([...by('frames-list').options].map((o,i)=>[o.value,i+1]));
 const matches=filteredBookmarks().map(row=>({row,position:order.get(String(row.index))})).filter(item=>item.position>0),shown=shownPosition();
 return {matches,shown,current:matches.findIndex(item=>item.position===shown&&item.row.snapshot_sha256===currentReplay?.snapshot_sha256),
  previous:[...matches].reverse().find(item=>item.position<shown),next:matches.find(item=>item.position>shown)};
}
function updateBookmarkNavigation(){
 const nav=bookmarkNavigation(),busy=!!bookmarkJump||!!bookmarkWrite;
 for(const [id,target] of [['bookmark-prev',nav.previous],['bookmark-list-prev',nav.previous],['bookmark-next',nav.next],['bookmark-list-next',nav.next]]){
  by(id).disabled=!bookmarkReady||busy||!target;
  by(id).setAttribute('data-index',target?String(target.row.index):'');by(id).title=target?tr[lang].replayFrame+' '+target.position+' / '+by('frames-list').options.length:'';
 }
 const text=!bookmarkReady?'':bookmarkJump?tr[lang].bookmarkNavLoading+' · '+tr[lang].replayFrame+' '+bookmarkJump.position:
  !nav.matches.length?tr[lang].bookmarkFilterNoMatch:nav.current>=0?tr[lang].bookmarkNavCurrent+' '+(nav.current+1)+' / '+nav.matches.length:
  (nav.shown?tr[lang].bookmarkNavOutside:tr[lang].bookmarkNavStart)+' · '+nav.matches.length;
 for(const id of ['bookmark-nav-status','bookmark-list-nav-status']){
  if(by(id).textContent!==text)by(id).textContent=text;
  by(id).setAttribute('aria-live',id==='bookmark-nav-status'&&!playback.getState().playing?'polite':'off');
 }
}
async function adjacentBookmark(delta){
 if(!bookmarkReady||bookmarkJump||bookmarkWrite)return;
 const nav=bookmarkNavigation(),target=delta<0?nav.previous:nav.next;
 if(target)await jumpBookmark(target.row);
}
let bookmarkDeletePrompt=null;
function finishBookmarkDeletePrompt(approved=false){
 const prompt=bookmarkDeletePrompt;if(!prompt)return;
 bookmarkDeletePrompt=null;by('bookmark-delete-dialog').close();prompt.resolve(approved);updateBookmarkHistoryControls();
}
async function confirmBookmarkRemoval(target,redo=false,keyboard=true){
 const key=bookmarkKey(target),generation=framesGeneration;
 freezeBookmark();
 const position=redo?[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1:shownPosition();
 by('bookmark-delete-prompt').textContent=tr[lang][redo?'bookmarkRedoConfirm':'bookmarkDeleteConfirm'].replace('{frame}',String(position)).replace('{total}',String(by('frames-list').options.length));
 const approved=await new Promise(resolve=>{
  bookmarkDeletePrompt={resolve};
  try{by('bookmark-delete-dialog').showModal();updateBookmarkHistoryControls()}catch(error){bookmarkDeletePrompt=null;updateBookmarkHistoryControls();throw error}
 });
 const current=redo?redoBookmarkTarget():bookmarkTarget();
 if(!approved||document.hidden||(keyboard&&!by('bookmark-shortcuts-enabled').checked)||generation!==framesGeneration||!current||bookmarkKey(current)!==key||(redo&&current!==target)||!bookmarkReady||bookmarkWrite||bookmarkJump||!savedBookmark(current))return;
 await writeBookmark(true,true,null,false,redo?target:null);
}
// Replay shortcuts can be switched off and never take over native controls.
function updateReplayShortcutHints(){
 const enabled=by('bookmark-shortcuts-enabled').checked;
 for(const [id,key] of [['bookmark-prev','['],['bookmark-list-prev','['],['bookmark-next',']'],['bookmark-list-next',']'],
    ['result','Shift+p p Shift+n n Shift+k k Shift+j Shift+h Shift+g Shift+y Shift+t Home End PageUp PageDown Shift+A Shift+B Shift+[ Shift+] Control+z Control+Shift+z Control+y'],['bookmark-filter-tag','1 2 3 4 5'],['bookmark-filter-clear','c'],['bookmark-search','f Escape 6'],['overlay-enabled','o'],['playback-play','Space'],['playback-pause','Space'],['playback-speed','Plus Shift+= - 0'],['frame-prev','ArrowLeft'],['frame-next','ArrowRight'],['loop-set-start','a'],['loop-set-end','b'],['loop-enabled','l'],['bookmark-mark','m Shift+m Shift+1 Shift+2 Shift+3 Shift+4'],['bookmark-delete','Shift+d Shift+Delete'],['bookmark-history-return','r'],['bookmark-target-clear-jump-return','g'],['bookmark-visit-clear-jump-return','j'],['bookmark-visit-clear-history-return','n'],['bookmark-clear-visit-history-position','Shift+n'],['bookmark-undo-clear-visit-history-position','p'],['bookmark-redo-clear-visit-history-position','Shift+p'],['bookmark-clear-visit-jump-position','Shift+j'],['bookmark-undo-clear-visit-jump-position','k'],['bookmark-redo-clear-visit-jump-position','Shift+k'],['bookmark-clear-target-jump-position','Shift+g'],['bookmark-undo-clear-target-jump-position','h'],['bookmark-redo-clear-target-jump-position','Shift+h'],['bookmark-clear-target-return','t'],['bookmark-clear-target-position','Shift+t'],['bookmark-undo-clear-target-position','y'],['bookmark-redo-clear-target-position','Shift+y'],['bookmark-history-clear-return','Shift+r'],['bookmark-history-redo-clear','Shift+u'],['bookmark-history-undo-clear','u'],['bookmark-undo-delete','Control+z'],['bookmark-redo-delete','Control+y Control+Shift+z'],['bookmark-save','Control+Enter'],['bookmark-note','Control+Enter Escape'],['shortcut-help-open','?']])
  by(id).setAttribute('aria-keyshortcuts',enabled?key:'');
 updateShortcutHelpState();
}
function updateShortcutHelpState(){
 by('shortcut-help-open').setAttribute('aria-expanded',String(!!by('shortcut-help-dialog').open));
 by('shortcut-help-status').textContent=tr[lang][by('bookmark-shortcuts-enabled').checked?'shortcutHelpEnabled':'shortcutHelpDisabled'];
}
function toggleShortcutHelp(){
 const dialog=by('shortcut-help-dialog');
 if(dialog.open)dialog.close();else{freezeBookmark();dialog.showModal()}
 updateShortcutHelpState();updateBookmarkHistoryControls();
}
// Note-field actions stay scoped to this editor and never take over IME keys.
function bookmarkNoteShortcut(event){
 const note=by('bookmark-note');
 if(by('bookmark-delete-dialog').open||by('shortcut-help-dialog').open||!by('bookmark-shortcuts-enabled').checked||document.hidden||event.defaultPrevented||event.repeat||
    event.isComposing||bookmarkComposing||event.keyCode===229||event.target!==note||document.activeElement!==note||note.disabled)return;
 if(event.key==='Escape'){
  const result=by('result');
  if(event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||result.hidden||!bookmarkTarget())return;
  event.preventDefault();freezeBookmark();result.focus({preventScroll:true});result.scrollIntoView({block:'start',behavior:'auto'});return;
 }
 if(event.key!=='Enter'||!event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||by('bookmark-save').disabled)return;
 event.preventDefault();return act(()=>writeBookmark());
}
function bookmarkSearchShortcut(event){
 const search=by('bookmark-search');
 if(event.key!=='Escape'||by('bookmark-delete-dialog').open||by('shortcut-help-dialog').open||!by('bookmark-shortcuts-enabled').checked||document.hidden||
    event.defaultPrevented||event.repeat||event.isComposing||bookmarkComposing||event.keyCode===229||
    event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.target!==search||document.activeElement!==search||search.disabled)return;
 // Prevent the native search-field Escape action from clearing the query, even
 // when no complete replay is available to receive focus yet.
 event.preventDefault();const result=by('result');if(result.hidden||!bookmarkTarget())return;
 freezeBookmark();result.focus({preventScroll:true});result.scrollIntoView({block:'start',behavior:'auto'});
}
function replayShortcutEditing(node){
 return node?.isContentEditable||node?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="searchbox"],[role="combobox"],[role="spinbutton"],[role="slider"],[role="listbox"],[role="radiogroup"],[role="menu"],[role="tablist"],[role="tree"],[role="grid"]');
}
function replayShortcutNativeSpace(node){
 return node?.closest?.('button,a[href],summary,audio,video,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"],[role="treeitem"]');
}
function playbackShortcutFrame(delta,edge=null){
 const sid=by('sessions-list').value,sel=by('frames-list'),playing=playback.getState().playing;
 if(!sid||bookmarkWrite||bookmarkJump||progressPreview||(replayLoading&&!playing))return null;
 const intervalEdge=edge==='a'||edge==='b',range=intervalEdge?loopRange():null;
 if(intervalEdge&&!range)return null;
 const shown=shownPosition();
 if(Math.abs(delta)>1&&!shown)return null;
 let position=edge==='a'?range.start:edge==='b'?range.end:edge==='first'?0:edge==='last'?sel.options.length-1:shown?shown-1+delta:delta>0?0:-1;
 if(Math.abs(delta)>1)position=Math.max(0,Math.min(sel.options.length-1,position));
 return sel.options[position]?{sid,index:sel.options[position].value}:null;
}
async function stepPlaybackShortcut(target){
 freezeBookmark();
 if(currentReplay?.session_id!==target.sid||String(currentReplay.index)!==target.index)await presentReplay(target.sid,target.index,()=>true,true);
 else by('frames-list').value=target.index;
 updateNavigation();
}
function replayShortcut(event){
 if(bookmarkDeletePrompt)return;
 if(event.key==='?'){
  if(!by('bookmark-shortcuts-enabled').checked||document.hidden||event.defaultPrevented||event.repeat||event.isComposing||
     bookmarkComposing||event.keyCode===229||event.ctrlKey||event.altKey||event.metaKey||
     [...(event.composedPath?.()||[event.target]),document.activeElement].some(replayShortcutEditing))return;
  event.preventDefault();toggleShortcutHelp();return;
 }
 if(by('shortcut-help-dialog').open)return;
 const speedDelta=['+','＋'].includes(event.key)?1:['-','－'].includes(event.key)?-1:0;
 const undoBookmark=event.ctrlKey&&event.key?.toLowerCase()==='z'&&!event.shiftKey;
 const redoBookmark=event.ctrlKey&&((event.key?.toLowerCase()==='z'&&event.shiftKey)||(event.key?.toLowerCase()==='y'&&!event.shiftKey));
 const speedReset=event.key==='0',clearQuery=event.key==='6',deleteBookmark=event.shiftKey&&(event.key==='Delete'||event.key?.toLowerCase()==='d');
 const filterTag=event.key==='1'?'id-switch':event.key==='2'?'occlusion':event.key==='3'?'crossing':event.key==='4'?'general':event.key==='5'?'all':null;
 const loopKey=event.key?.toLowerCase(),loopControl=loopKey==='a'?'loop-set-start':loopKey==='b'?'loop-set-end':loopKey==='l'?'loop-enabled':null;
 const clearReturn=event.shiftKey&&loopKey==='r',redoClearReturn=event.shiftKey&&loopKey==='u',clearTargetPosition=event.shiftKey&&loopKey==='t',redoTargetPosition=event.shiftKey&&loopKey==='y',clearVisitReturn=event.shiftKey&&loopKey==='g',redoVisitReturn=event.shiftKey&&loopKey==='h',clearVisitClearReturn=event.shiftKey&&loopKey==='j',redoVisitClearReturn=event.shiftKey&&loopKey==='k',clearVisitHistoryReturn=event.shiftKey&&loopKey==='n',redoVisitHistoryReturn=event.shiftKey&&loopKey==='p';
 const loopJump=event.shiftKey&&(loopKey==='a'||loopKey==='b');
 const quickMark=event.shiftKey&&loopKey==='m',quickClear=event.shiftKey&&['4','$'].includes(event.key);
 const quickTag=event.shiftKey?(['1','!'].includes(event.key)?'id-switch':['2','@'].includes(event.key)?'occlusion':['3','#'].includes(event.key)?'crossing':null):null;
 const bookmarkEdge=event.shiftKey?(['[','{'].includes(event.key)?'first':[']','}'].includes(event.key)?'last':null):null;
 if((!redoBookmark&&!undoBookmark&&!deleteBookmark&&!quickClear&&!quickTag&&!quickMark&&!bookmarkEdge&&!clearQuery&&!filterTag&&!speedDelta&&!speedReset&&!loopControl&&!['m','o','f','c','r','u','t','y','g','h','j','k','n','p'].includes(loopKey)&&!['[',']',' ','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key))||!by('bookmark-shortcuts-enabled').checked||document.hidden||event.defaultPrevented||event.repeat||
    event.isComposing||bookmarkComposing||event.keyCode===229||(event.ctrlKey&&!undoBookmark&&!redoBookmark)||event.altKey||event.metaKey||(event.shiftKey&&!speedDelta&&!loopJump&&!bookmarkEdge&&!quickMark&&!quickTag&&!quickClear&&!deleteBookmark&&!redoBookmark&&!clearReturn&&!redoClearReturn&&!clearTargetPosition&&!redoTargetPosition&&!clearVisitReturn&&!redoVisitReturn&&!clearVisitClearReturn&&!redoVisitClearReturn&&!clearVisitHistoryReturn&&!redoVisitHistoryReturn))return;
 const origin=[...(event.composedPath?.()||[event.target]),document.activeElement];
 if(origin.some(replayShortcutEditing))return;
 if(loopKey==='p'){
  updateBookmarkHistoryControls();
  if(redoVisitHistoryReturn){
   if(by('bookmark-redo-clear-visit-history-position').disabled)return;
   event.preventDefault();redoClearVisitHistoryReturnPosition();return;
  }
  if(by('bookmark-undo-clear-visit-history-position').disabled)return;
  event.preventDefault();undoClearVisitHistoryReturnPosition();return;
 }
 if(loopKey==='n'){
  updateBookmarkHistoryControls();if(by('bookmark-visit-clear-history-return').disabled)return;
  event.preventDefault();
  if(clearVisitHistoryReturn)return clearVisitHistoryReturnPosition();
  return act(returnVisitClearHistory);
 }
 if(loopKey==='k'){
  updateBookmarkHistoryControls();
  if(redoVisitClearReturn){
   if(by('bookmark-redo-clear-visit-jump-position').disabled)return;
   event.preventDefault();redoClearVisitClearJumpReturnPosition();return;
  }
  if(by('bookmark-undo-clear-visit-jump-position').disabled)return;
  event.preventDefault();undoClearVisitClearJumpReturnPosition();return;
 }
 if(loopKey==='j'){
  updateBookmarkHistoryControls();if(by('bookmark-visit-clear-jump-return').disabled)return;
  event.preventDefault();
  if(clearVisitClearReturn)return clearVisitClearJumpReturnPosition();
  return act(returnVisitClearJump);
 }
 if(loopKey==='h'){
  updateBookmarkHistoryControls();
  if(redoVisitReturn){
   if(by('bookmark-redo-clear-target-jump-position').disabled)return;
   event.preventDefault();redoClearTargetJumpReturnPosition();return;
  }
  if(by('bookmark-undo-clear-target-jump-position').disabled)return;
  event.preventDefault();undoClearTargetJumpReturnPosition();return;
 }
 if(loopKey==='g'){
  updateBookmarkHistoryControls();if(by('bookmark-target-clear-jump-return').disabled)return;
  event.preventDefault();
  if(clearVisitReturn){clearTargetJumpReturnPosition();return}
  return act(returnTargetClearJump);
 }
 if(loopKey==='y'&&!event.ctrlKey){
  updateBookmarkHistoryControls();
  if(redoTargetPosition){
   if(by('bookmark-redo-clear-target-position').disabled)return;
   event.preventDefault();redoClearTargetReturnPosition();return;
  }
  if(by('bookmark-undo-clear-target-position').disabled)return;
  event.preventDefault();undoClearTargetReturnPosition();return;
 }
 if(loopKey==='t'){
  updateBookmarkHistoryControls();if(by('bookmark-clear-target-return').disabled)return;
  event.preventDefault();
  if(clearTargetPosition)return clearTargetReturnPosition();
  return act(returnClearTargetJump);
 }
 if(loopKey==='u'){
  updateBookmarkHistoryControls();
  if(redoClearReturn){
   if(by('bookmark-history-redo-clear').disabled)return;
   event.preventDefault();redoClearBookmarkReturn();return;
  }
  if(by('bookmark-history-undo-clear').disabled)return;
  event.preventDefault();undoClearBookmarkReturn();return;
 }
 if(clearReturn){
  updateBookmarkHistoryControls();if(by('bookmark-history-clear-return').disabled)return;
  event.preventDefault();clearBookmarkReturn();return;
 }
 if(loopKey==='r'){
  updateBookmarkHistoryControls();if(by('bookmark-history-return').disabled)return;
  event.preventDefault();return act(returnBookmarkHistory);
 }
 if(redoBookmark){
  const target=redoBookmarkTarget();if(!target||bookmarkJump||progressPreview)return;
  event.preventDefault();return act(()=>confirmBookmarkRemoval(target,true));
 }
 if(undoBookmark){
  if(!undoBookmarkTarget()||bookmarkJump||progressPreview)return;
  event.preventDefault();return act(restoreBookmark);
 }
 if(deleteBookmark){
  const target=bookmarkTarget();
  if(!target||!bookmarkReady||bookmarkWrite||bookmarkJump||!savedBookmark(target))return;
  event.preventDefault();return act(()=>confirmBookmarkRemoval(target));
 }
 if(quickMark||quickTag||quickClear){
  if(by('bookmark-mark').disabled||bookmarkJump)return;
  event.preventDefault();return act(()=>writeBookmark(false,true,quickTag,quickClear));
 }
 if(bookmarkEdge){
  if(!bookmarkReady||bookmarkJump||bookmarkWrite)return;
  const matches=bookmarkNavigation().matches,target=bookmarkEdge==='first'?matches[0]:matches.at(-1);
  if(!target)return;
  event.preventDefault();return act(()=>jumpBookmark(target.row));
 }
 if(clearQuery){
  const search=by('bookmark-search');if(search.disabled)return;
  event.preventDefault();
  if(search.value){search.value='';changeBookmarkFilters()}
  return;
 }
 if(filterTag){
  const select=by('bookmark-filter-tag');if(select.disabled)return;
  event.preventDefault();
  if(select.value!==filterTag){select.value=filterTag;changeBookmarkFilters()}
  return;
 }
 if(loopKey==='c'){
  if(by('bookmark-filter-clear').disabled)return;
  event.preventDefault();clearBookmarkFilterSelection();return;
 }
 if(loopKey==='f'){
  const search=by('bookmark-search');if(search.disabled)return;
  event.preventDefault();search.focus({preventScroll:true});search.scrollIntoView({block:'center',behavior:'auto'});return;
 }
 if(loopKey==='o'){
  const toggle=by('overlay-enabled');if(toggle.disabled)return;
  event.preventDefault();toggle.checked=!toggle.checked;drawOverlay();return;
 }
 if(loopJump){
  const target=playbackShortcutFrame(0,loopKey);if(!target)return;
  event.preventDefault();return act(()=>stepPlaybackShortcut(target));
 }
 if(speedDelta||speedReset){
  const control=by('playback-speed'),current=control.selectedIndex;
  if(control.disabled||current<0)return;
  const next=speedReset?[...control.options].findIndex(option=>Number(option.value)===1):Math.max(0,Math.min(control.options.length-1,current+speedDelta));
  if(next<0)return;
  event.preventDefault();
  if(next!==current){control.selectedIndex=next;updatePlaybackSpeed()}
  return;
 }
 if(loopKey==='m'){
  if(by('bookmark-mark').disabled)return;
  event.preventDefault();markBookmark();return;
 }
 if(loopControl){
  if(by(loopControl).disabled)return;
  event.preventDefault();
  if(loopKey==='l'){by('loop-enabled').checked=!by('loop-enabled').checked;editLoop()}
  else markLoop(loopKey==='a'?'loop-start':'loop-end');
  return;
 }
 if(event.key===' '){
  if(origin.some(replayShortcutNativeSpace))return;
  const playing=playback.getState().playing;
  if(!playing&&(by('playback-play').disabled||bookmarkWrite||bookmarkJump))return;
  event.preventDefault();return playing?pausePlayback():startPlayback();
 }
 if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
  const target=playbackShortcutFrame(event.key==='ArrowLeft'?-1:1);if(!target)return;
  event.preventDefault();return act(()=>stepPlaybackShortcut(target));
 }
 if(event.key==='Home'||event.key==='End'){
  const target=playbackShortcutFrame(0,event.key==='Home'?'first':'last');if(!target)return;
  event.preventDefault();return act(()=>stepPlaybackShortcut(target));
 }
 if(event.key==='PageUp'||event.key==='PageDown'){
  const target=playbackShortcutFrame(event.key==='PageUp'?-10:10);if(!target)return;
  event.preventDefault();return act(()=>stepPlaybackShortcut(target));
 }
 const delta=event.key==='['?-1:1;if(by(delta<0?'bookmark-prev':'bookmark-next').disabled)return;
 event.preventDefault();return act(()=>adjacentBookmark(delta));
}
function renderBookmarks(){
 const list=by('bookmarks-list');list.replaceChildren();
 const tag=bookmarkFilterTag(),matches=filteredBookmarks();
 for(const row of matches){
  const item=document.createElement('li'),button=document.createElement('button'),note=document.createElement('p');
  const ordinal=[...by('frames-list').options].findIndex(o=>o.value===String(row.index))+1;
  button.textContent=tr[lang].replayFrame+' '+ordinal+' / '+by('frames-list').options.length+' · '+
   (row.tags.length?row.tags.map(tag=>tr[lang][bookmarkTagKeys[tag]]).join(' · '):tr[lang].bookmarkGeneral);
  button.setAttribute('data-index',String(row.index));button.onclick=()=>act(()=>jumpBookmark(row));
  note.textContent=row.note;item.append(button,note);list.append(item);
 }
 by('bookmarks-status').textContent=bookmarkLoadError?tr[lang].bookmarksFailed:!bookmarkReady?tr[lang].bookmarksLoading:
  (bookmarkNotice?bookmarkNotice+' · ':'')+(bookmarkRows.length?tr[lang].bookmarksCount+': '+bookmarkRows.length:tr[lang].bookmarksEmpty);
 by('bookmark-filter-tag').disabled=by('bookmark-search').disabled=!bookmarkReady;
 by('bookmark-filter-clear').disabled=!bookmarkReady||(tag==='all'&&!by('bookmark-search').value);
 by('bookmark-filter-status').textContent=!bookmarkReady?'':tr[lang].bookmarkFilterShown+' '+matches.length+' / '+bookmarkRows.length+
  (bookmarkRows.length&&!matches.length?' · '+tr[lang].bookmarkFilterNoMatch:'');
 if(bookmarkJump&&bookmarkJump.kind!=='history'&&!matches.some(row=>row.index===bookmarkJump.row.index&&row.snapshot_sha256===bookmarkJump.row.snapshot_sha256)){cancelBookmarkJump();updatePlaybackControls()}
 updateBookmarkNavigation();
}
function changeBookmarkFilters(){if(bookmarkJump?.kind!=='history'&&cancelBookmarkJump())updatePlaybackControls();renderBookmarks()}
function clearBookmarkFilters(){by('bookmark-filter-tag').value='all';by('bookmark-search').value=''}
function clearBookmarkFilterSelection(){if(bookmarkReady){clearBookmarkFilters();changeBookmarkFilters();by('bookmark-search').focus()}}
function resetBookmarks(){bookmarkUndo=null;bookmarkRedo=null;bookmarkReturn=null;bookmarkReturnCleared=false;bookmarkClearedReturn=null;bookmarkReturnRestored=false;clearTargetReturn=null;clearTargetReturnCleared=false;clearedTargetReturn=null;clearTargetReturnRestored=false;targetClearJumpReturn=null;targetClearJumpReturnCleared=false;targetClearJumpClearedReturn=null;targetClearJumpReturnRestored=false;visitClearJumpReturn=null;visitClearJumpReturnCleared=false;visitClearJumpClearedReturn=null;visitClearJumpReturnRestored=false;visitClearHistoryReturn=null;visitClearHistoryReturnCleared=false;visitClearHistoryClearedReturn=null;visitClearHistoryReturnRestored=false;bookmarkGeneration++;bookmarkRows=[];bookmarkReady=false;bookmarkLoadError=false;bookmarkWrite=null;bookmarkEditorKey=undefined;bookmarkNotice='';resetBookmarkTransfer();clearBookmarkFilters();renderBookmarks()}
async function loadBookmarks(sid,frameGeneration){
 const generation=++bookmarkGeneration;
 const current=()=>generation===bookmarkGeneration&&frameGeneration===framesGeneration&&sid===by('sessions-list').value;
 try{const data=await req('/api/sessions/'+sid+'/bookmarks');if(!current())return;
  bookmarkRows=checkBookmarks(data,sid);bookmarkReady=true;
 }catch(error){if(!current())return;bookmarkLoadError=true;bookmarkReady=false}
 if(current()){bookmarkEditorKey=undefined;renderBookmarks();updateBookmarkEditor()}
}
async function writeBookmark(remove=false,quick=false,addTag=null,clearTags=false,redoTarget=null){
 const target=redoTarget||bookmarkTarget();if(!target||!bookmarkReady||bookmarkWrite)return;
 freezeBookmark();const fields=quick?{note:'',tags:[]}:bookmarkFields();
 if(!remove&&!validBookmarkNote(fields.note)){message(tr[lang].bookmarkInvalid);return}
 const key=bookmarkKey(target),draft=bookmarkDrafts.get(key),token={target,key,framesGeneration};
 const removed=savedBookmark(target);
 if(remove&&!removed)return;
 if(redoTarget&&(!remove||redoBookmarkTarget()!==redoTarget))return;
 bookmarkWrite=token;bookmarkNotice='';invalidateBookmarkImport();updateBookmarkEditor();
 const current=()=>bookmarkWrite===token&&token.framesGeneration===framesGeneration&&target.session_id===by('sessions-list').value;
 try{
  const data=await req('/api/sessions/'+target.session_id+'/frames/'+target.index+'/bookmark',{method:remove?'DELETE':'PUT',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({snapshot_sha256:target.snapshot_sha256,...(redoTarget?{expected_updated_at:redoTarget.updated_at}:{}),...(remove?{}:fields),...(remove?{}:clearTags?{clear_tags:true}:addTag?{add_tag:addTag}:quick?{create_only:true}:{})})});
  if(!current())return;
  bookmarkRows=checkBookmarks(data,target.session_id);bookmarkRedo=null;
  if(remove&&!savedBookmark(target))bookmarkUndo={...target,note:removed.note,tags:removed.tags.slice()};
  else if(!remove&&bookmarkUndo&&bookmarkKey(bookmarkUndo)===key)bookmarkUndo=null;
  if(!quick&&bookmarkDrafts.get(key)===draft)bookmarkDrafts.delete(key);
  if(bookmarkEditorKey===key)bookmarkEditorKey=undefined;
  bookmarkNotice=tr[lang][remove?'bookmarkRemoved':'bookmarkSaved'];
 }catch(error){if(current()){bookmarkNotice=tr[lang].failed+': '+error.message;message(bookmarkNotice)}}
 finally{if(current()){bookmarkWrite=null;renderBookmarks();updateBookmarkEditor()}}
}
function redoBookmarkTarget(){
 const target=bookmarkRedo,saved=savedBookmark(target);
 return target&&bookmarkReady&&!bookmarkWrite&&target.session_id===by('sessions-list').value&&
  savedFrameHashes.get(target.index)===target.snapshot_sha256&&saved&&saved.updated_at===target.updated_at&&
  saved.note===target.note&&JSON.stringify(saved.tags)===JSON.stringify(target.tags)?target:null;
}
function undoBookmarkTarget(){
 const target=bookmarkUndo;
 return target&&bookmarkReady&&!bookmarkWrite&&target.session_id===by('sessions-list').value&&
  savedFrameHashes.get(target.index)===target.snapshot_sha256&&!savedBookmark(target)?target:null;
}
async function restoreBookmark(){
 const target=undoBookmarkTarget();if(!target||bookmarkJump||progressPreview)return;
 freezeBookmark();const token={target,framesGeneration};bookmarkWrite=token;bookmarkNotice='';
 invalidateBookmarkImport();updateBookmarkEditor();
 const current=()=>bookmarkWrite===token&&token.framesGeneration===framesGeneration&&target.session_id===by('sessions-list').value;
 try{
  const data=await req('/api/sessions/'+target.session_id+'/frames/'+target.index+'/bookmark',{method:'PUT',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({snapshot_sha256:target.snapshot_sha256,note:target.note,tags:target.tags,create_only:true})});
  if(!current())return;
  bookmarkRows=checkBookmarks(data,target.session_id);
  const restored=savedBookmark(target);if(!restored)throw Error('Bookmark was not restored');
  const exact=restored.note===target.note&&JSON.stringify(restored.tags)===JSON.stringify(target.tags);
  bookmarkUndo=null;bookmarkRedo=exact?{session_id:target.session_id,...restored,tags:restored.tags.slice()}:null;bookmarkEditorKey=undefined;
  bookmarkNotice=tr[lang][exact?'bookmarkRestored':'bookmarkRestoreKept'];
 }catch(error){if(current()){bookmarkNotice=tr[lang].failed+': '+error.message;message(bookmarkNotice)}}
 finally{if(current()){bookmarkWrite=null;renderBookmarks();updateBookmarkEditor()}}
}
async function jumpBookmarkHistory(kind){
 const id=kind==='undo'?'bookmark-undo-delete':'bookmark-redo-delete';updateBookmarkHistoryControls();
 const target=kind==='undo'?undoBookmarkTarget():redoBookmarkTarget();
 if(!target||by(id+'-jump').disabled)return;
 const origin=bookmarkTarget();
 freezeBookmark();const token={kind:'history',sid:target.session_id,generation:framesGeneration,row:target,
  position:[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&token.sid===by('sessions-list').value&&token.generation===framesGeneration&&
  (kind==='undo'?undoBookmarkTarget():redoBookmarkTarget())===target;
 try{
  if(await presentReplay(token.sid,target.index,valid,true,target.snapshot_sha256)){
   if(origin&&bookmarkKey(origin)!==bookmarkKey(target)){bookmarkReturn={...origin,framesGeneration};bookmarkReturnCleared=false;bookmarkClearedReturn=null;bookmarkReturnRestored=false}
   by('result').focus({preventScroll:true});by('result').scrollIntoView({block:'start',behavior:'smooth'});
  }
 }finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation();updateBookmarkHistoryControls()}}
}
function matchingBookmarkReturn(target){
 return target&&target.framesGeneration===framesGeneration&&
  target.session_id===by('sessions-list').value&&savedFrameHashes.get(target.index)===target.snapshot_sha256?target:null;
}
function validBookmarkReturn(target){return bookmarkReady&&!bookmarkWrite?matchingBookmarkReturn(target):null}
function bookmarkReturnTarget(){return validBookmarkReturn(bookmarkReturn)}
function clearedBookmarkReturnTarget(){return !bookmarkReturn&&bookmarkReturnCleared?validBookmarkReturn(bookmarkClearedReturn):null}
function clearHistoryTarget(kind){return kind==='undo'?clearedBookmarkReturnTarget():bookmarkReturnRestored?bookmarkReturnTarget():null}
async function jumpClearBookmarkHistory(kind){
 const id=kind==='undo'?'bookmark-history-undo-clear':'bookmark-history-redo-clear';updateBookmarkHistoryControls();
 const target=clearHistoryTarget(kind);if(!target||by(id+'-jump').disabled)return;
 const origin=bookmarkTarget();
 freezeBookmark();const token={kind:'history',sid:target.session_id,generation:framesGeneration,row:target,
  position:[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&token.sid===by('sessions-list').value&&token.generation===framesGeneration&&clearHistoryTarget(kind)===target;
 try{
  if(await presentReplay(token.sid,target.index,valid,true,target.snapshot_sha256)){
   if(origin&&bookmarkKey(origin)!==bookmarkKey(target)){clearTargetReturn={...origin,framesGeneration};clearTargetReturnCleared=false;clearedTargetReturn=null;clearTargetReturnRestored=false}
   by('result').focus({preventScroll:true});by('result').scrollIntoView({block:'start',behavior:'smooth'});
  }
 }finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation();updateBookmarkHistoryControls()}}
}
function targetReturnClearHistoryTarget(kind){
 return kind==='undo'?!clearTargetReturn&&clearTargetReturnCleared?validBookmarkReturn(clearedTargetReturn):null:
  clearTargetReturnRestored?validBookmarkReturn(clearTargetReturn):null;
}
async function jumpTargetReturnClearHistory(kind){
 const id='bookmark-'+kind+'-clear-target-position';updateBookmarkHistoryControls();
 const target=targetReturnClearHistoryTarget(kind);if(!target||by(id+'-jump').disabled)return;
 const origin=bookmarkTarget();
 freezeBookmark();const token={kind:'history',sid:target.session_id,generation:framesGeneration,row:target,
  position:[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&token.sid===by('sessions-list').value&&token.generation===framesGeneration&&targetReturnClearHistoryTarget(kind)===target;
 try{
  if(await presentReplay(token.sid,target.index,valid,true,target.snapshot_sha256)){
   if(origin&&bookmarkKey(origin)!==bookmarkKey(target)){targetClearJumpReturn={...origin,framesGeneration};targetClearJumpReturnCleared=false;targetClearJumpClearedReturn=null;targetClearJumpReturnRestored=false}
   by('result').focus({preventScroll:true});by('result').scrollIntoView({block:'start',behavior:'smooth'});
  }
 }finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation();updateBookmarkHistoryControls()}}
}
function visitReturnClearHistoryTarget(kind){
 return kind==='undo'?!targetClearJumpReturn&&targetClearJumpReturnCleared?validBookmarkReturn(targetClearJumpClearedReturn):null:
  targetClearJumpReturnRestored?validBookmarkReturn(targetClearJumpReturn):null;
}
async function jumpVisitReturnClearHistory(kind){
 const id='bookmark-'+kind+'-clear-target-jump-position';updateBookmarkHistoryControls();
 const target=visitReturnClearHistoryTarget(kind);if(!target||by(id+'-jump').disabled)return;
 const origin=bookmarkTarget();
 freezeBookmark();const token={kind:'history',sid:target.session_id,generation:framesGeneration,row:target,
  position:[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&token.sid===by('sessions-list').value&&token.generation===framesGeneration&&visitReturnClearHistoryTarget(kind)===target;
 try{
  if(await presentReplay(token.sid,target.index,valid,true,target.snapshot_sha256)){
   if(origin&&bookmarkKey(origin)!==bookmarkKey(target)){visitClearJumpReturn={...origin,framesGeneration};visitClearJumpReturnCleared=false;visitClearJumpClearedReturn=null;visitClearJumpReturnRestored=false}
   by('result').focus({preventScroll:true});by('result').scrollIntoView({block:'start',behavior:'smooth'});
  }
 }finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation();updateBookmarkHistoryControls()}}
}
function visitClearReturnHistoryTarget(kind){
 return kind==='undo'?!visitClearJumpReturn&&visitClearJumpReturnCleared?validBookmarkReturn(visitClearJumpClearedReturn):null:
  visitClearJumpReturnRestored?validBookmarkReturn(visitClearJumpReturn):null;
}
async function jumpVisitClearReturnHistory(kind){
 const id='bookmark-'+kind+'-clear-visit-jump-position';updateBookmarkHistoryControls();
 const target=visitClearReturnHistoryTarget(kind);if(!target||by(id+'-jump').disabled)return;
 const origin=bookmarkTarget();
 freezeBookmark();const token={kind:'history',sid:target.session_id,generation:framesGeneration,row:target,
  position:[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&token.sid===by('sessions-list').value&&token.generation===framesGeneration&&visitClearReturnHistoryTarget(kind)===target;
 try{
  if(await presentReplay(token.sid,target.index,valid,true,target.snapshot_sha256)){
   if(origin&&bookmarkKey(origin)!==bookmarkKey(target)){visitClearHistoryReturn={...origin,framesGeneration};visitClearHistoryReturnCleared=false;visitClearHistoryClearedReturn=null;visitClearHistoryReturnRestored=false}
   by('result').focus({preventScroll:true});by('result').scrollIntoView({block:'start',behavior:'smooth'});
  }
 }finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation();updateBookmarkHistoryControls()}}
}
function visitHistoryClearTarget(kind){
 return kind==='undo'?!visitClearHistoryReturn&&visitClearHistoryReturnCleared?validBookmarkReturn(visitClearHistoryClearedReturn):null:
  visitClearHistoryReturnRestored?validBookmarkReturn(visitClearHistoryReturn):null;
}
async function jumpVisitHistoryClearTarget(kind){
 const id='bookmark-'+kind+'-clear-visit-history-position';updateBookmarkHistoryControls();
 const target=visitHistoryClearTarget(kind);if(!target||by(id+'-jump').disabled)return;
 freezeBookmark();const token={kind:'history',sid:target.session_id,generation:framesGeneration,row:target,
  position:[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&token.sid===by('sessions-list').value&&token.generation===framesGeneration&&visitHistoryClearTarget(kind)===target;
 try{
  if(await presentReplay(token.sid,target.index,valid,true,target.snapshot_sha256)){
   by('result').focus({preventScroll:true});by('result').scrollIntoView({block:'start',behavior:'smooth'});
  }
 }finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation();updateBookmarkHistoryControls()}}
}
function clearVisitHistoryReturnPosition(){
 updateBookmarkHistoryControls();if(by('bookmark-clear-visit-history-position').disabled)return;
 visitClearHistoryClearedReturn=visitClearHistoryReturn;visitClearHistoryReturn=null;visitClearHistoryReturnCleared=true;visitClearHistoryReturnRestored=false;updateBookmarkHistoryControls();
}
function redoClearVisitHistoryReturnPosition(){
 updateBookmarkHistoryControls();if(by('bookmark-redo-clear-visit-history-position').disabled)return;
 clearVisitHistoryReturnPosition();
}
function undoClearVisitHistoryReturnPosition(){
 updateBookmarkHistoryControls();if(by('bookmark-undo-clear-visit-history-position').disabled)return;
 visitClearHistoryReturn=visitClearHistoryClearedReturn;visitClearHistoryClearedReturn=null;visitClearHistoryReturnCleared=false;visitClearHistoryReturnRestored=true;updateBookmarkHistoryControls();
}
async function returnVisitClearHistory(){
 updateBookmarkHistoryControls();const target=validBookmarkReturn(visitClearHistoryReturn);
 if(!target||by('bookmark-visit-clear-history-return').disabled)return;
 freezeBookmark();const token={kind:'history',sid:target.session_id,generation:framesGeneration,row:target,
  position:[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&token.sid===by('sessions-list').value&&token.generation===framesGeneration&&validBookmarkReturn(visitClearHistoryReturn)===target;
 try{
  if(await presentReplay(token.sid,target.index,valid,true,target.snapshot_sha256)){
   visitClearHistoryReturn=null;visitClearHistoryReturnCleared=false;visitClearHistoryClearedReturn=null;visitClearHistoryReturnRestored=false;by('result').focus({preventScroll:true});by('result').scrollIntoView({block:'start',behavior:'smooth'});
  }
 }finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation();updateBookmarkHistoryControls()}}
}
function clearVisitClearJumpReturnPosition(){
 updateBookmarkHistoryControls();if(by('bookmark-clear-visit-jump-position').disabled)return;
 visitClearJumpClearedReturn=visitClearJumpReturn;visitClearJumpReturn=null;visitClearJumpReturnCleared=true;visitClearJumpReturnRestored=false;updateBookmarkHistoryControls();
}
function redoClearVisitClearJumpReturnPosition(){
 updateBookmarkHistoryControls();if(by('bookmark-redo-clear-visit-jump-position').disabled)return;
 clearVisitClearJumpReturnPosition();
}
function undoClearVisitClearJumpReturnPosition(){
 updateBookmarkHistoryControls();if(by('bookmark-undo-clear-visit-jump-position').disabled)return;
 visitClearJumpReturn=visitClearJumpClearedReturn;visitClearJumpClearedReturn=null;visitClearJumpReturnCleared=false;visitClearJumpReturnRestored=true;updateBookmarkHistoryControls();
}
async function returnVisitClearJump(){
 updateBookmarkHistoryControls();const target=validBookmarkReturn(visitClearJumpReturn);
 if(!target||by('bookmark-visit-clear-jump-return').disabled)return;
 freezeBookmark();const token={kind:'history',sid:target.session_id,generation:framesGeneration,row:target,
  position:[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&token.sid===by('sessions-list').value&&token.generation===framesGeneration&&validBookmarkReturn(visitClearJumpReturn)===target;
 try{
  if(await presentReplay(token.sid,target.index,valid,true,target.snapshot_sha256)){
   visitClearJumpReturn=null;visitClearJumpReturnCleared=false;visitClearJumpClearedReturn=null;visitClearJumpReturnRestored=false;by('result').focus({preventScroll:true});by('result').scrollIntoView({block:'start',behavior:'smooth'});
  }
 }finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation();updateBookmarkHistoryControls()}}
}
function clearTargetJumpReturnPosition(){
 updateBookmarkHistoryControls();if(by('bookmark-clear-target-jump-position').disabled)return;
 targetClearJumpClearedReturn=targetClearJumpReturn;targetClearJumpReturn=null;targetClearJumpReturnCleared=true;targetClearJumpReturnRestored=false;updateBookmarkHistoryControls();
}
function redoClearTargetJumpReturnPosition(){
 updateBookmarkHistoryControls();if(by('bookmark-redo-clear-target-jump-position').disabled)return;
 clearTargetJumpReturnPosition();
}
function undoClearTargetJumpReturnPosition(){
 updateBookmarkHistoryControls();if(by('bookmark-undo-clear-target-jump-position').disabled)return;
 targetClearJumpReturn=targetClearJumpClearedReturn;targetClearJumpClearedReturn=null;targetClearJumpReturnCleared=false;targetClearJumpReturnRestored=true;updateBookmarkHistoryControls();
}
async function returnTargetClearJump(){
 updateBookmarkHistoryControls();const target=validBookmarkReturn(targetClearJumpReturn);
 if(!target||by('bookmark-target-clear-jump-return').disabled)return;
 freezeBookmark();const token={kind:'history',sid:target.session_id,generation:framesGeneration,row:target,
  position:[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&token.sid===by('sessions-list').value&&token.generation===framesGeneration&&validBookmarkReturn(targetClearJumpReturn)===target;
 try{
  if(await presentReplay(token.sid,target.index,valid,true,target.snapshot_sha256)){
   targetClearJumpReturn=null;targetClearJumpReturnCleared=false;targetClearJumpClearedReturn=null;targetClearJumpReturnRestored=false;by('result').focus({preventScroll:true});by('result').scrollIntoView({block:'start',behavior:'smooth'});
  }
 }finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation();updateBookmarkHistoryControls()}}
}
function clearTargetReturnPosition(){
 updateBookmarkHistoryControls();if(by('bookmark-clear-target-position').disabled)return;
 clearedTargetReturn=clearTargetReturn;clearTargetReturn=null;clearTargetReturnCleared=true;clearTargetReturnRestored=false;updateBookmarkHistoryControls();
}
function redoClearTargetReturnPosition(){
 updateBookmarkHistoryControls();if(by('bookmark-redo-clear-target-position').disabled)return;
 clearTargetReturnPosition();
}
function undoClearTargetReturnPosition(){
 updateBookmarkHistoryControls();if(by('bookmark-undo-clear-target-position').disabled)return;
 clearTargetReturn=clearedTargetReturn;clearedTargetReturn=null;clearTargetReturnCleared=false;clearTargetReturnRestored=true;updateBookmarkHistoryControls();
}
async function returnClearTargetJump(){
 updateBookmarkHistoryControls();const target=validBookmarkReturn(clearTargetReturn);
 if(!target||by('bookmark-clear-target-return').disabled)return;
 freezeBookmark();const token={kind:'history',sid:target.session_id,generation:framesGeneration,row:target,
  position:[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&token.sid===by('sessions-list').value&&token.generation===framesGeneration&&validBookmarkReturn(clearTargetReturn)===target;
 try{
  if(await presentReplay(token.sid,target.index,valid,true,target.snapshot_sha256)){
   clearTargetReturn=null;clearTargetReturnRestored=false;by('result').focus({preventScroll:true});by('result').scrollIntoView({block:'start',behavior:'smooth'});
  }
 }finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation();updateBookmarkHistoryControls()}}
}
function undoClearBookmarkReturn(){
 updateBookmarkHistoryControls();const target=clearedBookmarkReturnTarget();
 if(!target||by('bookmark-history-undo-clear').disabled)return;
 bookmarkReturn=target;bookmarkClearedReturn=null;bookmarkReturnCleared=false;bookmarkReturnRestored=true;updateBookmarkHistoryControls();
}
function redoClearBookmarkReturn(){
 updateBookmarkHistoryControls();if(by('bookmark-history-redo-clear').disabled)return;
 clearBookmarkReturn();
}
function clearBookmarkReturn(){
 updateBookmarkHistoryControls();if(by('bookmark-history-clear-return').disabled)return;
 bookmarkClearedReturn=bookmarkReturnTarget();bookmarkReturn=null;bookmarkReturnCleared=true;bookmarkReturnRestored=false;updateBookmarkHistoryControls();
}
async function returnBookmarkHistory(){
 updateBookmarkHistoryControls();const target=bookmarkReturnTarget();if(!target||by('bookmark-history-return').disabled)return;
 freezeBookmark();const token={kind:'history',sid:target.session_id,generation:framesGeneration,row:target,
  position:[...by('frames-list').options].findIndex(o=>o.value===String(target.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&token.sid===by('sessions-list').value&&token.generation===framesGeneration&&bookmarkReturnTarget()===target;
 try{
  if(await presentReplay(token.sid,target.index,valid,true,target.snapshot_sha256)){
   bookmarkReturn=null;bookmarkReturnCleared=false;bookmarkClearedReturn=null;bookmarkReturnRestored=false;by('result').focus({preventScroll:true});by('result').scrollIntoView({block:'start',behavior:'smooth'});
  }
 }finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation();updateBookmarkHistoryControls()}}
}
async function jumpBookmark(row){
 const sid=by('sessions-list').value,generation=framesGeneration;
 if(!bookmarkReady||!filteredBookmarks().includes(row)||savedFrameHashes.get(row.index)!==row.snapshot_sha256)return;
 freezeBookmark();const token={sid,generation,row,position:[...by('frames-list').options].findIndex(o=>o.value===String(row.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&sid===by('sessions-list').value&&generation===framesGeneration&&
  filteredBookmarks().some(item=>item.index===row.index&&item.snapshot_sha256===row.snapshot_sha256);
 try{if(await presentReplay(sid,row.index,valid,true,row.snapshot_sha256))by('result').scrollIntoView({block:'start',behavior:'smooth'})}
 finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation();updateBookmarkHistoryControls()}}
}

function resetBookmarkTransfer(){bookmarkTransfer=null;by('bookmark-import-file').value='';by('bookmark-import-policy').value='keep'}
function currentBookmarkTransfer(ctx){return ctx&&ctx===bookmarkTransfer&&ctx.sid===by('sessions-list').value&&ctx.generation===framesGeneration}
function invalidateBookmarkImport(){
 if(bookmarkTransfer){bookmarkTransfer.preview=null;bookmarkTransfer.result=null;if(bookmarkTransfer.bytes)bookmarkTransfer.phase='ready'}
}
function updateBookmarkTransferControls(){
 const sid=by('sessions-list').value,available=bookmarkReady&&!!sid,busy=!!bookmarkWrite,ctx=currentBookmarkTransfer(bookmarkTransfer)?bookmarkTransfer:null;
 const policy=by('bookmark-import-policy').value;
 by('bookmark-export').href=available?'/api/sessions/'+sid+'/bookmarks/export':'#';
 by('bookmark-export').setAttribute('aria-disabled',String(!available||busy));
 by('bookmark-import-file').disabled=by('bookmark-import-policy').disabled=!available||busy;
 by('bookmark-import-preview').disabled=!available||busy||!ctx?.bytes;
 by('bookmark-import-apply').disabled=!available||busy||!ctx?.preview||ctx.preview.conflict_policy!==policy;
 let text=tr[lang].bookmarkImportChoose;
 if(ctx){
  const key={reading:'bookmarkFileReading',ready:'bookmarkFileReady',previewing:'bookmarkImportChecking',previewed:'bookmarkImportPreviewed',applying:'bookmarkImportApplying',applied:'bookmarkImportDone'}[ctx.phase];
  text=tr[lang][ctx.errorKey||key]||tr[lang].bookmarkImportChoose;
  const report=ctx.phase==='previewed'?ctx.preview:ctx.phase==='applied'?ctx.result:null;
  if(report){const c=report.counts;text+=' · '+tr[lang].bookmarkImportIncoming+' '+c.incoming+' · '+tr[lang].bookmarkImportAdded+' '+c.added+' · '+tr[lang].bookmarkImportUpdated+' '+c.updated+' · '+tr[lang].bookmarkImportUnchanged+' '+c.unchanged+' · '+tr[lang].bookmarkImportConflicts+' '+c.conflicts}
 }
 if(by('bookmark-import-status').textContent!==text)by('bookmark-import-status').textContent=text;
}
async function selectBookmarkImport(){
 if(!bookmarkReady||bookmarkWrite)return;
 freezeBookmark();
 const file=by('bookmark-import-file').files?.[0];
 if(!file){bookmarkTransfer=null;updateBookmarkTransferControls();return}
 const ctx={sid:by('sessions-list').value,generation:framesGeneration,bytes:null,preview:null,result:null,phase:'reading',errorKey:null};
 bookmarkTransfer=ctx;
 if(!Number.isInteger(file.size)||file.size<=0||file.size>1048576){ctx.phase='error';ctx.errorKey='bookmarkFileLimit';updateBookmarkTransferControls();return}
 updateBookmarkTransferControls();
 try{
  const bytes=new Uint8Array(await file.arrayBuffer());if(!currentBookmarkTransfer(ctx))return;
  if(bytes.byteLength!==file.size||!bytes.byteLength||bytes.byteLength>1048576){ctx.phase='error';ctx.errorKey='bookmarkFileLimit'}
  else{ctx.bytes=bytes;ctx.phase='ready'}
 }catch(error){if(!currentBookmarkTransfer(ctx))return;ctx.phase='error';ctx.errorKey='bookmarkFileReadFailed'}
 if(currentBookmarkTransfer(ctx))updateBookmarkTransferControls();
}
function changeBookmarkImportPolicy(){
 if(!bookmarkReady||bookmarkWrite)return;
 freezeBookmark();invalidateBookmarkImport();if(bookmarkTransfer?.bytes)bookmarkTransfer.errorKey=null;updateBookmarkTransferControls();
}
function checkBookmarkImport(data,ctx,dryRun,policy){
 if(data?.format!=='depthport.bookmark-import.v1'||data.session_id!==ctx.sid||data.dry_run!==dryRun||data.conflict_policy!==policy||
  typeof data.revision!=='string'||!/^[a-f0-9]{64}$/.test(data.revision))throw Error('Invalid bookmark import response');
 const c=data.counts;
 if(!c||['incoming','added','updated','unchanged','conflicts'].some(k=>!Number.isInteger(c[k])||c[k]<0||c[k]>120)||
  c.incoming!==c.added+c.unchanged+c.conflicts||c.updated!==(policy==='overwrite'?c.conflicts:0))throw Error('Invalid bookmark import counts');
 checkBookmarks(data.document,ctx.sid);return data;
}
async function importBookmarks(dryRun){
 const ctx=bookmarkTransfer,policy=by('bookmark-import-policy').value;
 if(!bookmarkReady||bookmarkWrite||!currentBookmarkTransfer(ctx)||!ctx.bytes||!['keep','overwrite'].includes(policy))return;
 const preview=ctx.preview;
 if(!dryRun&&(!preview||preview.conflict_policy!==policy))return;
 freezeBookmark();const token={kind:'import',ctx,dryRun};bookmarkWrite=token;
 ctx.phase=dryRun?'previewing':'applying';ctx.errorKey=null;updateBookmarkEditor();
 const current=()=>bookmarkWrite===token&&currentBookmarkTransfer(ctx);
 try{
  const headers={'Content-Type':'application/json'};if(!dryRun)headers['If-Match']='"'+preview.revision+'"';
  const data=await req('/api/sessions/'+ctx.sid+'/bookmarks/import?conflict='+policy+'&dry_run='+dryRun,{method:'POST',headers,body:ctx.bytes});
  if(!current())return;
  checkBookmarkImport(data,ctx,dryRun,policy);
  if(dryRun){ctx.preview=data;ctx.result=null;ctx.phase='previewed'}
  else{
   bookmarkRows=checkBookmarks(data.document,ctx.sid);bookmarkUndo=null;bookmarkRedo=null;bookmarkEditorKey=undefined;bookmarkNotice=tr[lang].bookmarkImportDone;
   ctx.preview=null;ctx.result=data;ctx.phase='applied';renderBookmarks();
  }
 }catch(error){if(current()){ctx.preview=null;ctx.result=null;ctx.phase='error';ctx.errorKey='bookmarkImportFailed'}}
 finally{if(current()){bookmarkWrite=null;updateBookmarkEditor()}}
}

function metric(v){return typeof v==='number' && Number.isFinite(v) ? v.toFixed(4) : '—'}
function renderConsistency(data){
 lastConsistency=data;
 const box=by('consistency-table');box.replaceChildren();
 const canvas=by('consistency-chart'), ctx=canvas.getContext('2d');
 if(ctx){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#cce5f8';ctx.font='14px system-ui';
   const points=data.pairs.filter(p=>Number.isFinite(p.normalized_mae));
   const left=54,top=20,width=canvas.width-85,height=canvas.height-58;
   ctx.strokeStyle='#52667e';ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,top+height);ctx.lineTo(left+width,top+height);ctx.stroke();
   if(points.length){
     const vmax=Math.max(.01,...points.map(p=>p.normalized_mae));
     ctx.fillText('0',left-14,top+height+17);ctx.fillText(vmax.toFixed(3),4,top+10);
     ctx.strokeStyle='#63d9eb';ctx.lineWidth=2;ctx.beginPath();
     points.forEach((p,i)=>{const x=left+width*(points.length===1?.5:i/(points.length-1));
       const y=top+height*(1-p.normalized_mae/vmax);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();
     points.forEach((p,i)=>{const x=left+width*(points.length===1?.5:i/(points.length-1));
       const y=top+height*(1-p.normalized_mae/vmax);ctx.beginPath();ctx.arc(x,y,3,0,2*Math.PI);ctx.fillStyle='#63d9eb';ctx.fill()});
   }
 }
 if(!data.pairs.length){box.textContent=tr[lang].noPairs;return}
 const table=document.createElement('table'),head=document.createElement('thead'),hr=document.createElement('tr');
 for(const label of [tr[lang].pair,'Model',tr[lang].overlap,tr[lang].normalizedMae,tr[lang].nativeMae]){
   const th=document.createElement('th');th.textContent=label;hr.appendChild(th)}head.appendChild(hr);table.appendChild(head);
 const body=document.createElement('tbody');
 for(const p of data.pairs){const row=document.createElement('tr');
   const cells=['#'+p.from_index+' → #'+p.to_index,p.engine+' ('+p.units+')',metric(p.overlap_fraction),metric(p.normalized_mae),metric(p.native_mae)];
   for(const v of cells){const cell=document.createElement('td');cell.textContent=v;row.appendChild(cell)}body.appendChild(row)}
 table.appendChild(body);box.appendChild(table);
 by('consistency-skips').textContent=data.skipped_pairs.length ? tr[lang].skip+': '+data.skipped_pairs.length : '';
}

function renderTracking(data){
 lastTracking=data;by('tracking-replay').disabled=!data.frames?.length;drawOverlay();
 const target=by('tracking-result');target.replaceChildren();
 const headline=document.createElement('p');headline.textContent=tr[lang].trackCount+': '+data.track_count+' · '+data.frames_considered+' '+tr[lang].trackFrame.toLowerCase()+' · '+(data.association_backend==='roboflow-botsort'?tr[lang].trackBotSort:tr[lang].trackBaseline);target.append(headline);
 if(!data.tracks.length){target.append(document.createTextNode(tr[lang].trackEmpty));return}
 const table=document.createElement('table'),head=document.createElement('tr');
 for(const key of ['Object ID',tr[lang].trackClass,tr[lang].trackFrame,tr[lang].trackDepth,tr[lang].trackXYZ]){
   const th=document.createElement('th');th.textContent=key;head.append(th)}
 table.append(head);
 for(const track of data.tracks){for(const obs of track.observations){
   const row=document.createElement('tr');const pts=obs.xyz_camera_median;
   const cells=[track.object_id,track.label+' ('+track.units+')','#'+obs.index,
       metric(obs.depth_median),pts?pts.map(metric).join(', '):'—'];
   for(const c of cells){const td=document.createElement('td');td.textContent=c;row.append(td)}table.append(row)
 }}target.append(table);
 const warn=document.createElement('p');warn.textContent=tr[lang].trackWarning;target.append(warn);
}
async function loadTracking(){const sid=by('sessions-list').value;const generation=++trackingGeneration;
 lastTracking=null;by('tracking-replay').disabled=true;drawOverlay();by('tracking-result').textContent=tr[lang].trackEmpty;by('tracking-download').hidden=true;
 if(!sid)return;
 try{const report=await req('/api/sessions/'+sid+'/tracking/report.json');
     if(generation!==trackingGeneration||sid!==by('sessions-list').value)return;renderTracking(report);
     by('tracking-download').href='/api/sessions/'+sid+'/tracking/report.json?download=true';by('tracking-download').hidden=false}
 catch(e){if(generation!==trackingGeneration||sid!==by('sessions-list').value)return;if(!String(e.message).includes('404')&&!String(e.message).includes('No saved tracking')){by('tracking-result').textContent=e.message}}
}
async function runTracking(){pausePlayback();const sid=by('sessions-list').value;if(!sid)throw Error('Select a session');
 by('tracking-run').disabled=true;trackingGeneration++;lastTracking=null;by('tracking-replay').disabled=true;
 by('tracking-download').hidden=true;by('tracking-result').textContent=tr[lang].trackRunning;drawOverlay();
 try{await req('/api/sessions/'+sid+'/tracking',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({mode:by('tracking-mode').value,backend:by('tracking-backend').value,confidence:.25,max_frames:12})});
   message(tr[lang].trackRunning);
   for(let attempt=0;attempt<240;attempt++){
     await new Promise(r=>setTimeout(r,1000));
     const j=await req('/api/sessions/'+sid+'/tracking/status');
     if(j.state==='completed'){if(sid===by('sessions-list').value){await loadTracking();message(tr[lang].trackDone)}return}
     if(j.state==='error')throw Error(j.error||'Tracking failed');
   }
   throw Error('Tracking request still running; check status later.')
 }finally{by('tracking-run').disabled=false}
}
async function sessions(){pausePlayback();const status=await req('/api/sessions/status');
 const configured=status.tracking_worker_configured===true;
 by('tracking-backend').querySelector('[value="roboflow-botsort"]').disabled=!configured;
 by('tracking-worker-note').hidden=configured;
 if(!configured)by('tracking-backend').value='baseline';
 const data=await req('/api/sessions');const sel=by('sessions-list'),old=sel.value;
 sel.replaceChildren();for(const s of data.sessions){const opt=document.createElement('option');opt.value=s.session_id;opt.textContent=(s.label||s.session_id.slice(0,8))+' ('+s.frame_count+')';sel.append(opt)}
 if(data.sessions.some(s=>s.session_id===old))sel.value=old;
 await frames();}
async function frames(){
 const generation=++framesGeneration,sid=by('sessions-list').value;clearReplay();trackingGeneration++;lastTracking=null;
 by('tracking-replay').disabled=true;by('tracking-download').hidden=true;by('tracking-result').textContent=tr[lang].trackEmpty;
 const sel=by('frames-list');sel.replaceChildren();savedFrameHashes.clear();resetBookmarks();resetLoop();updateNavigation();
 lastConsistency=null;by('temporal').textContent='';by('consistency-table').replaceChildren();by('consistency-download').hidden=true;
 if(!sid)return;
 const current=()=>generation===framesGeneration&&sid===by('sessions-list').value;
 const data=await req('/api/sessions/'+sid+'/frames');if(!current())return;
 for(const r of data.frames){savedFrameHashes.set(r.index,r.sha256);const o=document.createElement('option');o.value=r.index;o.textContent='#'+r.index+' · '+r.engine+' · '+r.units+' · '+new Date(r.captured_at*1000).toLocaleString();sel.append(o)}
 resetLoop();updateNavigation();
 await loadBookmarks(sid,generation);if(!current())return;
 const t=await req('/api/sessions/'+sid+'/temporal');if(!current())return;by('temporal').textContent=JSON.stringify(t.groups,null,2);
 const report=await req('/api/sessions/'+sid+'/consistency');if(!current())return;
 renderConsistency(report);by('consistency-download').href='/api/sessions/'+sid+'/consistency/report.json';
 by('consistency-download').hidden=false;await loadTracking();}
async function act(fn){try{message('');await fn()}catch(e){message(tr[lang].failed+': '+e.message)}}
by('shortcut-help-open').onclick=toggleShortcutHelp;
by('shortcut-help-close').onclick=()=>{by('shortcut-help-dialog').close();updateShortcutHelpState()};
by('shortcut-help-dialog').onclose=()=>{updateShortcutHelpState();updateBookmarkHistoryControls()};
by('bookmark-delete-cancel').onclick=()=>finishBookmarkDeletePrompt(false);
by('bookmark-delete-confirm').onclick=()=>finishBookmarkDeletePrompt(true);
by('bookmark-delete-dialog').onclose=()=>finishBookmarkDeletePrompt(false);
by('tracking-run').onclick=()=>act(runTracking);
by('refresh').onclick=()=>act(sessions);
by('sessions-list').onchange=()=>act(frames);
by('create').onclick=()=>act(async()=>{pausePlayback();const s=await req('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:by('label').value})});await sessions();by('sessions-list').value=s.session_id;await frames();message(tr[lang].created)});
by('capture').onclick=()=>act(async()=>{pausePlayback();const sid=by('sessions-list').value;if(!sid)throw Error('Select a session');
 await req('/api/sessions/'+sid+'/capture',{method:'POST'});await sessions();message(tr[lang].saved)});
by('replay').onclick=()=>act(replaySelected);
by('frames-list').onchange=()=>act(replaySelected);
by('frame-prev').onclick=()=>act(()=>stepReplay(-1));
by('frame-next').onclick=()=>act(()=>stepReplay(1));
by('overlay-enabled').onchange=drawOverlay;
by('replay-progress').oninput=previewProgress;
by('replay-progress').onchange=()=>act(seekProgress);
by('replay-progress').onpointercancel=pausePlayback;
by('loop-enabled').onchange=editLoop;
for(const id of ['loop-start','loop-end']){by(id).oninput=editLoop;by(id).onchange=editLoop}
by('loop-set-start').onclick=()=>markLoop('loop-start');
by('loop-set-end').onclick=()=>markLoop('loop-end');
by('bookmark-mark').onclick=markBookmark;
by('bookmark-note').onfocus=()=>{if(bookmarkTarget()&&bookmarkReady&&!bookmarkWrite)freezeBookmark()};
by('bookmark-note').oninput=editBookmark;
by('bookmark-note').onkeydown=bookmarkNoteShortcut;
for(const tag of bookmarkTags){by('bookmark-tag-'+tag).onfocus=()=>{if(bookmarkTarget()&&bookmarkReady&&!bookmarkWrite)freezeBookmark()};by('bookmark-tag-'+tag).onchange=editBookmark}
by('bookmark-save').onclick=()=>act(()=>writeBookmark());
by('bookmark-delete').onclick=()=>{const target=bookmarkTarget();if(!by('bookmark-delete').disabled&&!bookmarkDeletePrompt&&target)return act(()=>confirmBookmarkRemoval(target,false,false))};
by('bookmark-history-return').onclick=()=>act(returnBookmarkHistory);
by('bookmark-history-clear-return').onclick=clearBookmarkReturn;
by('bookmark-history-undo-clear').onclick=undoClearBookmarkReturn;
by('bookmark-history-redo-clear').onclick=redoClearBookmarkReturn;
by('bookmark-history-undo-clear-jump').onclick=()=>act(()=>jumpClearBookmarkHistory('undo'));
by('bookmark-history-redo-clear-jump').onclick=()=>act(()=>jumpClearBookmarkHistory('redo'));
by('bookmark-clear-target-return').onclick=()=>act(returnClearTargetJump);
by('bookmark-clear-target-position').onclick=clearTargetReturnPosition;
by('bookmark-undo-clear-target-position').onclick=undoClearTargetReturnPosition;
by('bookmark-redo-clear-target-position').onclick=redoClearTargetReturnPosition;
by('bookmark-undo-clear-target-position-jump').onclick=()=>act(()=>jumpTargetReturnClearHistory('undo'));
by('bookmark-redo-clear-target-position-jump').onclick=()=>act(()=>jumpTargetReturnClearHistory('redo'));
by('bookmark-target-clear-jump-return').onclick=()=>act(returnTargetClearJump);
by('bookmark-clear-target-jump-position').onclick=clearTargetJumpReturnPosition;
by('bookmark-undo-clear-target-jump-position').onclick=undoClearTargetJumpReturnPosition;
by('bookmark-redo-clear-target-jump-position').onclick=redoClearTargetJumpReturnPosition;
by('bookmark-undo-clear-target-jump-position-jump').onclick=()=>act(()=>jumpVisitReturnClearHistory('undo'));
by('bookmark-redo-clear-target-jump-position-jump').onclick=()=>act(()=>jumpVisitReturnClearHistory('redo'));
by('bookmark-visit-clear-jump-return').onclick=()=>act(returnVisitClearJump);
by('bookmark-clear-visit-jump-position').onclick=clearVisitClearJumpReturnPosition;
by('bookmark-undo-clear-visit-jump-position').onclick=undoClearVisitClearJumpReturnPosition;
by('bookmark-redo-clear-visit-jump-position').onclick=redoClearVisitClearJumpReturnPosition;
by('bookmark-undo-clear-visit-jump-position-jump').onclick=()=>act(()=>jumpVisitClearReturnHistory('undo'));
by('bookmark-redo-clear-visit-jump-position-jump').onclick=()=>act(()=>jumpVisitClearReturnHistory('redo'));
by('bookmark-visit-clear-history-return').onclick=()=>act(returnVisitClearHistory);
by('bookmark-clear-visit-history-position').onclick=clearVisitHistoryReturnPosition;
by('bookmark-undo-clear-visit-history-position').onclick=undoClearVisitHistoryReturnPosition;
by('bookmark-redo-clear-visit-history-position').onclick=redoClearVisitHistoryReturnPosition;
by('bookmark-undo-clear-visit-history-position-jump').onclick=()=>act(()=>jumpVisitHistoryClearTarget('undo'));
by('bookmark-redo-clear-visit-history-position-jump').onclick=()=>act(()=>jumpVisitHistoryClearTarget('redo'));
by('bookmark-undo-delete-jump').onclick=()=>act(()=>jumpBookmarkHistory('undo'));
by('bookmark-redo-delete-jump').onclick=()=>act(()=>jumpBookmarkHistory('redo'));
by('bookmark-undo-delete').onclick=()=>{updateBookmarkHistoryControls();if(!by('bookmark-undo-delete').disabled)return act(restoreBookmark)};
by('bookmark-redo-delete').onclick=()=>{updateBookmarkHistoryControls();const target=redoBookmarkTarget();if(!by('bookmark-redo-delete').disabled&&target)return act(()=>confirmBookmarkRemoval(target,true,false))};
by('bookmark-shortcuts-enabled').onchange=updateReplayShortcutHints;
document.addEventListener('keydown',replayShortcut);
document.addEventListener('compositionstart',()=>{bookmarkComposing=true});
document.addEventListener('compositionend',()=>{bookmarkComposing=false});
window.addEventListener('blur',()=>{bookmarkComposing=false});
by('bookmark-filter-tag').onchange=changeBookmarkFilters;
by('bookmark-search').oninput=by('bookmark-search').onsearch=changeBookmarkFilters;
by('bookmark-search').onkeydown=bookmarkSearchShortcut;
by('bookmark-filter-clear').onclick=clearBookmarkFilterSelection;
for(const id of ['bookmark-prev','bookmark-list-prev'])by(id).onclick=()=>act(()=>adjacentBookmark(-1));
for(const id of ['bookmark-next','bookmark-list-next'])by(id).onclick=()=>act(()=>adjacentBookmark(1));
by('bookmark-export').onclick=event=>{if(!bookmarkReady||bookmarkWrite||!by('sessions-list').value){event?.preventDefault();return}freezeBookmark()};
by('bookmark-import-file').onchange=()=>act(selectBookmarkImport);
by('bookmark-import-policy').onchange=changeBookmarkImportPolicy;
by('bookmark-import-preview').onclick=()=>act(()=>importBookmarks(true));
by('bookmark-import-apply').onclick=()=>act(()=>importBookmarks(false));
by('tracking-replay').onclick=()=>act(async()=>{
 const frame=lastTracking?.frames?.[0];if(!frame||lastTracking.session_id!==by('sessions-list').value)return;
 by('frames-list').value=String(frame.index);await replaySelected();by('result').scrollIntoView({block:'start',behavior:'smooth'});
});
function startPlayback(){
 if(by('playback-play').disabled||bookmarkWrite||bookmarkJump)return;
 const sel=by('frames-list');
 playbackRestart=!by('loop-enabled').checked&&currentReplay?.session_id===by('sessions-list').value&&String(currentReplay.index)===sel.value&&sel.selectedIndex===sel.options.length-1;
 playback.play();
}
by('playback-play').onclick=startPlayback;
by('playback-pause').onclick=pausePlayback;
function updatePlaybackSpeed(){playback.setSpeed(Number(by('playback-speed').value))}
by('playback-speed').onchange=updatePlaybackSpeed;
document.addEventListener('visibilitychange',()=>{if(document.hidden){bookmarkComposing=false;pausePlayback()}updateBookmarkHistoryControls()});
window.addEventListener('pagehide',pausePlayback);
if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(drawOverlay);resizeObserver.observe(by('rgb'))}
updatePlaybackControls();
act(sessions);
})();
