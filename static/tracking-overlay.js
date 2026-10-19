/* SPDX-License-Identifier: AGPL-3.0-only */
(() => {'use strict';
// Golden-angle hues keep neighbouring sequential IDs visually distinct.
function color(id){return `hsl(${Math.round((Number(id.slice(4))*137.508)%360)} 85% 65%)`}
function match(report,replay,width,height){
 if(!report)return {state:'missing',objects:[]};
 const bad=()=>({state:'mismatch',objects:[]});
 if(typeof report!=='object'||!replay||report.format!=='depthport.semantic-tracking.v1'||report.session_id!==replay.session_id||
    !Number.isInteger(replay.total_session_frames)||replay.total_session_frames<1||
    !Number.isInteger(replay.index)||replay.index<1||replay.index>replay.total_session_frames||report.total_session_frames!==replay.total_session_frames||
    !Array.isArray(report.frames)||report.frames.some(f=>!f||typeof f!=='object')||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)return bad();
 const frames=report.frames.filter(f=>f.index===replay.index);
 if(!frames.length)return {state:'unanalysed',objects:[]};
 if(frames.length!==1)return bad();
 const frame=frames[0];
 if(!/^[a-f0-9]{64}$/.test(replay.snapshot_sha256)||frame.snapshot_sha256!==replay.snapshot_sha256||
    ['frame_id','engine','model','units'].some(k=>frame[k]!==replay[k])||
    !Array.isArray(frame.objects)||frame.objects.length>20)return bad();
 const ids=new Set();
 for(const obj of frame.objects){
  if(!obj||typeof obj!=='object')return bad();
  const b=obj.bbox;
  if(typeof obj.object_id!=='string'||!/^obj-[0-9]{4,12}$/.test(obj.object_id)||ids.has(obj.object_id)||
     typeof obj.label!=='string'||obj.label.length>100||!Number.isInteger(obj.class_id)||obj.class_id<0||
     !Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||
     !(0<=b[0]&&b[0]<b[2]&&b[2]<=width&&0<=b[1]&&b[1]<b[3]&&b[3]<=height))return bad();
  ids.add(obj.object_id);
 }
 return {state:'ready',objects:frame.objects,frame};
}
const ns='http://www.w3.org/2000/svg';
function element(tag,attrs,text){const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=text;return node}
function draw(svg,objects,width,height,displayWidth){
 svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
 const scale=width/Math.max(1,displayWidth||width),font=13*scale,pad=4*scale,line=2*scale;
 const occupied=[];
 for(const obj of objects){
  const [x0,y0,x1,y1]=obj.bbox,stroke=color(obj.object_id);
  const group=element('g',{'data-object-id':obj.object_id});
  group.append(element('title',{},obj.object_id+' · '+obj.label));
  group.append(element('rect',{x:x0,y:y0,width:x1-x0,height:y1-y0,fill:'none',stroke,'stroke-width':line}));
  const label=obj.object_id+' · '+obj.label.replace(/\s+/g,' ').slice(0,40);
  const boxWidth=Math.min(width,label.length*font*.63+2*pad),boxHeight=Math.min(height,font+2*pad);
  const x=Math.max(0,Math.min(width-boxWidth,x0));
  // Prefer just above the box, then nearby free rows when labels overlap.
  const first=Math.max(0,Math.min(height-boxHeight,y0-boxHeight));
  let y=first;
  for(let attempt=0;attempt<=objects.length;attempt++){
   const candidate=Math.max(0,Math.min(height-boxHeight,first+attempt*boxHeight));
   y=candidate;
   if(!occupied.some(r=>x<r.x+r.w&&x+boxWidth>r.x&&y<r.y+r.h&&y+boxHeight>r.y))break;
  }
  occupied.push({x,y,w:boxWidth,h:boxHeight});
  if(y!==first)group.append(element('line',{x1:x0,y1:y0,x2:x+pad,y2:y,stroke,'stroke-width':line}));
  group.append(element('rect',{x,y,width:boxWidth,height:boxHeight,fill:stroke,rx:2*scale}));
  group.append(element('text',{x:x+pad,y:y+pad+font*.8,fill:'#08111b','font-family':'system-ui, sans-serif','font-size':font,'font-weight':'700'},label));
  svg.append(group);
 }
}
window.DepthPortTrackingOverlay={match,color,draw};
})();
