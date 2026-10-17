/* SPDX-License-Identifier: AGPL-3.0-only */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const test=require('node:test');
const root=path.resolve(__dirname,'..');
const overlaySource=fs.readFileSync(path.join(root,'static/tracking-overlay.js'),'utf8');
const playbackSource=fs.readFileSync(path.join(root,'static/replay-playback.js'),'utf8');
const sessionsSource=fs.readFileSync(path.join(root,'static/sessions.js'),'utf8');

// A deliberately small DOM, with markup insertion forbidden. The production code
// must create SVG nodes and put all report-provided labels in textContent.
class Element {
 constructor(tag='div'){
  this.tagName=tag;this.children=[];this.attrs={};this.dataset={};this._text='';
  this._value='';this._selectedIndex=-1;this.hidden=false;this.disabled=false;
  this.checked=false;this.complete=true;this.naturalWidth=640;this.naturalHeight=480;this.clientWidth=320;
 }
 setAttribute(key,value){this.attrs[key]=String(value)}
 getAttribute(key){return this.attrs[key]??null}
 append(...nodes){for(const node of nodes)this.appendChild(node)}
 appendChild(node){this.children.push(node);if(this.tagName==='select'&&this._selectedIndex<0)this._selectedIndex=0;return node}
 replaceChildren(...nodes){this.children=[];this._text='';if(this.tagName==='select')this._selectedIndex=-1;this.append(...nodes)}
 set textContent(value){this._text=String(value);this.children=[]}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
 set innerHTML(_value){throw Error('Report content must never be inserted as markup')}
 get options(){return this.tagName==='select'?this.children:[]}
 set selectedIndex(value){this._selectedIndex=value}
 get selectedIndex(){return this._selectedIndex}
 set value(value){
  if(this.tagName==='select')this._selectedIndex=this.options.findIndex(o=>o.value===String(value));
  else this._value=String(value);
 }
 get value(){return this.tagName==='select'?(this.options[this._selectedIndex]?.value??''):this._value}
 querySelector(selector){const match=selector.match(/^\[value="([^"]+)"\]$/);return match?this.children.find(c=>c.value===match[1]):null}
 getContext(){return null}
 scrollIntoView(){}
 replaceWith(node){if(!this._replace)throw Error('Element is not mounted');this._replace(node)}
}
function makeOverlay(){
 const window={};
 vm.runInNewContext(overlaySource,{window,document:{createElementNS:(_ns,tag)=>new Element(tag)}});
 return window.DepthPortTrackingOverlay;
}
const overlay=makeOverlay();
const hash='a'.repeat(64),otherHash='b'.repeat(64);
function observation(overrides={}){
 return {object_id:'obj-0001',label:'person',class_id:0,bbox:[10,20,110,220],...overrides};
}
function replay(overrides={}){
 return {session_id:'session-a',index:1,total_session_frames:3,snapshot_sha256:hash,
         frame_id:97,engine:'da2-small',model:'depth-model',units:'relative',...overrides};
}
function report(overrides={}){
 const r=replay();
 return {format:'depthport.semantic-tracking.v1',session_id:r.session_id,total_session_frames:r.total_session_frames,
  frames:[{index:r.index,snapshot_sha256:r.snapshot_sha256,frame_id:r.frame_id,
   engine:r.engine,model:r.model,units:r.units,objects:[observation()]}],
  tracks:[],track_count:1,frames_considered:1,association_backend:'roboflow-botsort',...overrides};
}
const copy=value=>structuredClone(value);
function assertMismatch(candidateReport,candidateReplay=replay(),width=640,height=480){
 const result=overlay.match(candidateReport,candidateReplay,width,height);
 assert.equal(result.state,'mismatch');assert.equal(result.objects.length,0);
}

test('a report matches the exact session, saved index, snapshot and model metadata',()=>{
 const r=report();const result=overlay.match(r,replay(),640,480);
 assert.equal(result.state,'ready');assert.equal(result.objects[0],r.frames[0].objects[0]);
 assert.equal(result.frame,r.frames[0]);
 for(const [key,value] of Object.entries({session_id:'session-b',index:2,total_session_frames:4,
  snapshot_sha256:otherHash,frame_id:98,engine:'da3-small',model:'different',units:'metres'})){
  const changed=replay({[key]:value});
  const result=overlay.match(r,changed,640,480);
  assert.equal(result.state,key==='index'?'unanalysed':'mismatch',key);
  assert.equal(result.objects.length,0,key);
 }
});

test('repeated source frame IDs remain distinct saved snapshots',()=>{
 const r=report();r.frames.push({...r.frames[0],index:2,snapshot_sha256:otherHash,objects:[observation({object_id:'obj-0002'})]});
 assert.equal(overlay.match(r,replay(),640,480).objects[0].object_id,'obj-0001');
 assert.equal(overlay.match(r,replay({index:2,snapshot_sha256:otherHash}),640,480).objects[0].object_id,'obj-0002');
 assertMismatch(r,replay({index:2}));
});

test('missing, unanalysed, empty and stale data are distinct states',()=>{
 assert.equal(overlay.match(null,replay(),640,480).state,'missing');
 assert.equal(overlay.match(report(),replay({index:3}),640,480).state,'unanalysed');
 const empty=report();empty.frames[0].objects=[];
 const result=overlay.match(empty,replay(),640,480);assert.equal(result.state,'ready');assert.equal(result.objects.length,0);
 assertMismatch(report({total_session_frames:2}));
 assertMismatch(report({format:'unknown'}));
 assertMismatch(report(),null);
});

test('duplicate saved indices and invalid snapshot hashes fail closed',()=>{
 const duplicate=report();duplicate.frames.push(copy(duplicate.frames[0]));assertMismatch(duplicate);
 for(const value of ['',hash.toUpperCase(),'../'+hash,'a'.repeat(63)]){
  const r=report();r.frames[0].snapshot_sha256=value;assertMismatch(r,replay({snapshot_sha256:value}));
 }
});

test('replay index and dimensions must be bounded integers',()=>{
 for(const index of [0,-1,1.5,'1',4,NaN]){
  const r=report();r.frames[0].index=index;assertMismatch(r,replay({index}));
 }
 for(const count of [0,-1,1.5,'3']){
  const r=report({total_session_frames:count});assertMismatch(r,replay({total_session_frames:count}));
 }
 for(const [width,height] of [[0,480],[640,0],[-1,480],[640,1.5],[NaN,480]])assertMismatch(report(),replay(),width,height);
});

test('malformed frame and object collections fail closed without throwing',()=>{
 for(const frames of [null,{},[null],[false],[1]])assertMismatch(report({frames}));
 for(const objects of [null,{},[null],[false],[1],Array.from({length:21},(_,i)=>observation({object_id:'obj-'+String(i).padStart(4,'0')}))]){
  const r=report();r.frames[0].objects=objects;assertMismatch(r);
 }
});

test('invalid boxes, duplicate IDs and malformed labels never reach the drawing layer',()=>{
 const invalidObjects=[
  observation({object_id:'person-1'}),observation({object_id:'obj-001'}),observation({object_id:1}),
  observation({object_id:'obj-<svg>'}),observation({label:null}),observation({label:'x'.repeat(101)}),
  observation({class_id:-1}),observation({class_id:1.5}),observation({bbox:null}),
  ...[[10,20,110],[10,20,110,220,1],[110,20,10,220],[10,20,10,220],[-1,20,110,220],
   [10,-1,110,220],[10,20,641,220],[10,20,110,481],[10,20,NaN,220],
   [10,20,Infinity,220],[10,20,'110',220]].map(bbox=>observation({bbox})),
 ];
 for(const obj of invalidObjects){const r=report();r.frames[0].objects=[obj];assertMismatch(r)}
 const duplicate=report();duplicate.frames[0].objects.push(copy(duplicate.frames[0].objects[0]));assertMismatch(duplicate);
});

test('Object ID colors are stable across reordering, frames and fresh module loads',()=>{
 const ids=['obj-0001','obj-0002','obj-0042','obj-999999999999'];
 const expected=new Map(ids.map(id=>[id,overlay.color(id)]));
 const second=makeOverlay();
 for(const id of ids.slice().reverse()){
  assert.equal(overlay.color(id),expected.get(id));assert.equal(second.color(id),expected.get(id));
  assert.match(expected.get(id),/^(?:#[a-f0-9]{6}|hsl\([0-9]{1,3} 85% 65%\))$/);
 }
 assert.ok(new Set(expected.values()).size>1);
});

test('SVG preserves original fractional boxes on a resized non-square image',()=>{
 const svg=new Element('svg');const objects=[observation({bbox:[10.5,20.25,110.75,220.5]})];
 overlay.draw(svg,objects,640,360,320);
 assert.equal(svg.getAttribute('viewBox'),'0 0 640 360');assert.equal(svg.children.length,1);
 const group=svg.children[0],box=group.children[1];
 assert.equal(group.getAttribute('data-object-id'),'obj-0001');
 assert.equal(box.getAttribute('x'),'10.5');assert.equal(box.getAttribute('y'),'20.25');
 assert.equal(box.getAttribute('width'),'100.25');assert.equal(box.getAttribute('height'),'200.25');
 assert.equal(box.getAttribute('stroke-width'),'4');assert.equal(box.getAttribute('fill'),'none');
 const color=box.getAttribute('stroke');
 overlay.draw(svg,[observation({bbox:[30,40,130,240]})],640,360,640);
 assert.equal(svg.children.length,1,'redraw must replace old objects');
 assert.equal(svg.children[0].children[1].getAttribute('stroke'),color);
 assert.equal(svg.children[0].children[1].getAttribute('stroke-width'),'2');
 overlay.draw(svg,[],640,360,320);assert.equal(svg.children.length,0);
});

test('label rectangles are clamped and report strings are rendered solely as text',()=>{
 const svg=new Element('svg'),label='<image href="x" onerror="bad()"> & person';
 const objects=[observation({label,bbox:[638,478,640,480]}),observation({object_id:'obj-0002',bbox:[0,0,4,4]})];
 overlay.draw(svg,objects,640,480,160);
 assert.equal(svg.children[0].children[0].textContent,'obj-0001 · '+label);
 assert.equal(svg.children[0].children[3].textContent,'obj-0001 · '+label.slice(0,40));
 for(const group of svg.children){
  assert.deepEqual(group.children.map(n=>n.tagName),['title','rect','rect','text']);
  const r=group.children[2],x=Number(r.getAttribute('x')),y=Number(r.getAttribute('y')),
   width=Number(r.getAttribute('width')),height=Number(r.getAttribute('height'));
  assert.ok(x>=0&&y>=0);assert.ok(x+width<=640);assert.ok(y+height<=480);
 }
 const tiny=new Element('svg');overlay.draw(tiny,[observation({bbox:[0,0,4,3]})],4,3,1);
 const r=tiny.children[0].children[2];
 assert.equal(r.getAttribute('x'),'0');assert.equal(r.getAttribute('y'),'0');
 assert.equal(r.getAttribute('width'),'4');assert.equal(r.getAttribute('height'),'3');
});

test('displaced labels have a leader line without changing their detection boxes',()=>{
 const svg=new Element('svg'),bbox=[120,150,220,310];
 overlay.draw(svg,[observation({bbox}),observation({object_id:'obj-0002',bbox})],640,480,640);
 const first=svg.children[0],second=svg.children[1];
 assert.equal(first.children.some(n=>n.tagName==='line'),false);
 const leader=second.children.find(n=>n.tagName==='line');assert.ok(leader);
 assert.equal(leader.getAttribute('x1'),'120');assert.equal(leader.getAttribute('y1'),'150');
 assert.equal(leader.getAttribute('stroke'),overlay.color('obj-0002'));
 const label1=first.children.find(n=>n.tagName==='rect'&&n.getAttribute('fill')!=='none');
 const label2=second.children.find(n=>n.tagName==='rect'&&n.getAttribute('fill')!=='none');
 assert.ok(Number(label2.getAttribute('y'))>=Number(label1.getAttribute('y'))+Number(label1.getAttribute('height')));
 assert.equal(leader.getAttribute('y2'),label2.getAttribute('y'));
 const box=second.children.find(n=>n.tagName==='rect'&&n.getAttribute('fill')==='none');
 assert.equal(box.getAttribute('x'),'120');assert.equal(box.getAttribute('y'),'150');
 assert.equal(box.getAttribute('width'),'100');assert.equal(box.getAttribute('height'),'160');
});

// The UI harness intentionally leaves fetches unresolved until a test chooses
// their order. This verifies observable controls and images, not implementation
// text or the names of the generation counters.
function makeUI(){
 const ids=[...fs.readFileSync(path.join(root,'static/sessions.html'),'utf8').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 const elements=Object.fromEntries(ids.map(id=>[id,new Element(['lang','sessions-list','frames-list','tracking-mode','tracking-backend','playback-speed'].includes(id)?'select':'div')]));
 function mount(id,node){node.id=id;node._replace=replacement=>mount(id,replacement);elements[id]=node}
 for(const id of ids)mount(id,elements[id]);
 for(const [id,values] of Object.entries({lang:['en','zh-TW'],'tracking-mode':['segment','detect'],'tracking-backend':['baseline','roboflow-botsort'],'playback-speed':['.25','.5','1','2']})){
  for(const value of values){const option=new Element('option');option.value=value;elements[id].append(option)}
 }
 elements['playback-speed'].value='1';
 elements['overlay-enabled'].checked=true;
 const pending=[],decoding=[],cloudUpdates=[],windowEvents={},documentEvents={},timers=new Map();let time=0,nextTimer=0,cloudError=null;
 const window={DepthPortTrackingOverlay:makeOverlay(),CloudViewer:class{setPacked(...args){if(cloudError)throw cloudError;cloudUpdates.push(args)}},addEventListener:(type,fn)=>{windowEvents[type]=fn}};
 class Image extends Element{
  constructor(){super('img')}
  decode(){return new Promise((resolve,reject)=>decoding.push({image:this,resolve,reject,done:false}))}
 }
 const document={documentElement:{},hidden:false,addEventListener:(type,fn)=>{documentEvents[type]=fn},getElementById:id=>elements[id],querySelectorAll:()=>[],createElement:tag=>new Element(tag),createTextNode:text=>{const n=new Element('#text');n.textContent=text;return n}};
 const context={window,document,Image,performance:{now:()=>time},
  location:{search:'?lang=en'},localStorage:{getItem:()=>null,setItem:()=>{}},URLSearchParams,console,
  setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,at:time+Math.max(0,delay)});return id},clearTimeout:id=>timers.delete(id),
  fetch:(url,opt)=>new Promise(resolve=>pending.push({url,opt,resolve,done:false}))};
 vm.runInNewContext(playbackSource,context);
 vm.runInNewContext(sessionsSource,context);
 const respond=(url,data,ok=true,status=200)=>{
  const call=pending.find(p=>!p.done&&p.url===url);assert.ok(call,'Expected pending fetch '+url);
  call.done=true;call.resolve({ok,status,json:async()=>data});return call;
 };
 const decode=(src,error=null)=>{
  const call=decoding.find(p=>!p.done&&p.image.src===src);assert.ok(call,'Expected pending decode '+src);
  call.done=true;if(error)call.reject(error);else call.resolve();return call;
 };
 const decodeFrame=async(sid,index)=>{decode('data:image/png;base64,'+sid+'-'+index);decode('data:image/jpeg;base64,'+sid+'-depth-'+index);await flush()};
 const tick=async(ms)=>{
  const target=time+ms;await flush();
  for(let i=0;i<100;i++){
   const due=[...timers.entries()].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
   if(!due){time=target;await flush();return}
   time=due[1].at;timers.delete(due[0]);due[1].fn();await flush();
  }
  throw Error('Too many playback timers');
 };
 return {elements,pending,decoding,cloudUpdates,respond,decode,decodeFrame,tick,failCloud:error=>{cloudError=error},
  hide:()=>{document.hidden=true;documentEvents.visibilitychange()},pagehide:()=>windowEvents.pagehide()};
}
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve))};
async function startUI({delayTracking=false,delayFrames=false,trackingReport=null,frameIndices=[1,2,3]}={}){
 const ui=makeUI();
 ui.respond('/api/sessions/status',{tracking_worker_configured:true});await flush();
 ui.respond('/api/sessions',{sessions:[{session_id:'session-a',label:'A',frame_count:3},{session_id:'session-b',label:'B',frame_count:3}]});await flush();
 if(delayFrames)return ui;
 await finishFrames(ui,'session-a',!delayTracking,trackingReport,frameIndices);return ui;
}
async function finishFrames(ui,sid,withTracking=true,trackingReport=null,frameIndices=[1,2,3]){
 ui.respond('/api/sessions/'+sid+'/frames',{frames:frameIndices.map(index=>({index,engine:'da2-small',units:'relative',captured_at:1}))});await flush();
 ui.respond('/api/sessions/'+sid+'/temporal',{groups:[]});await flush();
 ui.respond('/api/sessions/'+sid+'/consistency',{pairs:[],skipped_pairs:[]});await flush();
 if(withTracking){ui.respond('/api/sessions/'+sid+'/tracking/report.json',trackingReport||report({session_id:sid}));await flush()}
}
function replayResponse(sid,index){
 return {...replay({session_id:sid,index}),rgb_png:sid+'-'+index,depth_jpeg:sid+'-depth-'+index,
  points:'points-'+sid+'-'+index,count:index,intrinsics:{},depth_stats:{},frame_timestamp:1,note:'saved'};
}

test('late replay responses cannot replace the newly selected frame or cloud',async()=>{
 const ui=await startUI(),e=ui.elements;
 const first=e.replay.onclick();await flush();
 e['frames-list'].value='2';const second=e['frames-list'].onchange();await flush();
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();await ui.decodeFrame('session-a',2);await second;
 const src=e.rgb.src,details=e.model.textContent;
 ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await first;
 assert.equal(e.rgb.src,src);assert.equal(e.model.textContent,details);
 assert.equal(ui.cloudUpdates.length,1);assert.equal(ui.cloudUpdates[0][0],'points-session-a-2');
});

test('an older session frame list cannot overwrite a newly selected session',async()=>{
 const ui=await startUI({delayFrames:true}),e=ui.elements;
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 await finishFrames(ui,'session-b');await switched;
 ui.respond('/api/sessions/session-a/frames',{frames:[{index:99,engine:'stale',units:'relative',captured_at:1}]});await flush();
 assert.deepEqual(e['frames-list'].options.map(o=>o.value),['1','2','3']);
 assert.equal(e['sessions-list'].value,'session-b');
 assert.equal(ui.pending.some(p=>p.url==='/api/sessions/session-a/temporal'),false);
});

test('late tracking responses cannot replace the newly selected session report',async()=>{
 const ui=await startUI({delayTracking:true}),e=ui.elements;
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 await finishFrames(ui,'session-b',false);
 ui.respond('/api/sessions/session-b/tracking/report.json',report({session_id:'session-b',track_count:2}));await switched;
 const expected=e['tracking-result'].textContent;
 ui.respond('/api/sessions/session-a/tracking/report.json',report({track_count:99}));await flush();
 assert.equal(e['tracking-result'].textContent,expected);assert.match(expected,/Objects: 2/);
 assert.equal(e['tracking-download'].href,'/api/sessions/session-b/tracking/report.json?download=true');
});

test('overlay waits for both saved images, can be hidden, and clears on a manual frame switch',async()=>{
 const ui=await startUI(),e=ui.elements,p=e.replay.onclick();await flush();
 ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();
 assert.equal(e['tracking-overlay'].children.length,0);assert.equal(e.result.hidden,true);
 ui.decode('data:image/png;base64,session-a-1');await flush();
 assert.equal(e['tracking-overlay'].children.length,0);assert.equal(ui.cloudUpdates.length,0);
 ui.decode('data:image/jpeg;base64,session-a-depth-1');await p;
 assert.equal(e['tracking-overlay'].children.length,1);assert.equal(e.result.hidden,false);
 const fetchCount=ui.pending.length;e['overlay-enabled'].checked=false;e['overlay-enabled'].onchange();
 assert.equal(e['tracking-overlay'].children.length,0);assert.match(e['overlay-status'].textContent,/hidden/);
 assert.equal(ui.pending.length,fetchCount,'overlay toggle must not rerun inference or replay');
 e['overlay-enabled'].checked=true;e['overlay-enabled'].onchange();assert.equal(e['tracking-overlay'].children.length,1);
 e['frames-list'].value='2';const next=e['frames-list'].onchange();await flush();
 assert.equal(e.result.hidden,true);assert.equal(e['tracking-overlay'].children.length,0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();await ui.decodeFrame('session-a',2);await next;
 assert.equal(e['tracking-overlay'].children.length,0);assert.match(e['overlay-status'].textContent,/not analysed/);
});

test('late image decoding cannot replace a newly selected image, overlay or point cloud',async()=>{
 const ui=await startUI(),e=ui.elements;
 const first=e.replay.onclick();await flush();
 ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();
 e['frames-list'].value='2';const second=e['frames-list'].onchange();await flush();
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 await ui.decodeFrame('session-a',2);await second;
 const image=e.rgb,depth=e.depth,details=e.model.textContent;
 await ui.decodeFrame('session-a',1);await first;
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(e.model.textContent,details);
 assert.equal(ui.cloudUpdates.length,1);assert.equal(ui.cloudUpdates[0][0],'points-session-a-2');
 assert.equal(e['tracking-overlay'].children.length,0);assert.match(e['overlay-status'].textContent,/not analysed/);
});

function trackedSequence(){
 const r=report();r.frames=[1,2,3].map(index=>({...r.frames[0],index,objects:[observation({object_id:'obj-000'+index})]}));
 r.frames_considered=3;r.track_count=3;return r;
}
async function showFirst(ui){
 const replaying=ui.elements.replay.onclick();await flush();
 ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();
 await ui.decodeFrame('session-a',1);await replaying;
}

test('continuous playback commits the next RGB, depth, cloud and exact Object IDs together',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 const firstImage=e.rgb,firstDepth=e.depth;
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 ui.decode('data:image/png;base64,session-a-2');await flush();
 assert.equal(e.rgb,firstImage);assert.equal(e.depth,firstDepth);assert.equal(e.result.hidden,false);
 assert.equal(e['frames-list'].value,'1');assert.equal(ui.cloudUpdates.length,1);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();
 assert.equal(e.rgb.src,'data:image/png;base64,session-a-2');assert.equal(e.depth.src,'data:image/jpeg;base64,session-a-depth-2');
 assert.equal(e['frames-list'].value,'2');assert.equal(ui.cloudUpdates.length,2);
 assert.equal(ui.cloudUpdates[1][0],'points-session-a-2');
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');
 e['playback-pause'].onclick();
});

test('pause while the next images decode retains the displayed frame and Object IDs',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 const image=e.rgb,depth=e.depth;
 e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 e['playback-pause'].onclick();await ui.decodeFrame('session-a',2);await ui.tick(1000);
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(e['frames-list'].value,'1');
 assert.equal(e.result.hidden,false);assert.equal(ui.cloudUpdates.length,1);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 assert.match(e['playback-status'].textContent,/Paused/);
 assert.equal(ui.pending.filter(p=>p.url.endsWith('/replay')).length,2);
});

test('seeking while playback loads invalidates the pending frame before it can present',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 e['frames-list'].value='3';const seek=e['frames-list'].onchange();await flush();
 ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 await ui.decodeFrame('session-a',3);await seek;await ui.decodeFrame('session-a',2);await ui.tick(1000);
 assert.equal(e['frames-list'].value,'3');assert.equal(e.rgb.src,'data:image/png;base64,session-a-3');
 assert.equal(ui.cloudUpdates.length,2);assert.equal(ui.cloudUpdates[1][0],'points-session-a-3');
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');
 assert.match(e['playback-status'].textContent,/Paused/);
});

test('hiding the page pauses pending playback without presenting another frame',async()=>{
 for(const event of ['hide','pagehide']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
  e['playback-play'].onclick();await ui.tick(0);ui[event]();
  ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();await ui.tick(1000);
  assert.equal(e['frames-list'].value,'1');assert.equal(ui.cloudUpdates.length,1);
  assert.match(e['playback-status'].textContent,/Paused/);
  assert.equal(ui.decoding.filter(d=>!d.done).length,0,'cancelled response must not decode more images');
 }
});

test('point-cloud failure cannot retain the previous Object IDs over a newly committed image',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 ui.failCloud(Error('Point-cloud renderer unavailable'));
 e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 await ui.decodeFrame('session-a',2);await ui.tick(1000);
 assert.equal(e.rgb.src,'data:image/png;base64,session-a-2');assert.equal(e['frames-list'].value,'2');
 assert.equal(e['tracking-overlay'].children.length,1);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');
 assert.equal(ui.cloudUpdates.length,1,'failed cloud update must not be counted as presented');
 assert.match(e['playback-status'].textContent,/error/);
 assert.match(e.status.textContent,/Playback stopped after an error/);
 assert.equal(ui.pending.filter(p=>p.url.endsWith('/replay')).length,2);
});

test('pausing during restart decoding keeps the final image, Object IDs and selected frame together',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;
 e['frames-list'].value='3';const last=e.replay.onclick();await flush();
 ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 await ui.decodeFrame('session-a',3);await last;
 const image=e.rgb,depth=e.depth;
 e['playback-play'].onclick();assert.equal(e['frames-list'].value,'3');await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();
 ui.decode('data:image/png;base64,session-a-1');await flush();
 assert.equal(e['frames-list'].value,'3');assert.equal(e.rgb,image);assert.equal(e.depth,depth);
 e['playback-pause'].onclick();ui.decode('data:image/jpeg;base64,session-a-depth-1');await ui.tick(1000);
 assert.equal(e['frames-list'].value,'3');assert.equal(e.rgb,image);assert.equal(e.depth,depth);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');
 assert.equal(ui.cloudUpdates.length,1);assert.match(e['playback-status'].textContent,/Paused/);
 assert.equal(ui.pending.filter(p=>p.url.endsWith('/replay')).length,2);
});

function replayRequests(ui){return ui.pending.filter(p=>p.url.endsWith('/replay'))}
function assertProgress(ui,position,total){
 const e=ui.elements,progress=e['replay-progress'];
 assert.equal(progress.value,String(position));
 const count=new RegExp('\\b'+position+'\\s*(?:/|of)\\s*'+total+'\\b');
 assert.match(e['replay-progress-text'].textContent,count);
 assert.match(progress.getAttribute('aria-valuetext'),count);
}
async function scrub(ui,position){
 const progress=ui.elements['replay-progress'];progress.value=String(position);progress.oninput();await flush();
 return progress.onchange();
}

test('progress range bounds and availability follow zero, one and many saved frames',async()=>{
 for(const indices of [[],[1],[1,2,3]]){
  const ui=await startUI({frameIndices:indices}),progress=ui.elements['replay-progress'];
  assert.equal(progress.min,'1');assert.equal(progress.max,String(Math.max(1,indices.length)));
  assert.equal(progress.step,'1');assert.equal(progress.value,'1');
  assert.equal(progress.disabled,indices.length<2);
  assert.equal(replayRequests(ui).length,0,'listing frames must not trigger a replay');
  if(!indices.length)assert.match(ui.elements['replay-progress-text'].textContent,/0\s*(?:\/|of)\s*0/);
 }
});

test('progress follows decoded manual, stepped and continuously played frames',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);assertProgress(ui,1,3);
 const stepped=e['frame-next'].onclick();await flush();
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 await ui.decodeFrame('session-a',2);await stepped;assertProgress(ui,2,3);
 e['frames-list'].value='1';const selected=e['frames-list'].onchange();await flush();
 ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();
 await ui.decodeFrame('session-a',1);await selected;assertProgress(ui,1,3);
 e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 assertProgress(ui,1,3);
 await ui.decodeFrame('session-a',2);assertProgress(ui,2,3);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');
 e['playback-pause'].onclick();
});

test('dragging previews the target, pauses autoplay and does not fetch on every movement',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 const image=e.rgb,depth=e.depth,fetches=ui.pending.length;
 for(const position of [2,1,3]){e['replay-progress'].value=String(position);e['replay-progress'].oninput();await flush()}
 assert.equal(ui.pending.length,fetches,'drag previews must not request saved frames');
 assert.match(e['playback-status'].textContent,/Paused/);assert.equal(e['frames-list'].value,'1');
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(e.result.hidden,false);
 for(const text of [e['replay-progress-text'].textContent,e['replay-progress'].getAttribute('aria-valuetext')]){
  assert.match(text,/\b3\b/,'preview identifies the target');assert.match(text,/\b1\b/,'preview identifies the still-displayed frame');
 }
 await ui.decodeFrame('session-a',2);await ui.tick(1000);
 assert.equal(e.rgb,image);assert.equal(e['frames-list'].value,'1');assert.equal(ui.cloudUpdates.length,1);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 const released=e['replay-progress'].onchange();await flush();
 ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 assert.equal(e.rgb,image,'seeking keeps the previous image until both new images decode');
 ui.decode('data:image/png;base64,session-a-3');await flush();assert.equal(e.rgb,image);
 ui.decode('data:image/jpeg;base64,session-a-depth-3');await released;
 assert.equal(e.rgb.src,'data:image/png;base64,session-a-3');assert.equal(e['frames-list'].value,'3');
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');assertProgress(ui,3,3);
});

test('dragging back to the displayed frame finishes without requiring a change event',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 const image=e.rgb,depth=e.depth,fetches=ui.pending.length;
 e['replay-progress'].value='3';e['replay-progress'].oninput();await flush();
 e['replay-progress'].value='1';e['replay-progress'].oninput();await flush();
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(e['frames-list'].value,'1');assertProgress(ui,1,3);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 assert.equal(e['playback-play'].disabled,false,'returning to the shown frame must not leave a pending drag');
 assert.equal(ui.pending.length,fetches);
 await e['replay-progress'].onchange();await flush();
 assert.equal(ui.pending.length,fetches,'a late change event must not replay an unchanged frame');
 assertProgress(ui,1,3);assert.equal(e['playback-play'].disabled,false);
});

test('a progress release maps the ordinal to the saved option index',async()=>{
 const ui=await startUI({frameIndices:[4,9,12]}),e=ui.elements;
 const released=scrub(ui,2);await flush();
 assert.equal(replayRequests(ui).length,1);assert.equal(replayRequests(ui)[0].url,'/api/sessions/session-a/frames/9/replay');
 ui.respond('/api/sessions/session-a/frames/9/replay',{...replayResponse('session-a',9),total_session_frames:12});await flush();
 await ui.decodeFrame('session-a',9);await released;
 assert.equal(e['frames-list'].value,'9');assert.equal(e.rgb.src,'data:image/png;base64,session-a-9');assertProgress(ui,2,3);
});

test('rapid progress releases keep only the latest decoded image, cloud and Object IDs',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 const first=scrub(ui,2);await flush();
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 const second=scrub(ui,3);await flush();
 ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 await ui.decodeFrame('session-a',3);await second;
 const image=e.rgb,depth=e.depth;
 await ui.decodeFrame('session-a',2);await first;
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(e['frames-list'].value,'3');assertProgress(ui,3,3);
 assert.equal(ui.cloudUpdates.length,2);assert.equal(ui.cloudUpdates[1][0],'points-session-a-3');
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');
});

test('switching Session clears a drag and cancels a pending progress seek',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 const seek=scrub(ui,2);await flush();
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 e['replay-progress'].value='3';e['replay-progress'].oninput();
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 assert.equal(e['replay-progress'].disabled,true);assert.equal(e['replay-progress'].value,'1');
 assert.equal(e.result.hidden,true);
 await ui.decodeFrame('session-a',2);await seek;
 await finishFrames(ui,'session-b',true,report({session_id:'session-b'}));await switched;
 assert.equal(e['replay-progress'].value,'1');assert.equal(e['replay-progress'].max,'3');assert.equal(e['replay-progress'].disabled,false);
 assert.equal(e.result.hidden,true);assert.equal(ui.cloudUpdates.length,1,'old Session must not present after the switch');
 const next=scrub(ui,2);await flush();
 ui.respond('/api/sessions/session-b/frames/2/replay',replayResponse('session-b',2));await flush();
 await ui.decodeFrame('session-b',2);await next;
 assert.equal(e.rgb.src,'data:image/png;base64,session-b-2');assert.equal(e['frames-list'].value,'2');assertProgress(ui,2,3);
});

test('keyboard-style Home and End changes seek only the bounded endpoint frames',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 for(const position of [3,1]){
  const before=replayRequests(ui).length,released=scrub(ui,position);await flush();
  assert.equal(replayRequests(ui).length,before+1);
  ui.respond('/api/sessions/session-a/frames/'+position+'/replay',replayResponse('session-a',position));await flush();
  await ui.decodeFrame('session-a',position);await released;assertProgress(ui,position,3);
  assert.equal(e['frames-list'].value,String(position));
  assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-000'+position);
 }
});

test('invalid progress values cannot request or present an out-of-bounds frame',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 const fetches=ui.pending.length,image=e.rgb;
 for(const value of ['', 'NaN','Infinity','1.5','0','-1','4','2x','null']){
  e['replay-progress'].value=value;e['replay-progress'].oninput();await flush();
  await e['replay-progress'].onchange();await flush();
  assert.equal(ui.pending.length,fetches,'invalid progress '+JSON.stringify(value));
  assert.equal(e.rgb,image);assert.equal(e['frames-list'].value,'1');assertProgress(ui,1,3);
 }
});

test('failed seek fetch or image decoding restores coherent displayed progress and IDs',async()=>{
 for(const failure of ['fetch','decode']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
  const image=e.rgb,depth=e.depth,released=scrub(ui,3);await flush();
  if(failure==='fetch')ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'Saved frame unavailable'},false,404);
  else{
   ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
   ui.decode('data:image/png;base64,session-a-3',Error('Saved image decode failed'));
   ui.decode('data:image/jpeg;base64,session-a-depth-3');
  }
  await released;await flush();
  assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(e.result.hidden,false);
  assert.equal(e['frames-list'].value,'1');assertProgress(ui,1,3);assert.equal(ui.cloudUpdates.length,1);
  assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
  assert.match(e.status.textContent,/Request failed/);
 }
});

function configureLoop(ui,start,end,enabled=true){
 const e=ui.elements;
 e['loop-start'].value=String(start);e['loop-start'].oninput();
 e['loop-end'].value=String(end);e['loop-end'].onchange();
 e['loop-enabled'].checked=enabled;e['loop-enabled'].onchange();
}
async function completeReplay(ui,index,{sid='session-a',total=3}={}){
 ui.respond('/api/sessions/'+sid+'/frames/'+index+'/replay',{...replayResponse(sid,index),total_session_frames:total});await flush();
 await ui.decodeFrame(sid,index);
}
async function showSaved(ui,index,options){
 const e=ui.elements;e['frames-list'].value=String(index);const showing=e.replay.onclick();await flush();
 await completeReplay(ui,index,options);await showing;
}

test('A/B loop controls default to the entire saved order and disable short Sessions',async()=>{
 for(const indices of [[],[1],[1,2,3]]){
  const ui=await startUI({frameIndices:indices}),e=ui.elements;
  assert.equal(e['loop-enabled'].checked,false);
  assert.equal(e['loop-start'].value,'1');assert.equal(e['loop-end'].value,String(Math.max(1,indices.length)));
  for(const id of ['loop-start','loop-end']){
   assert.equal(e[id].min,'1');assert.equal(e[id].max,String(Math.max(1,indices.length)));assert.equal(e[id].step,'1');
   assert.equal(e[id].disabled,indices.length<2,id);
  }
  assert.equal(e['loop-enabled'].disabled,indices.length<2);
  if(indices.length<2)for(const id of ['loop-set-start','loop-set-end'])assert.equal(e[id].disabled,true,id);
  assert.equal(replayRequests(ui).length,0);
 }
});

test('A/B playback uses saved ordinals, includes B and repeatedly wraps to A',async()=>{
 const indices=[4,9,12],r=trackedSequence();r.total_session_frames=12;
 r.frames.forEach((frame,i)=>{frame.index=indices[i]});
 const ui=await startUI({trackingReport:r,frameIndices:indices}),e=ui.elements;
 await showSaved(ui,4,{total:12});configureLoop(ui,2,3);
 e['playback-play'].onclick();await ui.tick(0);
 for(const [index,position,id] of [[9,2,'obj-0002'],[12,3,'obj-0003'],[9,2,'obj-0002'],[12,3,'obj-0003']]){
  const request=replayRequests(ui).filter(p=>!p.done);assert.equal(request.length,1);
  assert.equal(request[0].url,'/api/sessions/session-a/frames/'+index+'/replay');
  await completeReplay(ui,index,{total:12});assertProgress(ui,position,3);
  assert.equal(e['frames-list'].value,String(index));assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),id);
  assert.match(e['playback-status'].textContent,/Playing/);await ui.tick(200);
 }
 e['playback-pause'].onclick();
 assert.equal(replayRequests(ui).slice(1).some(p=>p.url.includes('/frames/4/')),false,'loop must never request outside A/B');
});

test('a slow B-to-A wrap presents RGB, depth, Object IDs and cloud together',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,2);
 const image=e.rgb,depth=e.depth;e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();
 ui.decode('data:image/png;base64,session-a-1');await ui.tick(1000);
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertProgress(ui,2,3);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(ui.cloudUpdates.length,1);
 assert.equal(replayRequests(ui).filter(p=>!p.done).length,0,'loading one loop frame must not queue more requests');
 ui.decode('data:image/jpeg;base64,session-a-depth-1');await flush();
 assert.equal(e.rgb.src,'data:image/png;base64,session-a-1');assert.equal(e.depth.src,'data:image/jpeg;base64,session-a-depth-1');
 assertProgress(ui,1,3);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 assert.equal(ui.cloudUpdates.length,2);assert.equal(ui.cloudUpdates[1][0],'points-session-a-1');
 e['playback-pause'].onclick();
});

test('editing A/B or disabling the loop pauses and invalidates an automatic pending presentation',async()=>{
 for(const change of ['start','end','disable']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);configureLoop(ui,1,3);
  const image=e.rgb,depth=e.depth;e['playback-play'].onclick();await ui.tick(0);
  ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
  const fetches=ui.pending.length;
  if(change==='disable'){e['loop-enabled'].checked=false;e['loop-enabled'].onchange()}
  else{e['loop-'+change].value=String(2);e['loop-'+change][change==='start'?'oninput':'onchange']()}
  assert.equal(ui.pending.length,fetches,'editing loop controls must not request a frame');
  await ui.decodeFrame('session-a',2);await ui.tick(1000);
  assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertProgress(ui,1,3);assert.equal(e['frames-list'].value,'1');
  assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.equal(ui.cloudUpdates.length,1);
  assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.pending.length,fetches);
 }
});

test('editing the A/B interval cancels a progress seek without replacing the displayed frame',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);configureLoop(ui,1,3);
 const image=e.rgb,depth=e.depth,seek=scrub(ui,3);await flush();
 ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 e['loop-end'].value='2';e['loop-end'].oninput();await ui.decodeFrame('session-a',3);await seek;
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertProgress(ui,1,3);assert.equal(e['frames-list'].value,'1');
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.equal(ui.cloudUpdates.length,1);
 assert.equal(e['playback-play'].disabled,false,'cancelled seek must not keep Play disabled');
});

test('invalid enabled A/B intervals block Play and cannot request out-of-range frames',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 const fetches=ui.pending.length,image=e.rgb;
 for(const [start,end] of [[1,1],[2,1],[0,2],[1,4],[1.5,3],['',3],[1,''],['NaN',3],[1,'Infinity']]){
  configureLoop(ui,start,end);assert.equal(e['playback-play'].disabled,true,JSON.stringify([start,end]));
  assert.match(e['loop-status'].textContent,/A|B|start|end|range/i);
  e['playback-play'].onclick();await ui.tick(1000);
  assert.equal(ui.pending.length,fetches,'invalid interval '+JSON.stringify([start,end]));assert.equal(e.rgb,image);assertProgress(ui,1,3);
 }
 configureLoop(ui,1,3);assert.equal(e['playback-play'].disabled,false);
 configureLoop(ui,3,1,false);assert.equal(e['playback-play'].disabled,false,'unchecked invalid interval must not block ordinary playback');
});

test('A/B current-frame markers capture the displayed ordinal rather than a pending selection or drag',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);
 const fetches=ui.pending.length;e['frames-list'].value='3';e['loop-set-start'].onclick();await flush();
 assert.equal(e['loop-start'].value,'2','the dropdown may target a frame that has not been displayed');
 e['replay-progress'].value='3';e['replay-progress'].oninput();e['loop-set-end'].onclick();await flush();
 assert.equal(e['loop-end'].value,'2','the drag preview is not the displayed frame');
 assert.equal(e.rgb.src,'data:image/png;base64,session-a-2');assertProgress(ui,2,3);
 assert.equal(ui.pending.length,fetches,'markers must not run inference or request replay');
});

test('manual seek and step can leave A/B, and Play returns to A with the selected speed',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);configureLoop(ui,1,2);
 e['playback-speed'].value='.5';e['playback-speed'].onchange();
 const seek=scrub(ui,3);await flush();await completeReplay(ui,3);await seek;
 assert.equal(e['loop-enabled'].checked,true);assert.equal(e['loop-start'].value,'1');assert.equal(e['loop-end'].value,'2');assertProgress(ui,3,3);
 assert.match(e['playback-status'].textContent,/Paused.*0\.5/);
 e['playback-play'].onclick();await ui.tick(0);await completeReplay(ui,1);assertProgress(ui,1,3);
 e['playback-pause'].onclick();
 const previous=e['frame-prev'].onclick();await flush();await previous;
 assertProgress(ui,1,3);
 const next=e['frame-next'].onclick();await flush();await completeReplay(ui,2);await next;
 const outside=e['frame-next'].onclick();await flush();await completeReplay(ui,3);await outside;
 assertProgress(ui,3,3);assert.equal(e['loop-enabled'].checked,true);assert.match(e['playback-status'].textContent,/Paused.*0\.5/);
});

test('switching Sessions resets A/B and invalidates an in-flight wrap',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,2);
 e['playback-speed'].value='2';e['playback-speed'].onchange();e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 await ui.decodeFrame('session-a',1);await finishFrames(ui,'session-b',true,report({session_id:'session-b'}),[1,2]);await switched;
 assert.equal(e['loop-enabled'].checked,false);assert.equal(e['loop-start'].value,'1');assert.equal(e['loop-end'].value,'2');
 assert.equal(e['loop-start'].disabled,false);assert.equal(e['loop-end'].disabled,false);assert.equal(e.result.hidden,true);
 assert.equal(ui.cloudUpdates.length,1,'old Session wrap must not present');assert.equal(e['playback-speed'].value,'2');
 assert.match(e['playback-status'].textContent,/Paused.*2/);await ui.tick(1000);
 assert.equal(replayRequests(ui).filter(p=>!p.done).length,0);
});

test('refreshing the same Session resets A/B to its new saved-frame count',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);configureLoop(ui,2,3);
 const seek=scrub(ui,3);await flush();
 ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 const refreshed=e.refresh.onclick();await flush();
 ui.respond('/api/sessions/status',{tracking_worker_configured:true});await flush();
 ui.respond('/api/sessions',{sessions:[{session_id:'session-a',label:'A',frame_count:4}]});await flush();
 await ui.decodeFrame('session-a',3);await seek;
 await finishFrames(ui,'session-a',true,trackedSequence(),[1,2,3,4]);await refreshed;
 assert.equal(e['sessions-list'].value,'session-a');assert.equal(e['loop-enabled'].checked,false);
 assert.equal(e['loop-start'].value,'1');assert.equal(e['loop-end'].value,'4');
 assert.equal(e['loop-start'].max,'4');assert.equal(e['loop-end'].max,'4');assert.equal(e.result.hidden,true);
 assert.equal(ui.cloudUpdates.length,1,'a pre-refresh seek cannot reappear in the refreshed Session');
});

test('a failed A/B wrap preserves the last complete frame and stops with an error',async()=>{
 for(const failure of ['fetch','decode']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,2);
  const image=e.rgb,depth=e.depth;e['playback-play'].onclick();await ui.tick(0);
  if(failure==='fetch')ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'Saved frame unavailable'},false,404);
  else{
   ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();
   ui.decode('data:image/png;base64,session-a-1',Error('Saved image decode failed'));ui.decode('data:image/jpeg;base64,session-a-depth-1');
  }
  await ui.tick(1000);assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertProgress(ui,2,3);assert.equal(e['frames-list'].value,'2');
  assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(ui.cloudUpdates.length,1);
  assert.match(e['playback-status'].textContent,/error/);assert.match(e.status.textContent,/Playback stopped after an error/);
  assert.equal(replayRequests(ui).length,2);
 }
});
