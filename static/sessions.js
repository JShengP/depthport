/* SPDX-License-Identifier: AGPL-3.0-only */
(() => {'use strict';
const by=id=>document.getElementById(id);
const tr={
  en:{replayPosition:'Playback progress',replayFrame:'Frame',seekTarget:'Jump to',seekCurrent:'Shown',seekRelease:'Release to seek',seekLoading:'Loading frame',replayNotShown:'No frame replayed',play:'Play',pause:'Pause',playbackSpeed:'Speed',playbackNote:'Saved-frame playback: 1× targets 5 frames/s; loading may slow it down.',playbackPlaying:'Playing',playbackPaused:'Paused',playbackEnded:'End of saved frames',playbackError:'Playback stopped after an error',previousFrame:'Previous frame',nextFrame:'Next frame',overlayToggle:'Tracking boxes and Object IDs',overlayLabel:'Tracking boxes and Object IDs',overlayOff:'Tracking overlay hidden.',overlayMissing:'Run tracking analysis, then replay an analysed frame to see IDs.',overlayUnanalysed:'This frame was not analysed. Use Replay analysed frames or run tracking again.',overlayMismatch:'Tracking result does not match this snapshot. Refresh and rerun analysis.',overlayLoading:'Loading saved image…',overlayEmpty:'No confirmed tracked detections in this frame.',overlayReady:'Tracked detections',replayTracked:'Replay analysed frames',title:'Session / Replay',language:'Language',subtitle:'Manually save completed AI result frames to local storage. No automatic camera recording; replay does not rerun inference.',sessions:'Sessions',label:'Label (optional)',create:'Create session',refresh:'Refresh',capture:'Save latest frame',scope:'Storage is opt-in (ENABLE_SESSION_STORAGE=1), localhost-only and limited to 20 sessions × 120 frames.',frames:'Saved frames',replay:'Replay selected frame',download:'Download exact snapshot ZIP',view:'Recorded RGB, depth & point cloud',rgb:'Aligned RGB',depth:'Depth preview',trend:'Temporal metadata trends',trendNote:'Frame-level depth median only: not tracked pixels, metric drift or motion-compensated geometry.',consistency:'Temporal depth consistency',consistencyNote:'Same-grid pixel comparison only. No motion compensation, calibrated distance accuracy or continuous video recording.',pair:'Saved pair',nativeMae:'Native MAE',normalizedMae:'Shape MAE',overlap:'Valid overlap',downloadReport:'Export temporal JSON',noPairs:'Save two compatible frames to compare.',skip:'Skipped incompatible pairs',warning:'Recorded depth is an AI estimate. Relative depth is not metres; no safety or accuracy certification.',disabled:'Enable local storage with ENABLE_SESSION_STORAGE=1 then restart the app.',saved:'Frame saved',created:'Session created',failed:'Request failed',tracking:'Semantic Object Tracking (offline)',trackingNote:'Manually analyse saved frames with YOLO Detect/Segment. CPU only. Object IDs are heuristic 2D associations, NOT identity or world-space trajectories.',trackBackend:'Association',trackBaseline:'Simple association',trackBotSort:'Roboflow BoT-SORT',trackWorkerMissing:'BoT-SORT is unavailable until the local worker is configured.',trackMode:'Mode',segment:'Instance segmentation',detect:'Bounding-box regions',trackRun:'Analyse saved frames',trackDownload:'Export tracking JSON',trackEmpty:'Run an analysis to see Object IDs, depth and camera-space XYZ history.',trackCount:'Objects',trackFrame:'Frame',trackClass:'Class',trackDepth:'Depth',trackXYZ:'Camera XYZ',trackWarning:'Object association may fail when objects cross or disappear; XYZ is in unverified native depth units.',trackRunning:'Tracking analysis running on saved frames…',trackDone:'Tracking analysis completed'},
  'zh-TW':{replayPosition:'回放進度',replayFrame:'影格',seekTarget:'跳轉至',seekCurrent:'目前顯示',seekRelease:'放開後跳轉',seekLoading:'正在跳轉至',replayNotShown:'尚未回放影格',play:'播放',pause:'暫停',playbackSpeed:'速度',playbackNote:'依保存順序回放：1× 目標為每秒 5 格；載入較慢時會放慢。',playbackPlaying:'播放中',playbackPaused:'已暫停',playbackEnded:'已播至最後一格',playbackError:'播放因錯誤停止',previousFrame:'上一格',nextFrame:'下一格',overlayToggle:'疊加追蹤框與 Object ID',overlayLabel:'追蹤框與 Object ID',overlayOff:'追蹤疊圖已隱藏。',overlayMissing:'請先執行追蹤分析，再回放已分析影格以查看 ID。',overlayUnanalysed:'這格尚未分析；請點「回放已分析影格」，或重新執行追蹤。',overlayMismatch:'追蹤結果與這份快照不符；請重新整理並重跑分析。',overlayLoading:'正在載入已存影像…',overlayEmpty:'這格沒有已確認的追蹤偵測。',overlayReady:'已追蹤偵測數',replayTracked:'回放已分析影格',title:'工作階段／回放',language:'語言',subtitle:'只在手動操作時將已完成的 AI 影格保存到本機；不會自動錄製相機，也不會在回放時重新推論。',sessions:'工作階段',label:'名稱（可不填）',create:'建立工作階段',refresh:'重新整理',capture:'儲存最新影格',scope:'需主動設定 ENABLE_SESSION_STORAGE=1；僅允許本機，最多 20 個工作階段 × 每個 120 影格。',frames:'已儲存影格',replay:'回放選取影格',download:'下載原始快照 ZIP',view:'已保存的 RGB、深度與 3D 點雲',rgb:'對齊 RGB',depth:'深度預覽',trend:'時間序列摘要',trendNote:'只比較影格層級深度中位數；不表示像素追蹤、物理尺度漂移或姿態補償。',consistency:'時間深度一致性',consistencyNote:'只比較相同影像格點的深度；不含運動補償、測距精度驗證或連續錄影。',pair:'保存影格對',nativeMae:'原始單位 MAE',normalizedMae:'形狀 MAE',overlap:'有效重疊比例',downloadReport:'匯出時間分析 JSON',noPairs:'至少保存兩個相容的影格才能比較。',skip:'不相容而略過的影格對',warning:'深度是 AI 估計；相對深度不是公尺，亦無安全／精度認證。',disabled:'請設定 ENABLE_SESSION_STORAGE=1 後重啟應用。',saved:'影格已保存',created:'工作階段已建立',failed:'操作失敗',tracking:'語意物件追蹤（離線）',trackingNote:'手動以 YOLO Detect／Segment 分析已存影格，僅使用 CPU。Object ID 是 2D 關聯結果，不是身份或世界座標軌跡。',trackBackend:'關聯方式',trackBaseline:'簡易關聯',trackBotSort:'Roboflow BoT-SORT',trackWorkerMissing:'本機 worker 尚未設定，BoT-SORT 暫時無法使用。',trackMode:'模式',segment:'實例分割',detect:'方框區域',trackRun:'分析已存影格',trackDownload:'匯出追蹤 JSON',trackEmpty:'執行分析後會顯示 Object ID、深度與相機座標 XYZ 歷史。',trackCount:'物件數',trackFrame:'影格',trackClass:'類別',trackDepth:'深度',trackXYZ:'相機 XYZ',trackWarning:'物件交會或消失可能造成 ID 中斷；XYZ 使用尚未驗證的深度單位。',trackRunning:'正在分析已存影格…',trackDone:'追蹤分析已完成'}
};
let lang=new URLSearchParams(location.search).get('lang');
if(!tr[lang])try{lang=localStorage.getItem('depthport-language')}catch(e){}
if(!tr[lang])lang='en';
function apply(){document.documentElement.lang=lang;by('lang').value=lang;
  document.querySelectorAll('[data-i]').forEach(e=>e.textContent=tr[lang][e.dataset.i]||e.textContent);
  by('tracking-overlay').setAttribute('aria-label',tr[lang].overlayLabel);}
by('lang').onchange=()=>{lang=by('lang').value;try{localStorage.setItem('depthport-language',lang)}catch(e){}apply();if(lastConsistency)renderConsistency(lastConsistency);if(lastTracking)renderTracking(lastTracking);drawOverlay();updatePlaybackControls()};apply();
async function req(url,opt){const r=await fetch(url,{cache:'no-store',...opt});
 let o;try{o=await r.json()}catch(e){o={detail:'Non-JSON response'}}
 if(!r.ok)throw Error(o.detail||('HTTP '+r.status));return o;}
function message(s){by('status').textContent=s}
let viewer=null,lastConsistency=null,lastTracking=null,currentReplay=null;
let replayGeneration=0,framesGeneration=0,trackingGeneration=0,replayLoading=false;
let resizeObserver=null,playbackRestart=false,progressPreview=null;
const playback=window.DepthPortReplayPlayback.create({advance:advancePlayback,onState:updatePlaybackControls,
 onError:()=>message(tr[lang].failed+': '+tr[lang].playbackError)});
function updatePlaybackControls(){
 const state=playback.getState(),available=by('frames-list').options.length>0;
 by('playback-play').disabled=state.playing||!available||replayLoading||progressPreview!==null;
 by('playback-pause').disabled=!state.playing;
 const key={playing:'playbackPlaying',paused:'playbackPaused',ended:'playbackEnded',error:'playbackError'}[state.status];
 const text=tr[lang][key]+' · '+state.speed+'×';
 if(by('playback-status').textContent!==text)by('playback-status').textContent=text;
 by('overlay-status').setAttribute('aria-live',state.playing?'off':'polite');updateProgress();
}
function pausePlayback(){playbackRestart=false;progressPreview=null;playback.pause()}
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
async function presentReplay(sid,index,valid=()=>true,keepPrevious=false){
 const generation=++replayGeneration;
 if(!keepPrevious){currentReplay=null;by('result').hidden=true;by('tracking-overlay').replaceChildren();by('overlay-status').textContent='';by('download').hidden=true}
 replayLoading=true;updatePlaybackControls();
 const current=()=>generation===replayGeneration&&sid===by('sessions-list').value&&valid();
 try{
  const data=await req('/api/sessions/'+sid+'/frames/'+index+'/replay');
  if(!current())return false;
  if(data.session_id!==sid||String(data.index)!==String(index))throw Error('Saved frame response does not match selection');
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
 const next=playbackRestart?0:sel.selectedIndex+(isShown?1:0);
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
 const sel=by('frames-list');sel.replaceChildren();updateNavigation();
 lastConsistency=null;by('temporal').textContent='';by('consistency-table').replaceChildren();by('consistency-download').hidden=true;
 if(!sid)return;
 const current=()=>generation===framesGeneration&&sid===by('sessions-list').value;
 const data=await req('/api/sessions/'+sid+'/frames');if(!current())return;
 for(const r of data.frames){const o=document.createElement('option');o.value=r.index;o.textContent='#'+r.index+' · '+r.engine+' · '+r.units+' · '+new Date(r.captured_at*1000).toLocaleString();sel.append(o)}
 updateNavigation();
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
by('tracking-replay').onclick=()=>act(async()=>{
 const frame=lastTracking?.frames?.[0];if(!frame||lastTracking.session_id!==by('sessions-list').value)return;
 by('frames-list').value=String(frame.index);await replaySelected();by('result').scrollIntoView({block:'start',behavior:'smooth'});
});
by('playback-play').onclick=()=>{
 const sel=by('frames-list');
 playbackRestart=currentReplay?.session_id===by('sessions-list').value&&String(currentReplay.index)===sel.value&&sel.selectedIndex===sel.options.length-1;
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
