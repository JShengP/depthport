/* SPDX-License-Identifier: AGPL-3.0-only */
(() => {'use strict';
const by=id=>document.getElementById(id);
const tr={
  en:{title:'Session / Replay',language:'Language',subtitle:'Manually save completed AI result frames to local storage. No automatic camera recording; replay does not rerun inference.',sessions:'Sessions',label:'Label (optional)',create:'Create session',refresh:'Refresh',capture:'Save latest frame',scope:'Storage is opt-in (ENABLE_SESSION_STORAGE=1), localhost-only and limited to 20 sessions × 120 frames.',frames:'Saved frames',replay:'Replay selected frame',download:'Download exact snapshot ZIP',view:'Recorded RGB, depth & point cloud',rgb:'Aligned RGB',depth:'Depth preview',trend:'Temporal metadata trends',trendNote:'Frame-level depth median only: not tracked pixels, metric drift or motion-compensated geometry.',warning:'Recorded depth is an AI estimate. Relative depth is not metres; no safety or accuracy certification.',disabled:'Enable local storage with ENABLE_SESSION_STORAGE=1 then restart the app.',saved:'Frame saved',created:'Session created',failed:'Request failed'},
  'zh-TW':{title:'工作階段／回放',language:'語言',subtitle:'只在手動操作時將已完成的 AI 影格保存到本機；不會自動錄製相機，也不會在回放時重新推論。',sessions:'工作階段',label:'名稱（可不填）',create:'建立工作階段',refresh:'重新整理',capture:'儲存最新影格',scope:'需主動設定 ENABLE_SESSION_STORAGE=1；僅允許本機，最多 20 個工作階段 × 每個 120 影格。',frames:'已儲存影格',replay:'回放選取影格',download:'下載原始快照 ZIP',view:'已保存的 RGB、深度與 3D 點雲',rgb:'對齊 RGB',depth:'深度預覽',trend:'時間序列摘要',trendNote:'只比較影格層級深度中位數；不表示像素追蹤、物理尺度漂移或姿態補償。',warning:'深度是 AI 估計；相對深度不是公尺，亦無安全／精度認證。',disabled:'請設定 ENABLE_SESSION_STORAGE=1 後重啟應用。',saved:'影格已保存',created:'工作階段已建立',failed:'操作失敗'}
};
let lang=new URLSearchParams(location.search).get('lang');
if(!tr[lang])try{lang=localStorage.getItem('depthport-language')}catch(e){}
if(!tr[lang])lang='en';
function apply(){document.documentElement.lang=lang;by('lang').value=lang;
  document.querySelectorAll('[data-i]').forEach(e=>e.textContent=tr[lang][e.dataset.i]||e.textContent);}
by('lang').onchange=()=>{lang=by('lang').value;try{localStorage.setItem('depthport-language',lang)}catch(e){}apply()};apply();
async function req(url,opt){const r=await fetch(url,{cache:'no-store',...opt});
 let o;try{o=await r.json()}catch(e){o={detail:'Non-JSON response'}}
 if(!r.ok)throw Error(o.detail||('HTTP '+r.status));return o;}
function message(s){by('status').textContent=s}
let viewer=null;
async function sessions(){const data=await req('/api/sessions');const sel=by('sessions-list'),old=sel.value;
 sel.replaceChildren();for(const s of data.sessions){const opt=document.createElement('option');opt.value=s.session_id;opt.textContent=(s.label||s.session_id.slice(0,8))+' ('+s.frame_count+')';sel.append(opt)}
 if(data.sessions.some(s=>s.session_id===old))sel.value=old;
 await frames();}
async function frames(){const sid=by('sessions-list').value;const sel=by('frames-list');sel.replaceChildren();
 if(!sid)return;const data=await req('/api/sessions/'+sid+'/frames');
 for(const r of data.frames){const o=document.createElement('option');o.value=r.index;o.textContent='#'+r.index+' · '+r.engine+' · '+r.units+' · '+new Date(r.captured_at*1000).toLocaleString();sel.append(o)}
 const t=await req('/api/sessions/'+sid+'/temporal');by('temporal').textContent=JSON.stringify(t.groups,null,2)}
async function act(fn){try{message('');await fn()}catch(e){message(tr[lang].failed+': '+e.message)}}
by('refresh').onclick=()=>act(sessions);
by('sessions-list').onchange=()=>act(frames);
by('create').onclick=()=>act(async()=>{const s=await req('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:by('label').value})});await sessions();by('sessions-list').value=s.session_id;await frames();message(tr[lang].created)});
by('capture').onclick=()=>act(async()=>{const sid=by('sessions-list').value;if(!sid)throw Error('Select a session');
 await req('/api/sessions/'+sid+'/capture',{method:'POST'});await sessions();message(tr[lang].saved)});
by('replay').onclick=()=>act(async()=>{const sid=by('sessions-list').value,index=by('frames-list').value;if(!sid||!index)throw Error('Select a saved frame');
 const data=await req('/api/sessions/'+sid+'/frames/'+index+'/replay');
 by('rgb').src='data:image/png;base64,'+data.rgb_png;
 by('depth').src='data:image/jpeg;base64,'+data.depth_jpeg;
 by('model').textContent=data.engine+' · '+data.model+' · '+data.units+' · Frame '+data.frame_id;
 by('details').textContent=JSON.stringify({intrinsics:data.intrinsics,depth_stats:data.depth_stats,frame_timestamp:data.frame_timestamp,note:data.note},null,2);
 by('download').href='/api/sessions/'+sid+'/frames/'+index+'/bundle.zip';by('download').hidden=false;
 by('result').hidden=false;if(!viewer)viewer=new window.CloudViewer(by('cloud'));
 viewer.setPacked(data.points,data.count,true,data.color_range||[.1,20]);});
act(sessions);
})();
