/* SPDX-License-Identifier: AGPL-3.0-only */
(() => {'use strict';
const by=id=>document.getElementById(id);
const tr={
  en:{bookmarkReplayNav:'Replay bookmark navigation',bookmarkListNav:'Filtered bookmark navigation',bookmarkPrevious:'Previous bookmark',bookmarkNext:'Next bookmark',bookmarkNavCurrent:'Bookmark',bookmarkNavOutside:'Shown frame is outside the filtered bookmarks',bookmarkNavStart:'Next opens the first matching bookmark',bookmarkNavLoading:'Loading bookmark',bookmarkFind:'Find bookmarks',bookmarkFilterTag:'Tag',bookmarkFilterAll:'All tags',bookmarkSearch:'Search saved notes',bookmarkFilterClear:'Clear filters',bookmarkFilterHelp:'Tag and note keyword must both match. Search is literal and ignores English case.',bookmarkFilterShown:'Shown',bookmarkFilterNoMatch:'No matching bookmarks.',bookmarkBackup:'JSON backup / restore',bookmarkBackupNote:'Export saved bookmarks only; save drafts first. This JSON contains notes, not images. Restore requires the original Session and frames.',bookmarkExport:'Export JSON',bookmarkImportFile:'Local bookmark JSON (up to 1 MiB)',bookmarkImportPolicy:'Same-frame conflicts',bookmarkImportKeep:'Keep local content',bookmarkImportOverwrite:'Use imported content',bookmarkImportPreview:'Preview import',bookmarkImportApply:'Apply import',bookmarkImportChoose:'Choose a local JSON file, then preview before applying.',bookmarkFileReading:'Reading local JSON…',bookmarkFileReady:'File ready. Preview before applying.',bookmarkFileLimit:'Choose a nonempty JSON file up to 1 MiB.',bookmarkFileReadFailed:'Could not read this local file. Select it again.',bookmarkImportChecking:'Checking import…',bookmarkImportPreviewed:'Preview only · not saved',bookmarkImportApplying:'Applying import…',bookmarkImportDone:'Import complete',bookmarkImportFailed:'Import did not complete. Check the file and preview again.',bookmarkImportAdded:'Add',bookmarkImportUpdated:'Update',bookmarkImportUnchanged:'Unchanged',bookmarkImportConflicts:'Same-frame differences',bookmarkImportIncoming:'Incoming',bookmarksTitle:'Frame bookmarks & notes',bookmarksNote:'Mark a shown frame to pause playback, add tags and a note, then Save. Saved bookmarks stay in this local Session.',bookmarkMark:'Mark shown frame',bookmarkTags:'Review tags (optional)',bookmarkIdSwitch:'Suspected ID switch',bookmarkOcclusion:'Occlusion',bookmarkCrossing:'Object crossing',bookmarkNote:'Note (up to 1000 characters)',bookmarkSave:'Save frame bookmark',bookmarkDelete:'Remove frame bookmark',bookmarksLoading:'Loading local bookmarks…',bookmarksEmpty:'No saved bookmarks in this Session.',bookmarksCount:'Saved bookmarks',bookmarksFailed:'Could not load local bookmarks. Refresh to retry.',bookmarkChoose:'Replay a frame to add or edit its bookmark.',bookmarkNew:'No saved bookmark',bookmarkSaved:'Bookmark saved',bookmarkRemoved:'Bookmark removed',bookmarkDraft:'Unsaved changes',bookmarkInvalid:'Use up to 1000 text characters; control characters are not allowed.',bookmarkSaving:'Saving bookmark…',bookmarkGeneral:'General bookmark',loopTitle:'A/B loop',loopEnable:'Loop A–B',loopStart:'A · Start frame',loopEnd:'B · End frame',loopSetStart:'Set A to shown frame',loopSetEnd:'Set B to shown frame',loopUnavailable:'Save at least two frames to loop.',loopInvalid:'Choose whole-frame positions with A before B.',loopReady:'Loop enabled · Press Play to repeat',loopOff:'Loop off · Saved-frame positions, including both endpoints',replayPosition:'Playback progress',replayFrame:'Frame',seekTarget:'Jump to',seekCurrent:'Shown',seekRelease:'Release to seek',seekLoading:'Loading frame',replayNotShown:'No frame replayed',play:'Play',pause:'Pause',playbackSpeed:'Speed',playbackNote:'Saved-frame playback: 1× targets 5 frames/s; loading may slow it down.',playbackPlaying:'Playing',playbackPaused:'Paused',playbackEnded:'End of saved frames',playbackError:'Playback stopped after an error',previousFrame:'Previous frame',nextFrame:'Next frame',overlayToggle:'Tracking boxes and Object IDs',overlayLabel:'Tracking boxes and Object IDs',overlayOff:'Tracking overlay hidden.',overlayMissing:'Run tracking analysis, then replay an analysed frame to see IDs.',overlayUnanalysed:'This frame was not analysed. Use Replay analysed frames or run tracking again.',overlayMismatch:'Tracking result does not match this snapshot. Refresh and rerun analysis.',overlayLoading:'Loading saved image…',overlayEmpty:'No confirmed tracked detections in this frame.',overlayReady:'Tracked detections',replayTracked:'Replay analysed frames',title:'Session / Replay',language:'Language',subtitle:'Manually save completed AI result frames to local storage. No automatic camera recording; replay does not rerun inference.',sessions:'Sessions',label:'Label (optional)',create:'Create session',refresh:'Refresh',capture:'Save latest frame',scope:'Storage is opt-in (ENABLE_SESSION_STORAGE=1), localhost-only and limited to 20 sessions × 120 frames.',frames:'Saved frames',replay:'Replay selected frame',download:'Download exact snapshot ZIP',view:'Recorded RGB, depth & point cloud',rgb:'Aligned RGB',depth:'Depth preview',trend:'Temporal metadata trends',trendNote:'Frame-level depth median only: not tracked pixels, metric drift or motion-compensated geometry.',consistency:'Temporal depth consistency',consistencyNote:'Same-grid pixel comparison only. No motion compensation, calibrated distance accuracy or continuous video recording.',pair:'Saved pair',nativeMae:'Native MAE',normalizedMae:'Shape MAE',overlap:'Valid overlap',downloadReport:'Export temporal JSON',noPairs:'Save two compatible frames to compare.',skip:'Skipped incompatible pairs',warning:'Recorded depth is an AI estimate. Relative depth is not metres; no safety or accuracy certification.',disabled:'Enable local storage with ENABLE_SESSION_STORAGE=1 then restart the app.',saved:'Frame saved',created:'Session created',failed:'Request failed',tracking:'Semantic Object Tracking (offline)',trackingNote:'Manually analyse saved frames with YOLO Detect/Segment. CPU only. Object IDs are heuristic 2D associations, NOT identity or world-space trajectories.',trackBackend:'Association',trackBaseline:'Simple association',trackBotSort:'Roboflow BoT-SORT',trackWorkerMissing:'BoT-SORT is unavailable until the local worker is configured.',trackMode:'Mode',segment:'Instance segmentation',detect:'Bounding-box regions',trackRun:'Analyse saved frames',trackDownload:'Export tracking JSON',trackEmpty:'Run an analysis to see Object IDs, depth and camera-space XYZ history.',trackCount:'Objects',trackFrame:'Frame',trackClass:'Class',trackDepth:'Depth',trackXYZ:'Camera XYZ',trackWarning:'Object association may fail when objects cross or disappear; XYZ is in unverified native depth units.',trackRunning:'Tracking analysis running on saved frames…',trackDone:'Tracking analysis completed'},
  'zh-TW':{bookmarkReplayNav:'回放書籤跳轉',bookmarkListNav:'篩選書籤跳轉',bookmarkPrevious:'上一個書籤',bookmarkNext:'下一個書籤',bookmarkNavCurrent:'書籤',bookmarkNavOutside:'目前影格不在篩選書籤中',bookmarkNavStart:'按下一個前往第一個符合的書籤',bookmarkNavLoading:'正在載入書籤',bookmarkFind:'快速尋找書籤',bookmarkFilterTag:'標籤',bookmarkFilterAll:'全部標籤',bookmarkSearch:'搜尋已儲存的備註',bookmarkFilterClear:'清除條件',bookmarkFilterHelp:'標籤與備註關鍵字需同時符合；以字面文字比對，不分英文大小寫。',bookmarkFilterShown:'顯示',bookmarkFilterNoMatch:'沒有符合條件的書籤。',bookmarkBackup:'JSON 備份／還原',bookmarkBackupNote:'匯出只包含已儲存的書籤，草稿請先儲存。JSON 含備註、不含影像；還原時仍需原本的 Session 與影格。',bookmarkExport:'匯出 JSON',bookmarkImportFile:'本機書籤 JSON（最多 1 MiB）',bookmarkImportPolicy:'同影格內容不同時',bookmarkImportKeep:'保留本機內容',bookmarkImportOverwrite:'使用匯入內容覆寫',bookmarkImportPreview:'檢查匯入',bookmarkImportApply:'套用匯入',bookmarkImportChoose:'請選擇本機 JSON，先檢查預覽再套用。',bookmarkFileReading:'正在讀取本機 JSON…',bookmarkFileReady:'檔案已讀取，請先檢查匯入。',bookmarkFileLimit:'請選擇非空白且不超過 1 MiB 的 JSON 檔案。',bookmarkFileReadFailed:'無法讀取本機檔案，請重新選取。',bookmarkImportChecking:'正在檢查匯入…',bookmarkImportPreviewed:'匯入預覽 · 尚未儲存',bookmarkImportApplying:'正在套用匯入…',bookmarkImportDone:'書籤匯入完成',bookmarkImportFailed:'匯入未完成，請檢查檔案並重新預覽。',bookmarkImportAdded:'新增',bookmarkImportUpdated:'更新',bookmarkImportUnchanged:'相同',bookmarkImportConflicts:'同格差異',bookmarkImportIncoming:'檔案書籤數',bookmarksTitle:'影格書籤與備註',bookmarksNote:'標記目前顯示的影格會暫停回放；選擇標籤、填寫備註後按儲存。已存書籤只保留在本機 Session。',bookmarkMark:'標記目前影格',bookmarkTags:'檢查標籤（可多選）',bookmarkIdSwitch:'疑似換 ID',bookmarkOcclusion:'遮擋',bookmarkCrossing:'物件交會',bookmarkNote:'備註（最多 1000 字）',bookmarkSave:'儲存影格書籤',bookmarkDelete:'移除影格書籤',bookmarksLoading:'正在讀取本機書籤…',bookmarksEmpty:'此 Session 尚無已存書籤。',bookmarksCount:'已存書籤數',bookmarksFailed:'無法讀取本機書籤，請重新整理再試。',bookmarkChoose:'請先回放影格，再新增或編輯書籤。',bookmarkNew:'尚未建立書籤',bookmarkSaved:'書籤已儲存',bookmarkRemoved:'書籤已移除',bookmarkDraft:'尚未儲存的變更',bookmarkInvalid:'備註最多 1000 字，不可含控制字元。',bookmarkSaving:'正在儲存書籤…',bookmarkGeneral:'一般書籤',loopTitle:'A／B 區間循環',loopEnable:'循環播放 A–B',loopStart:'A · 起始影格',loopEnd:'B · 結束影格',loopSetStart:'將目前影格設為 A',loopSetEnd:'將目前影格設為 B',loopUnavailable:'至少保存兩個影格才能循環播放。',loopInvalid:'請輸入整數影格位置，A 必須小於 B。',loopReady:'已啟用循環 · 按播放反覆觀看',loopOff:'循環已關閉 · 使用保存順序，包含起訖影格',replayPosition:'回放進度',replayFrame:'影格',seekTarget:'跳轉至',seekCurrent:'目前顯示',seekRelease:'放開後跳轉',seekLoading:'正在跳轉至',replayNotShown:'尚未回放影格',play:'播放',pause:'暫停',playbackSpeed:'速度',playbackNote:'依保存順序回放：1× 目標為每秒 5 格；載入較慢時會放慢。',playbackPlaying:'播放中',playbackPaused:'已暫停',playbackEnded:'已播至最後一格',playbackError:'播放因錯誤停止',previousFrame:'上一格',nextFrame:'下一格',overlayToggle:'疊加追蹤框與 Object ID',overlayLabel:'追蹤框與 Object ID',overlayOff:'追蹤疊圖已隱藏。',overlayMissing:'請先執行追蹤分析，再回放已分析影格以查看 ID。',overlayUnanalysed:'這格尚未分析；請點「回放已分析影格」，或重新執行追蹤。',overlayMismatch:'追蹤結果與這份快照不符；請重新整理並重跑分析。',overlayLoading:'正在載入已存影像…',overlayEmpty:'這格沒有已確認的追蹤偵測。',overlayReady:'已追蹤偵測數',replayTracked:'回放已分析影格',title:'工作階段／回放',language:'語言',subtitle:'只在手動操作時將已完成的 AI 影格保存到本機；不會自動錄製相機，也不會在回放時重新推論。',sessions:'工作階段',label:'名稱（可不填）',create:'建立工作階段',refresh:'重新整理',capture:'儲存最新影格',scope:'需主動設定 ENABLE_SESSION_STORAGE=1；僅允許本機，最多 20 個工作階段 × 每個 120 影格。',frames:'已儲存影格',replay:'回放選取影格',download:'下載原始快照 ZIP',view:'已保存的 RGB、深度與 3D 點雲',rgb:'對齊 RGB',depth:'深度預覽',trend:'時間序列摘要',trendNote:'只比較影格層級深度中位數；不表示像素追蹤、物理尺度漂移或姿態補償。',consistency:'時間深度一致性',consistencyNote:'只比較相同影像格點的深度；不含運動補償、測距精度驗證或連續錄影。',pair:'保存影格對',nativeMae:'原始單位 MAE',normalizedMae:'形狀 MAE',overlap:'有效重疊比例',downloadReport:'匯出時間分析 JSON',noPairs:'至少保存兩個相容的影格才能比較。',skip:'不相容而略過的影格對',warning:'深度是 AI 估計；相對深度不是公尺，亦無安全／精度認證。',disabled:'請設定 ENABLE_SESSION_STORAGE=1 後重啟應用。',saved:'影格已保存',created:'工作階段已建立',failed:'操作失敗',tracking:'語意物件追蹤（離線）',trackingNote:'手動以 YOLO Detect／Segment 分析已存影格，僅使用 CPU。Object ID 是 2D 關聯結果，不是身份或世界座標軌跡。',trackBackend:'關聯方式',trackBaseline:'簡易關聯',trackBotSort:'Roboflow BoT-SORT',trackWorkerMissing:'本機 worker 尚未設定，BoT-SORT 暫時無法使用。',trackMode:'模式',segment:'實例分割',detect:'方框區域',trackRun:'分析已存影格',trackDownload:'匯出追蹤 JSON',trackEmpty:'執行分析後會顯示 Object ID、深度與相機座標 XYZ 歷史。',trackCount:'物件數',trackFrame:'影格',trackClass:'類別',trackDepth:'深度',trackXYZ:'相機 XYZ',trackWarning:'物件交會或消失可能造成 ID 中斷；XYZ 使用尚未驗證的深度單位。',trackRunning:'正在分析已存影格…',trackDone:'追蹤分析已完成'}
};
let lang=new URLSearchParams(location.search).get('lang');
if(!tr[lang])try{lang=localStorage.getItem('depthport-language')}catch(e){}
if(!tr[lang])lang='en';
function apply(){document.documentElement.lang=lang;by('lang').value=lang;
  document.querySelectorAll('[data-i]').forEach(e=>e.textContent=tr[lang][e.dataset.i]||e.textContent);
  by('tracking-overlay').setAttribute('aria-label',tr[lang].overlayLabel);}
by('lang').onchange=()=>{lang=by('lang').value;try{localStorage.setItem('depthport-language',lang)}catch(e){}apply();if(lastConsistency)renderConsistency(lastConsistency);if(lastTracking)renderTracking(lastTracking);drawOverlay();renderBookmarks();updatePlaybackControls()};apply();
async function req(url,opt){const r=await fetch(url,{cache:'no-store',...opt});
 let o;try{o=await r.json()}catch(e){o={detail:'Non-JSON response'}}
 if(!r.ok)throw Error(o.detail||('HTTP '+r.status));return o;}
function message(s){by('status').textContent=s}
let viewer=null,lastConsistency=null,lastTracking=null,currentReplay=null;
let replayGeneration=0,framesGeneration=0,trackingGeneration=0,replayLoading=false;
let resizeObserver=null,playbackRestart=false,progressPreview=null;
let bookmarkRows=[],bookmarkReady=false,bookmarkLoadError=false,bookmarkGeneration=0,bookmarkWrite=null,bookmarkEditorKey=null,bookmarkNotice='';
let bookmarkTransfer=null,bookmarkJump=null;
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
 updateBookmarkTransferControls();updateBookmarkNavigation();
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
 if(bookmarkJump&&!matches.some(row=>row.index===bookmarkJump.row.index&&row.snapshot_sha256===bookmarkJump.row.snapshot_sha256)){cancelBookmarkJump();updatePlaybackControls()}
 updateBookmarkNavigation();
}
function changeBookmarkFilters(){if(cancelBookmarkJump())updatePlaybackControls();renderBookmarks()}
function clearBookmarkFilters(){by('bookmark-filter-tag').value='all';by('bookmark-search').value=''}
function resetBookmarks(){bookmarkGeneration++;bookmarkRows=[];bookmarkReady=false;bookmarkLoadError=false;bookmarkWrite=null;bookmarkEditorKey=undefined;bookmarkNotice='';resetBookmarkTransfer();clearBookmarkFilters();renderBookmarks()}
async function loadBookmarks(sid,frameGeneration){
 const generation=++bookmarkGeneration;
 const current=()=>generation===bookmarkGeneration&&frameGeneration===framesGeneration&&sid===by('sessions-list').value;
 try{const data=await req('/api/sessions/'+sid+'/bookmarks');if(!current())return;
  bookmarkRows=checkBookmarks(data,sid);bookmarkReady=true;
 }catch(error){if(!current())return;bookmarkLoadError=true;bookmarkReady=false}
 if(current()){bookmarkEditorKey=undefined;renderBookmarks();updateBookmarkEditor()}
}
async function writeBookmark(remove=false){
 const target=bookmarkTarget();if(!target||!bookmarkReady||bookmarkWrite)return;
 freezeBookmark();const fields=bookmarkFields();
 if(!remove&&!validBookmarkNote(fields.note)){message(tr[lang].bookmarkInvalid);return}
 const key=bookmarkKey(target),draft=bookmarkDrafts.get(key),token={target,key,framesGeneration};
 if(remove&&!savedBookmark(target))return;
 bookmarkWrite=token;bookmarkNotice='';invalidateBookmarkImport();updateBookmarkEditor();
 const current=()=>bookmarkWrite===token&&token.framesGeneration===framesGeneration&&target.session_id===by('sessions-list').value;
 try{
  const data=await req('/api/sessions/'+target.session_id+'/frames/'+target.index+'/bookmark',{method:remove?'DELETE':'PUT',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({snapshot_sha256:target.snapshot_sha256,...(remove?{}:fields)})});
  if(!current())return;
  bookmarkRows=checkBookmarks(data,target.session_id);
  if(bookmarkDrafts.get(key)===draft)bookmarkDrafts.delete(key);
  if(bookmarkEditorKey===key)bookmarkEditorKey=undefined;
  bookmarkNotice=tr[lang][remove?'bookmarkRemoved':'bookmarkSaved'];
 }catch(error){if(current()){bookmarkNotice=tr[lang].failed+': '+error.message;message(bookmarkNotice)}}
 finally{if(current()){bookmarkWrite=null;renderBookmarks();updateBookmarkEditor()}}
}
async function jumpBookmark(row){
 const sid=by('sessions-list').value,generation=framesGeneration;
 if(!bookmarkReady||!filteredBookmarks().includes(row)||savedFrameHashes.get(row.index)!==row.snapshot_sha256)return;
 freezeBookmark();const token={sid,generation,row,position:[...by('frames-list').options].findIndex(o=>o.value===String(row.index))+1};bookmarkJump=token;
 const valid=()=>bookmarkJump===token&&sid===by('sessions-list').value&&generation===framesGeneration&&
  filteredBookmarks().some(item=>item.index===row.index&&item.snapshot_sha256===row.snapshot_sha256);
 try{if(await presentReplay(sid,row.index,valid,true,row.snapshot_sha256))by('result').scrollIntoView({block:'start',behavior:'smooth'})}
 finally{if(bookmarkJump===token){bookmarkJump=null;updateBookmarkNavigation()}}
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
   bookmarkRows=checkBookmarks(data.document,ctx.sid);bookmarkEditorKey=undefined;bookmarkNotice=tr[lang].bookmarkImportDone;
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
for(const tag of bookmarkTags){by('bookmark-tag-'+tag).onfocus=()=>{if(bookmarkTarget()&&bookmarkReady&&!bookmarkWrite)freezeBookmark()};by('bookmark-tag-'+tag).onchange=editBookmark}
by('bookmark-save').onclick=()=>act(()=>writeBookmark());
by('bookmark-delete').onclick=()=>act(()=>writeBookmark(true));
by('bookmark-filter-tag').onchange=changeBookmarkFilters;
by('bookmark-search').oninput=by('bookmark-search').onsearch=changeBookmarkFilters;
by('bookmark-filter-clear').onclick=()=>{if(bookmarkReady){clearBookmarkFilters();changeBookmarkFilters();by('bookmark-search').focus()}};
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
by('playback-play').onclick=()=>{
 if(by('playback-play').disabled)return;
 const sel=by('frames-list');
 playbackRestart=!by('loop-enabled').checked&&currentReplay?.session_id===by('sessions-list').value&&String(currentReplay.index)===sel.value&&sel.selectedIndex===sel.options.length-1;
 playback.play();
};
by('playback-pause').onclick=pausePlayback;
by('playback-speed').onchange=()=>playback.setSpeed(Number(by('playback-speed').value));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePlayback()});
window.addEventListener('pagehide',pausePlayback);
if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(drawOverlay);resizeObserver.observe(by('rgb'))}
updatePlaybackControls();
act(sessions);
})();
