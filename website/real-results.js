/* SPDX-License-Identifier: AGPL-3.0-only */
/* Saved inference only. No model execution, API, interpolation or preview inversion. */
(function (root) {
'use strict';
const sourcePixel=(u,v,w,h,sw=810,sh=1080)=>[Math.min(w-1,Math.max(0,Math.floor((u+.5)*w/sw))),Math.min(h-1,Math.max(0,Math.floor((v+.5)*h/sh)))];
function sample(data,u,v){
 const [x,y]=sourcePixel(u,v,data.width,data.height),z=data.values[y*data.width+x],raw=data.raw[y*data.width+x],k=data.intrinsics;
 return {u:x,v:y,raw,z,xyz:[(x-k.cx)*z/k.fx,(y-k.cy)*z/k.fy,z]};
}
const atFrame=(observations,index)=>observations.find(o=>o.index===index)||null;
// Bound the complete load, including a stalled response body or decompression.
async function withDeadline(task, milliseconds=45000){
 const controller=new AbortController();let timer;
 const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error('Load timed out');error.name='TimeoutError';controller.abort(error);reject(error);},milliseconds);});
 try{return await Promise.race([Promise.resolve().then(()=>task(controller.signal)),expired]);}finally{clearTimeout(timer);}
}
async function readJSON(url,{signal,onProgress}={}){
 const response=await fetch(url,{signal});if(!response.ok)throw Error('Static data HTTP '+response.status);
 if(!response.body?.getReader)return response.json();
 const reader=response.body.getReader(),decoder=new TextDecoder();let text='',bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;text+=decoder.decode(value,{stream:true});onProgress?.(bytes);}text+=decoder.decode();}
 finally{reader.releaseLock();}
 signal?.throwIfAborted();return JSON.parse(text);
}
const api={sourcePixel,sample,atFrame,withDeadline,readJSON};
if(typeof module==='object'&&module.exports){module.exports=api;return;}
root.RealResults=api;
const q=s=>document.querySelector(s),zh=()=>document.documentElement.lang.startsWith('zh'),tr=(en,tw)=>zh()?tw:en;
const fmt=n=>Number.isFinite(n)?Number(n).toPrecision(7):'—';
const get=readJSON;
const image=(src,signal)=>new Promise((resolve,reject)=>{
 const i=new Image(),cleanup=()=>{i.onload=i.onerror=null;signal?.removeEventListener('abort',abort);};
 const abort=()=>{cleanup();i.src='';reject(signal.reason);};
 i.onload=()=>{cleanup();resolve(i);};i.onerror=()=>{cleanup();reject(Error('Image unavailable'));};
 if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});i.src=src;
});
async function floats(encoded,signal){
 if(!root.DecompressionStream)throw Error('This browser needs gzip DecompressionStream support to read exact Float32 arrays.');
 const bytes=Uint8Array.from(atob(encoded.data),c=>c.charCodeAt(0));
 const buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'),{signal})).arrayBuffer();
 if(buffer.byteLength!==encoded.shape.reduce((a,b)=>a*b,1)*4)throw Error('Float32 length mismatch');
 if(root.crypto?.subtle){const h=await crypto.subtle.digest('SHA-256',buffer);if(Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,'0')).join('')!==encoded.sha256)throw Error('Float32 hash mismatch');}
 signal?.throwIfAborted();
 const view=new DataView(buffer),out=new Float32Array(buffer.byteLength/4);for(let i=0;i<out.length;i++)out[i]=view.getFloat32(i*4,true);return out;
}
function fail(node,error){node.textContent=tr('Saved data could not load: ','保存資料無法載入：')+error.message;node.setAttribute('role','alert');}
function point(event,canvas){const r=canvas.getBoundingClientRect();return [(event.clientX-r.left)*canvas.width/r.width,(event.clientY-r.top)*canvas.height/r.height];}
function median(values){values.sort((a,b)=>a-b);const m=Math.floor(values.length/2);return values.length%2?values[m]:(values[m-1]+values[m])/2;}
async function bus(){
 const status=q('#realBusStatus'),retry=q('#realBusRetry'),base='../data/bus/';let data=null,rgb=null,semantic=null,viewer=null,manifest=null,loading=false,problem=null;const cache=new Map();
 const canvas=q('#realCloud');try{viewer=new root.CloudViewer(canvas);}catch(e){fail(q('#realCloudStatus'),e);}
 q('#realPointSize').oninput=e=>{if(viewer)viewer.size=Number(e.target.value);};
 q('#realColor').onchange=e=>viewer?.setColorMode(e.target.value);
 q('#realHome').onclick=()=>viewer?.reset();
 function query(u,v){if(!data)return;const s=sample(data,u,v);q('#realPixel').textContent=`source (${u}, ${v}) → aligned (${s.u}, ${s.v})`;q('#realNative').textContent=fmt(s.raw)+' '+data.depth_info.raw_depth_units;q('#realZ').textContent=fmt(s.z)+' '+(data.engine==='da2-small'?'virtual':data.units);q('#realXYZ').textContent=s.xyz.map(fmt).join(', ');}
 for(const id of ['#realRGB','#realDepth'])q(id).onclick=e=>{const [u,v]=point(e,q(id));query(Math.min(809,Math.floor(u*810/q(id).width)),Math.min(1079,Math.floor(v*1080/q(id).height)));};
 function drawDepth(mask){
  const c=q('#realDepth');c.width=data.width;c.height=data.height;const ctx=c.getContext('2d'),a=q('#realMapKind').value==='raw'?data.raw:data.values;
  let lo=Infinity,hi=-Infinity;for(let i=0;i<a.length;i++){if(Number.isFinite(a[i])){lo=Math.min(lo,a[i]);hi=Math.max(hi,a[i]);}}
  const im=ctx.createImageData(c.width,c.height);
  for(let i=0;i<a.length;i++){const t=Math.max(0,Math.min(1,(a[i]-lo)/(hi-lo||1))),off=i*4,alpha=!mask||mask[i]?1:.12;im.data[off]=Math.round(255*t*alpha);im.data[off+1]=Math.round(255*(1-Math.abs(t*2-1))*alpha);im.data[off+2]=Math.round(255*(1-t)*alpha);im.data[off+3]=255;}
  ctx.putImageData(im,0,0);
 }
 function objects(){return semantic[q('#realSemanticMode').value].objects;}
 function update(){
  if(!data||!rgb)return;
  const c=q('#realRGB');c.width=data.width;c.height=data.height;const ctx=c.getContext('2d');ctx.drawImage(rgb,0,0);
  const list=objects(),n=Number(q('#realObject').value),selected=n>=0?list[n]:null,sem=semantic[q('#realSemanticMode').value],mask=selected?new Uint8Array(data.width*data.height):null;
  const sx=data.width/sem.width,sy=data.height/sem.height;
  const wanted=selected?[selected]:list;
  for(const ob of wanted){
   ctx.strokeStyle='#8effbc';ctx.lineWidth=Math.max(1,data.width/350);const [x0,y0,x1,y1]=ob.bbox;ctx.strokeRect(x0*sx,y0*sy,(x1-x0)*sx,(y1-y0)*sy);ctx.font=`${Math.max(11,data.width/45)}px system-ui`;ctx.fillStyle='#bcffdc';ctx.fillText(ob.label+' '+ob.confidence.toFixed(3),Math.max(0,x0*sx),Math.max(14,y0*sy-3));
  }
  if(q('#realSemanticMode').value==='segment'){
   const overlay=ctx.getImageData(0,0,c.width,c.height),source=new Uint8Array(720*960);
   for(const ob of wanted)for(const [a,b] of ob.runs)source.fill(1,a,b);
   for(let v=0;v<data.height;v++)for(let u=0;u<data.width;u++){const [x,y]=sourcePixel(u,v,720,960,data.width,data.height);if(source[y*720+x]){const i=(v*data.width+u)*4;overlay.data[i]*=.65;overlay.data[i+1]=overlay.data[i+1]*.65+89;overlay.data[i+2]*=.65;if(mask)mask[v*data.width+u]=1;}}
   ctx.putImageData(overlay,0,0);
  }else if(selected){const [x0,y0,x1,y1]=selected.bbox;for(let v=0;v<data.height;v++)for(let u=0;u<data.width;u++){const [x,y]=sourcePixel(u,v,720,960,data.width,data.height);if(x>=x0&&x<x1&&y>=y0&&y<y1)mask[v*data.width+u]=1;}}
  drawDepth(mask);
  if(selected){
   const p=[],colors=[],zs=[],k=data.intrinsics,rgba=ctx.getImageData(0,0,c.width,c.height).data;
   // Point colors use original aligned RGB, never the semantic paint.
   const off=document.createElement('canvas');off.width=c.width;off.height=c.height;off.getContext('2d').drawImage(rgb,0,0);const original=off.getContext('2d').getImageData(0,0,c.width,c.height).data;
   let count=0;for(let v=0;v<data.height;v++)for(let u=0;u<data.width;u++){const i=v*data.width+u,z=data.values[i];if(mask[i]&&Number.isFinite(z)&&z>0){zs.push(z);count++;if(u%4===0&&v%4===0){p.push((u-k.cx)*z/k.fx,-(v-k.cy)*z/k.fy,-z);colors.push(...original.slice(i*4,i*4+3));}}}
   if(viewer){viewer.colorRange=data.color_range;viewer.setPoints(new Float32Array(p),new Uint8Array(colors),true);}
   q('#realObjectStats').textContent=`${selected.label} · ${selected.confidence.toFixed(4)} · ${count} ${tr('valid aligned mask pixels','有效對齊遮罩像素')} · median Z ${fmt(zs.length?median(zs):NaN)} (${data.engine==='da2-small'?'virtual':data.units}) · ${selected.mask_kind}`;
  }else{
   viewer?.setPacked(data.cloud.packed,data.cloud.count,true,data.color_range);q('#realObjectStats').textContent=tr('All exported points. Detect boxes are approximate ROIs; segment masks are real model silhouettes.','全部匯出點；Detect 框為近似 ROI，Segment 遮罩來自真正的模型預測。');
  }
  q('#realStats').textContent=`${data.width} × ${data.height} · min ${fmt(data.statistics.min)} · median ${fmt(data.statistics.median)} · max ${fmt(data.statistics.max)} · ${data.engine==='da2-small'?'virtual 1..5':data.units}`;
  status.textContent=`${data.model} · CUDA · ${data.depth_info.precision||'official API'} · ${data.units}`;
  q('#realProvenance').textContent=JSON.stringify({model:data.model,weights_sha256:data.weights_sha256,depth_sha256:data.depth.sha256,raw_sha256:(data.raw_depth==='depth'?data.depth:data.raw_depth).sha256,depth_info:data.depth_info,intrinsics:data.intrinsics,source_sha256:manifest.source.sha256},null,2);
 }
 function selectObjects(){q('#realObject').replaceChildren();const opt=document.createElement('option');opt.value='-1';opt.textContent=tr('All objects / full cloud','全部物件／完整點雲');q('#realObject').append(opt);objects().forEach((o,i)=>{const n=document.createElement('option');n.value=i;n.textContent=`${i+1}: ${o.label} (${o.confidence.toFixed(3)})`;q('#realObject').append(n);});update();}
 function loadStatus(phase='',bytes=0){status.textContent=tr('Loading depth and point cloud data…','正在載入深度與點雲資料…')+(phase?' '+phase:'')+(bytes?' · '+(bytes/1048576).toFixed(1)+' MB':'');}
 function loadFailure(){status.textContent=problem?.name==='TimeoutError'?tr('Loading timed out (45 seconds). Check your connection and retry.','載入逾時（45 秒）。請檢查連線後重試。'):tr('Depth and point cloud data could not load. Check your connection or browser support, then retry.','深度與點雲資料無法載入。請檢查連線或瀏覽器支援後重試。');status.setAttribute('role','alert');}
 async function load(){
  if(loading)return;loading=true;problem=null;data=null;rgb=null;
  status.setAttribute('role','status');retry.hidden=true;q('#realEngine').disabled=true;for(const id of ['#realMapKind','#realSemanticMode','#realObject'])q(id).disabled=true;q('#realBus').setAttribute('aria-busy','true');
  for(const id of ['#realPixel','#realNative','#realZ','#realXYZ'])q(id).textContent='—';
  for(const id of ['#realStats','#realObjectStats','#realProvenance'])q(id).textContent='';
  for(const id of ['#realRGB','#realDepth']){const c=q(id);c.getContext('2d').clearRect(0,0,c.width,c.height);}
  viewer?.setPoints(new Float32Array(),new Uint8Array());if(viewer)q('#realCloudStatus').textContent='';loadStatus();
  try{await withDeadline(async signal=>{
   const step=(en,tw,bytes=0)=>{signal.throwIfAborted();loadStatus(tr(en,tw),bytes);};
   if(!manifest){step('Reading catalog','讀取資料目錄');manifest=await get(base+'manifest.json',{signal});}
   if(!semantic){step('Reading object masks','讀取物件遮罩');semantic=await get(base+manifest.semantic,{signal});}
   const entry=manifest.engines.find(e=>e.id===q('#realEngine').value);
   const cached=cache.get(entry.id);if(cached){data=cached.data;rgb=cached.rgb;selectObjects();query(405,540);if(viewer)q('#realCloudStatus').textContent='';return;}
   step('Loading point cloud first','優先載入點雲');
   // Failure of an optional small pack must not block the original full pack.
   try{
    await withDeadline(async previewSignal=>{
     const preview=await get(base+'previews/'+entry.id+'.json',{signal:previewSignal});
     const im=await image(base+preview.rgb,previewSignal);signal.throwIfAborted();previewSignal.throwIfAborted();
     if(viewer){viewer.setPacked(preview.cloud.packed,preview.cloud.count,true,preview.color_range);q('#realCloudStatus').textContent=tr('Point cloud ready to rotate/zoom. Exact depth queries are still loading.','點雲已可旋轉／縮放；完整深度查詢資料仍在載入。');}
     const c=q('#realRGB');c.width=preview.width;c.height=preview.height;c.getContext('2d').drawImage(im,0,0,c.width,c.height);
    },8000);
   }catch(e){signal.throwIfAborted();}
   let last=0;
   step('Downloading saved results','下載保存結果');
   const d=await get(base+entry.path,{signal,onProgress:bytes=>{const now=Date.now();if(now-last>200){last=now;step('Downloading saved results','下載保存結果',bytes);}}});
   step('Decoding and verifying depth','解壓縮並驗證深度');
   const values=await floats(d.depth,signal),raw=d.raw_depth==='depth'?values:await floats(d.raw_depth,signal);
   step('Loading aligned image','載入對齊影像');const im=await image(base+d.rgb,signal);signal.throwIfAborted();
   data={...d,values,raw};rgb=im;selectObjects();query(405,540);cache.set(entry.id,{data,rgb});if(viewer)q('#realCloudStatus').textContent='';
  });}catch(e){data=null;rgb=null;problem=e;loadFailure();retry.hidden=false;if(viewer?.points)q('#realCloudStatus').textContent=tr('The point cloud preview remains available. Exact depth queries are unavailable; retry loading.','點雲預覽仍可操作；完整深度查詢尚未載入，請重試。');}
  finally{loading=false;q('#realEngine').disabled=false;for(const id of ['#realMapKind','#realSemanticMode','#realObject'])q(id).disabled=!data;q('#realBus').setAttribute('aria-busy','false');}
 }
 retry.onclick=load;
 q('#realEngine').onchange=load;q('#realObject').onchange=update;q('#realSemanticMode').onchange=selectObjects;q('#realMapKind').onchange=update;
 document.addEventListener('depthport:language',()=>{if(loading)loadStatus();else if(problem)loadFailure();if(data){q('#realObject').options[0].textContent=tr('All objects / full cloud','全部物件／完整點雲');update();}});await load();
}
async function replay(){
 const base='../data/tracking/',status=q('#realReplayStatus'),manifest=await get(base+'manifest.json'),frames=await get(base+manifest.frames),tracks=await get(base+manifest.tracks),c=q('#realReplayCanvas'),ctx=c.getContext('2d');
 let index=1,selected=Object.keys(tracks)[0],playing=false,timer=null,drawToken=0;
 const images=new Map();const getImage=f=>{if(!images.has(f.index))images.set(f.index,image(base+f.preview));return images.get(f.index);};
 function stop(){playing=false;clearTimeout(timer);timer=null;q('#realReplayPlay').textContent=tr('Play ▶','播放 ▶');}
 function schedule(){if(!playing)return;timer=setTimeout(async()=>{if(index>=frames.length){stop();return;}await show(index+1);schedule();},1000/manifest.playback_fps/Number(q('#realReplaySpeed').value));}
 function history(){
  const h=q('#realHistory'),g=h.getContext('2d'),obs=tracks[selected]||[];g.clearRect(0,0,h.width,h.height);g.fillStyle='#0b2233';g.fillRect(0,0,h.width,h.height);
  g.fillStyle='#a8d5d0';g.font='13px system-ui';g.fillText(tr('Virtual Z median (1–5) · gaps preserved','虛擬 Z 中位數（1–5）· 保留觀測缺口'),15,20);
  g.strokeStyle='#71e3b6';g.lineWidth=2;g.beginPath();let previous=0;
  for(const o of obs){const x=30+(o.index-1)*(h.width-60)/23,y=h.height-30-(o.depth_median-1)*(h.height-70)/4;if(previous===o.index-1&&previous)g.lineTo(x,y);else g.moveTo(x,y);previous=o.index;}g.stroke();
  for(const o of obs){const x=30+(o.index-1)*(h.width-60)/23,y=h.height-30-(o.depth_median-1)*(h.height-70)/4;g.fillStyle=o.index===index?'#fff':'#71e3b6';g.fillRect(x-3,y-3,6,6);}
  const here=atFrame(obs,index);q('#realTrackDetail').textContent=`${selected} · ${tr('Observed on this frame','此格有觀測')} ${here?tr('yes','是'):tr('no','否')} · Z ${fmt(here?.depth_median)} · Camera XYZ ${here?.xyz_camera_median?.map(fmt).join(', ')||'—'}`;
  q('#realObserved').replaceChildren();for(const o of obs){const b=document.createElement('button');b.type='button';b.className='small-button quiet';b.textContent='#'+o.index;b.onclick=()=>{stop();show(o.index);};q('#realObserved').append(b);}
 }
 async function show(n){index=Math.max(1,Math.min(frames.length,n));const f=frames[index-1],token=++drawToken;ctx.clearRect(0,0,c.width,c.height);q('#realReplaySlider').value=index;
  q('#realReplayPosition').textContent=`${index}/24 · source ${f.source_frame} · ${f.timestamp.toFixed(6)} s`;q('#realReplayPrev').disabled=index===1;q('#realReplayNext').disabled=index===24;
  status.textContent=`${manifest.counts.ids} IDs · ${manifest.counts.detections} ${tr('detections','偵測')} · ${manifest.counts.associated} ${tr('associated','關聯')} · ${manifest.counts.unassociated} ${tr('unassociated','未關聯')} · ${tr('NEW RUN','新執行結果')}`;
  q('#realFrameObjects').textContent=f.objects.map(o=>`${o.object_id||tr('unassociated','未關聯')} · ${o.label} · ${o.confidence.toFixed(4)} · [${o.bbox.join(', ')}]`).join('\n');history();
  try{const im=await getImage(f);if(token!==drawToken)return;ctx.drawImage(im,0,0,c.width,c.height);const o=f.objects.find(o=>o.object_id===selected);if(o){ctx.strokeStyle='#fff';ctx.lineWidth=3;const b=o.bbox;ctx.strokeRect(b[0]*.8,b[1]*.8,(b[2]-b[0])*.8,(b[3]-b[1])*.8);}}
  catch(e){stop();fail(status,e);}
 }
 Object.keys(tracks).forEach(id=>{const o=document.createElement('option');o.value=id;o.textContent=id;q('#realTrack').append(o);});
 q('#realTrack').onchange=e=>{selected=e.target.value;show(index);};
 q('#realReplayPlay').onclick=()=>{if(playing){stop();return;}if(index===24)show(1);playing=true;q('#realReplayPlay').textContent=tr('Pause ⏸','暫停 ⏸');schedule();};
 q('#realReplayPrev').onclick=()=>{stop();show(index-1);};q('#realReplayNext').onclick=()=>{stop();show(index+1);};q('#realReplaySlider').oninput=e=>{stop();show(Number(e.target.value));};q('#realReplaySpeed').onchange=()=>{clearTimeout(timer);schedule();};
 c.onclick=e=>{const [x,y]=point(e,c),o=frames[index-1].objects.find(o=>o.object_id&&x/.8>=o.bbox[0]&&x/.8<=o.bbox[2]&&y/.8>=o.bbox[1]&&y/.8<=o.bbox[3]);if(o){selected=o.object_id;q('#realTrack').value=selected;show(index);}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});document.addEventListener('depthport:language',()=>{stop();show(index);});
 q('#realReplayProvenance').textContent=JSON.stringify(manifest,null,2);await show(1);
}
if(q('#realBus'))bus().catch(e=>fail(q('#realBusStatus'),e));
if(q('#realReplay'))replay().catch(e=>fail(q('#realReplayStatus'),e));
})(typeof window!=='undefined'?window:globalThis);
