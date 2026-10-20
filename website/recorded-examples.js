/* SPDX-License-Identifier: AGPL-3.0-only */
/* Only saved UI screenshots: no generated Object IDs or native depth inference. */
(() => {
'use strict';
const gallery=document.getElementById('recordedReplay');
if(gallery){
 const img=gallery.querySelector('#recordedReplayImage');
 const info=gallery.querySelector('#recordedReplayInfo');
 const link=gallery.querySelector('#recordedFrameLink');
 const buttons=[...gallery.querySelectorAll('[data-recorded-frame]')];
 const shots=[
  {index:1,source:32,t:'1.293',file:'tracking-replay-start.zh-TW.jpg'},
  {index:12,source:43,t:'1.752',file:'tracking-replay-crossing.zh-TW.jpg'},
  {index:24,source:55,t:'2.252',file:'tracking-replay-later.zh-TW.jpg'}
 ];
 let cursor=1;
 function draw(){
  const frame=shots[cursor]; const zh=document.documentElement.lang.toLowerCase().startsWith('zh');
  img.src='../media/'+frame.file; link.href=img.src;
  img.alt='Real DepthPort Session screenshot: saved frame '+frame.index+', source frame '+frame.source+', '+frame.t+'s';
  info.textContent=zh?'Session #'+frame.index+' · 來源影格 '+frame.source+' · '+frame.t+' 秒 · 三張實際保存畫面之一'
    :'Session #'+frame.index+' · source frame '+frame.source+' · '+frame.t+'s · one of three real saved screenshots';
  buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===cursor)));
 }
 buttons.forEach((b,i)=>b.addEventListener('click',()=>{cursor=i;draw();}));
 gallery.querySelector('[data-step="prev"]')?.addEventListener('click',()=>{cursor=(cursor+shots.length-1)%shots.length;draw();});
 gallery.querySelector('[data-step="next"]')?.addEventListener('click',()=>{cursor=(cursor+1)%shots.length;draw();});
 gallery.addEventListener('keydown',e=>{
  if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
  if(!gallery.contains(document.activeElement))return;
  e.preventDefault();cursor=(cursor+(e.key==='ArrowRight'?1:shots.length-1))%shots.length;draw();
 });
 document.querySelector('[data-lang-switch]')?.addEventListener('click',draw);
 draw();
}
const rgb=document.getElementById('recordedBusPhoto'),out=document.getElementById('recordedBusCoords');
if(rgb&&out){
 rgb.addEventListener('click',e=>{
  const r=rgb.getBoundingClientRect();if(!r.width||!r.height||!rgb.naturalWidth)return;
  const u=Math.min(rgb.naturalWidth-1,Math.max(0,Math.floor((e.clientX-r.left)/r.width*rgb.naturalWidth)));
  const v=Math.min(rgb.naturalHeight-1,Math.max(0,Math.floor((e.clientY-r.top)/r.height*rgb.naturalHeight)));
  const zh=document.documentElement.lang.toLowerCase().startsWith('zh');
  out.textContent=zh?'原始 RGB 像素 ('+u+', '+v+')；沒有已發布原始 Depth 矩陣，不能推測 Z／XYZ。'
    :'Original RGB pixel ('+u+', '+v+'); no native depth matrix is published for numeric Z/XYZ.';
 });
}
})();