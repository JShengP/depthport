/* SPDX-License-Identifier: AGPL-3.0-only */
/* v0.1 saved full-cloud viewer. Spatial inspection belongs to v0.2. */
(function(root){
'use strict';
function mountCloud(root,doc){
 const q=s=>doc.querySelector(s),tr=(en,zh)=>doc.documentElement.lang.startsWith('zh')?zh:en;
 const {withDeadline,readJSON}=root.RealResults,canvas=q('#savedCloud'),status=q('#cloudStatus'),retry=q('#cloudRetry'),engine=q('#cloudEngine');
 let viewer,manifest,current=null,loading=false,problem=null;const cache=new Map(),base='../data/bus/';
 try{viewer=new root.CloudViewer(canvas);}catch(error){status.textContent=tr('Point cloud renderer unavailable: ','無法建立點雲檢視器：')+error.message;status.setAttribute('role','alert');engine.disabled=true;return;}
 q('#cloudPointSize').oninput=e=>{viewer.size=Number(e.target.value);};q('#cloudColor').onchange=e=>viewer.setColorMode(e.target.value);q('#cloudHome').onclick=()=>viewer.reset();
 function describe(){
  if(problem){status.textContent=problem.name==='TimeoutError'?tr('Point cloud loading timed out (45 seconds). Retry loading.','點雲載入逾時（45 秒），請重新載入。'):tr('Point cloud data could not load. Retry loading.','點雲資料無法載入，請重新載入。');return;}
  if(loading){status.textContent=tr('Loading saved point cloud…','正在載入保存點雲…');return;}
  if(!current)return;
  const {pack,entry}=current;
  status.textContent=entry.model+' · '+pack.cloud.count.toLocaleString()+' '+tr('exported points','匯出點');
  q('#cloudUnits').textContent=entry.id==='da2-small'?tr('Virtual Z 1–5, not metres.','虛擬 Z 1–5，不是公尺。'):entry.units==='relative'?tr('Relative depth scale, not metres.','相對深度尺度，不是公尺。'):tr('Estimated metres; calibration and physical accuracy remain unverified.','估計公尺；標定與實際測距精度仍未驗證。');
 }
 async function load(){
  if(loading)return;loading=true;problem=null;current=null;retry.hidden=true;engine.disabled=true;
  q('#cloudDemo').setAttribute('aria-busy','true');status.setAttribute('role','status');q('#cloudUnits').textContent='';q('#cloudProvenance').textContent='';q('#cloudRGB').removeAttribute('src');viewer.setPoints(new Float32Array(),new Uint8Array());describe();
  try{
   await withDeadline(async signal=>{
    if(!manifest)manifest=await readJSON(base+'manifest.json',{signal});
    const entry=manifest.engines.find(e=>e.id===engine.value);if(!entry)throw Error('Unknown saved model');
    let pack=cache.get(entry.id);
    if(!pack){pack=await readJSON(base+'previews/'+entry.id+'.json',{signal});signal.throwIfAborted();cache.set(entry.id,pack);}
    signal.throwIfAborted();viewer.setPacked(pack.cloud.packed,pack.cloud.count,true,pack.color_range);
    q('#cloudRGB').src=base+pack.rgb;current={pack,entry};
    q('#cloudProvenance').textContent=JSON.stringify({source:manifest.source,export_date:manifest.inference_date,model:entry.model,weights_sha256:entry.weights_sha256,cloud_sha256:pack.cloud.sha256,points:pack.cloud.count,intrinsics_notice:manifest.intrinsics_notice,historical_notice:manifest.historical_notice},null,2);
   });
  }catch(error){problem=error;retry.hidden=false;status.setAttribute('role','alert');}
  finally{loading=false;engine.disabled=false;q('#cloudDemo').setAttribute('aria-busy','false');describe();}
 }
 engine.onchange=load;retry.onclick=load;doc.addEventListener('depthport:language',describe);
 return {load,ready:load()};
}
if(typeof module==='object'&&module.exports){module.exports={mountCloud};return;}
if(document.querySelector('#cloudDemo'))mountCloud(root,document);
})(typeof window!=='undefined'?window:globalThis);
