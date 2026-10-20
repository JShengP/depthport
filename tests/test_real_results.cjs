// SPDX-License-Identifier: AGPL-3.0-only
const assert=require('node:assert/strict');
const {sourcePixel,sample,atFrame}=require('../website/real-results.js');
assert.deepEqual(sourcePixel(0,0,720,960),[0,0]);
assert.deepEqual(sourcePixel(809,1079,378,504),[377,503]);
assert.deepEqual(sourcePixel(-1,-1,720,960),[0,0]);
assert.deepEqual(sourcePixel(10000,10000,720,960),[719,959]);
const k={fx:10,fy:10,cx:.5,cy:.5},d={width:2,height:2,values:[1,2,3,4],raw:[9,8,7,6],intrinsics:k};
assert.deepEqual(sample(d,809,1079),{u:1,v:1,raw:6,z:4,xyz:[.2,.2,4]});
const obs=[{index:1,depth_median:4},{index:3,depth_median:2}];
assert.equal(atFrame(obs,2),null);assert.equal(atFrame(obs,3),obs[1]);
// Check all published depth queries read Float32 bytes, including corners and
// different preprocessing grids; the preview never supplies native depth.
const fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
for(const name of ['yolo26','da2-small','da3-small','da3-metric']){
 const m=JSON.parse(fs.readFileSync(path.join(__dirname,'../website/data/bus/',name+'.json')));
 const decode=o=>{const b=zlib.gunzipSync(Buffer.from(o.data,'base64'));return Array.from({length:b.length/4},(_,i)=>b.readFloatLE(i*4));};
 m.values=decode(m.depth);m.raw=m.raw_depth==='depth'?m.values:decode(m.raw_depth);
 for(const [u,v] of [[0,0],[809,1079],[405,540],[200,700]]){
  const s=sample(m,u,v);assert.equal(s.z,m.values[s.v*m.width+s.u]);assert.equal(s.raw,m.raw[s.v*m.width+s.u]);assert.equal(s.xyz[2],s.z);
 }
}
console.log('Real result pixel mapping, Float32 queries and observation gaps: PASS');
// Exercise original CloudViewer's software fallback against actual saved points.
const vm=require('node:vm');
let draws=0;const events={};const ctx={fillRect(){draws++;},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
const canvas={clientWidth:800,clientHeight:500,width:800,height:500,getContext:t=>t==='2d'?ctx:null,addEventListener:(t,f)=>events[t]=f,setPointerCapture(){}};
const sandbox={window:{devicePixelRatio:1},requestAnimationFrame(){},performance:{now:()=>1000},Float32Array,Uint8Array,ArrayBuffer,DataView,Math,Number,Error,atob:x=>Buffer.from(x,'base64').toString('binary')};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/viewer.js'),'utf8'),sandbox);
const viewer=new sandbox.window.CloudViewer(canvas);assert.equal(viewer.is2D,true);
for(const name of ['yolo26','da2-small','da3-small','da3-metric']){
 const d=JSON.parse(fs.readFileSync(path.join(__dirname,'../website/data/bus/',name+'.json')));
 viewer.setPacked(d.cloud.packed,d.cloud.count,true,d.color_range);assert.equal(viewer.points,d.cloud.count);viewer._last2D=0;viewer._render();assert.ok(draws>viewer.points/2);draws=0;
 const radius=viewer.radius;events.wheel({preventDefault(){},deltaY:-100});assert.ok(viewer.radius<radius);
 const theta=viewer.theta;events.pointerdown({pointerId:1,clientX:10,clientY:10,button:0});events.pointermove({clientX:30,clientY:20});assert.notEqual(viewer.theta,theta);events.pointerup();
 const x=viewer.target[0];events.pointerdown({pointerId:1,clientX:10,clientY:10,button:2});events.pointermove({clientX:30,clientY:20});assert.notEqual(viewer.target[0],x);events.pointerup();
 viewer.setColorMode('depth');viewer.size=5;viewer.reset();
}
viewer.destroy();console.log('Actual CloudViewer Canvas fallback, rotate, zoom, pan, size and color: PASS');
