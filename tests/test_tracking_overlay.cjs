/* SPDX-License-Identifier: AGPL-3.0-only */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const test=require('node:test');
const root=path.resolve(__dirname,'..');
const overlaySource=fs.readFileSync(path.join(root,'static/tracking-overlay.js'),'utf8');
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
 const elements=Object.fromEntries(ids.map(id=>[id,new Element(['lang','sessions-list','frames-list','tracking-mode','tracking-backend'].includes(id)?'select':'div')]));
 for(const [id,values] of Object.entries({lang:['en','zh-TW'],'tracking-mode':['segment','detect'],'tracking-backend':['baseline','roboflow-botsort']})){
  for(const value of values){const option=new Element('option');option.value=value;elements[id].append(option)}
 }
 elements['overlay-enabled'].checked=true;
 const pending=[],cloudUpdates=[],window={DepthPortTrackingOverlay:makeOverlay(),CloudViewer:class{setPacked(...args){cloudUpdates.push(args)}}};
 const context={window,document:{documentElement:{},getElementById:id=>elements[id],querySelectorAll:()=>[],createElement:tag=>new Element(tag),createTextNode:text=>{const n=new Element('#text');n.textContent=text;return n}},
  location:{search:'?lang=en'},localStorage:{getItem:()=>null,setItem:()=>{}},URLSearchParams,console,
  setTimeout,fetch:(url,opt)=>new Promise(resolve=>pending.push({url,opt,resolve,done:false}))};
 vm.runInNewContext(sessionsSource,context);
 const respond=(url,data,ok=true,status=200)=>{
  const call=pending.find(p=>!p.done&&p.url===url);assert.ok(call,'Expected pending fetch '+url);
  call.done=true;call.resolve({ok,status,json:async()=>data});return call;
 };
 return {elements,pending,cloudUpdates,respond};
}
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve))};
async function startUI({delayTracking=false,delayFrames=false}={}){
 const ui=makeUI();
 ui.respond('/api/sessions/status',{tracking_worker_configured:true});await flush();
 ui.respond('/api/sessions',{sessions:[{session_id:'session-a',label:'A',frame_count:3},{session_id:'session-b',label:'B',frame_count:3}]});await flush();
 if(delayFrames)return ui;
 await finishFrames(ui,'session-a',!delayTracking);return ui;
}
async function finishFrames(ui,sid,withTracking=true){
 ui.respond('/api/sessions/'+sid+'/frames',{frames:[1,2,3].map(index=>({index,engine:'da2-small',units:'relative',captured_at:1}))});await flush();
 ui.respond('/api/sessions/'+sid+'/temporal',{groups:[]});await flush();
 ui.respond('/api/sessions/'+sid+'/consistency',{pairs:[],skipped_pairs:[]});await flush();
 if(withTracking){ui.respond('/api/sessions/'+sid+'/tracking/report.json',report({session_id:sid}));await flush()}
}
function replayResponse(sid,index){
 return {...replay({session_id:sid,index}),rgb_png:sid+'-'+index,depth_jpeg:sid+'-depth-'+index,
  points:'points-'+sid+'-'+index,count:index,intrinsics:{},depth_stats:{},frame_timestamp:1,note:'saved'};
}

test('late replay responses cannot replace the newly selected frame or cloud',async()=>{
 const ui=await startUI(),e=ui.elements;
 const first=e.replay.onclick();await flush();
 e['frames-list'].value='2';const second=e['frames-list'].onchange();await flush();
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await second;
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

test('overlay waits for the saved image, can be hidden, and clears on frame switch',async()=>{
 const ui=await startUI(),e=ui.elements,p=e.replay.onclick();await flush();
 ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await p;
 assert.equal(e['tracking-overlay'].children.length,0);assert.match(e['overlay-status'].textContent,/Loading/);
 const oldLoad=e.rgb.onload;e.rgb.onload();assert.equal(e['tracking-overlay'].children.length,1);
 const fetchCount=ui.pending.length;e['overlay-enabled'].checked=false;e['overlay-enabled'].onchange();
 assert.equal(e['tracking-overlay'].children.length,0);assert.match(e['overlay-status'].textContent,/hidden/);
 assert.equal(ui.pending.length,fetchCount,'overlay toggle must not rerun inference or replay');
 e['overlay-enabled'].checked=true;e['overlay-enabled'].onchange();assert.equal(e['tracking-overlay'].children.length,1);
 e['frames-list'].value='2';const next=e['frames-list'].onchange();await flush();
 assert.equal(e.result.hidden,true);assert.equal(e['tracking-overlay'].children.length,0);
 oldLoad();assert.equal(e['tracking-overlay'].children.length,0,'a stale image load must not restore prior IDs');
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await next;e.rgb.onload();
 assert.equal(e['tracking-overlay'].children.length,0);assert.match(e['overlay-status'].textContent,/not analysed/);
});
