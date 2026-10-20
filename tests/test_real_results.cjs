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

// A server can send headers and then stall its body: the entire read must be
// bounded, release its connection, and permit a later successful retry.
async function checkLoadingRecovery(){
 const {withDeadline,readJSON}=require('../website/real-results.js');
 const http=require('node:http');let aborted=0;const sockets=new Set();
 const server=http.createServer((request,response)=>{
  if(request.url==='/headers'){
   request.on('close',()=>aborted++);return;
  }
  if(request.url==='/body'){
   response.writeHead(200,{'Content-Type':'application/json'});response.write('{');
   response.on('close',()=>aborted++);return;
  }
  if(request.url==='/404'){response.writeHead(404);response.end();return;}
  if(request.url==='/invalid'){response.end('{');return;}
  response.end('{"ready":true}');
 });
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const sizes=[];assert.deepEqual(await withDeadline(signal=>readJSON(base,{signal,onProgress:n=>sizes.push(n)}),2000),{ready:true});
  assert.equal(sizes.at(-1),14);
  await assert.rejects(withDeadline(signal=>readJSON(base+'/404',{signal}),2000),/HTTP 404/);
  await assert.rejects(withDeadline(signal=>readJSON(base+'/invalid',{signal}),2000),SyntaxError);
  for(const route of ['/headers','/body']){
   const start=Date.now();let signal;
   await assert.rejects(withDeadline(s=>{signal=s;return readJSON(base+route,{signal:s});},100),{name:'TimeoutError'});
   assert.ok(signal.aborted);assert.ok(Date.now()-start<1500);
  }
  // Also bound a task that never observes cancellation (e.g. a stuck decoder).
  await assert.rejects(withDeadline(()=>new Promise(()=>{}),20),{name:'TimeoutError'});
  assert.deepEqual(await withDeadline(signal=>readJSON(base,{signal}),2000),{ready:true});
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(aborted,2);
  console.log('Loading: stream progress, HTTP/JSON errors, header/body/decoder deadlines and retry: PASS');
 }finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
}
checkLoadingRecovery().catch(error=>{console.error(error);process.exitCode=1;});

// Results filters are intersections; missing platforms and failed gates stay
// discoverable and bilingual search must not depend on the current UI language.
const {matches}=require('../website/results.js');
const result={kind:'tracking',status:'failed',model:'yolo26n',tracker:'bytetrack botsort',platform:'linux-cpu',text:'KITTI 控制 未通過 HOTA'};
assert.equal(matches(result,{tracker:'botsort',status:'failed'},'kitti'),true);
assert.equal(matches(result,{tracker:'botsort',platform:'windows-ci'}),false);
assert.equal(matches(result,{model:'yolo26'}),false);
assert.equal(matches(result,{},'ＫＩＴＴＩ'),true);
assert.equal(matches(result,{},'未通過'),true);
assert.equal(matches(result,{status:'not_run'}),false);
assert.equal(matches({status:'not_run',text:'Physical iOS'}, {status:'not_run'}, 'ios'),true);
console.log('Results index facet intersections, exact tags, missing outcomes and Unicode search: PASS');
