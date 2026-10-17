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
 appendChild(node){node.parentElement=this;node.ownerDocument=this.ownerDocument;this.children.push(node);if(this.tagName==='select'&&this._selectedIndex<0)this._selectedIndex=0;return node}
 replaceChildren(...nodes){this.children=[];this._text='';if(this.tagName==='select')this._selectedIndex=-1;this.append(...nodes)}
 set textContent(value){this._text=String(value);this.children=[]}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
 set innerHTML(_value){throw Error('Report content must never be inserted as markup')}
 get options(){return this.tagName==='select'?this.children:[]}
 get isContentEditable(){const value=this.getAttribute('contenteditable');return this._isContentEditable??(value===null?!!this.parentElement?.isContentEditable:value!=='false')}
 set isContentEditable(value){this._isContentEditable=!!value}
 set selectedIndex(value){this._selectedIndex=value}
 get selectedIndex(){return this._selectedIndex}
 set value(value){
  if(this.tagName==='select')this._selectedIndex=this.options.findIndex(o=>o.value===String(value));
  else this._value=String(value);
 }
 get value(){return this.tagName==='select'?(this.options[this._selectedIndex]?.value??''):this._value}
 querySelector(selector){const match=selector.match(/^\[value="([^"]+)"\]$/);return match?this.children.find(c=>c.value===match[1]):null}
 closest(selector){
  const matches=node=>selector.split(',').some(part=>{
   if(/^[a-z]+$/i.test(part))return node.tagName.toLowerCase()===part.toLowerCase();
   if(part==='[contenteditable]:not([contenteditable="false"])')return node.getAttribute('contenteditable')!==null&&node.getAttribute('contenteditable')!=='false';
   const role=part.match(/^\[role="([^"]+)"\]$/);return role&&node.getAttribute('role')===role[1];
  });
  for(let node=this;node;node=node.parentElement)if(matches(node))return node;
  return null;
 }
 getContext(){return null}
 scrollIntoView(){}
 focus(){this.focused=true;if(this.ownerDocument)this.ownerDocument.activeElement=this;this.onfocus?.()}
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
 const markup=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');
 const nodes=[...markup.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)],ids=nodes.map(m=>m[2]);
 const elements=Object.fromEntries(nodes.map(m=>[m[2],new Element(m[1].toLowerCase())]));let uiDocument=null;
 function mount(id,node){node.id=id;node.ownerDocument=uiDocument;node._replace=replacement=>mount(id,replacement);elements[id]=node}
 for(const id of ids)mount(id,elements[id]);
 for(const [id,values] of Object.entries({lang:['en','zh-TW'],'tracking-mode':['segment','detect'],'tracking-backend':['baseline','roboflow-botsort'],'playback-speed':['.25','.5','1','2'],'bookmark-import-policy':['keep','overwrite'],'bookmark-filter-tag':['all','id-switch','occlusion','crossing','general']})){
  if(!elements[id])continue;
  for(const value of values){const option=new Element('option');option.value=value;elements[id].append(option)}
 }
 elements['playback-speed'].value='1';
 elements['overlay-enabled'].checked=true;
 if(elements['bookmark-shortcuts-enabled'])elements['bookmark-shortcuts-enabled'].checked=/\bchecked(?:\s|=|>)/.test(nodes.find(m=>m[2]==='bookmark-shortcuts-enabled')[0]);
 const pending=[],decoding=[],cloudUpdates=[],windowEvents={},documentEvents={},timers=new Map();let time=0,nextTimer=0,cloudError=null;
 const window={DepthPortTrackingOverlay:makeOverlay(),CloudViewer:class{setPacked(...args){if(cloudError)throw cloudError;cloudUpdates.push(args)}},addEventListener:(type,fn)=>{windowEvents[type]=fn}};
 class Image extends Element{
  constructor(){super('img')}
  decode(){return new Promise((resolve,reject)=>decoding.push({image:this,resolve,reject,done:false}))}
 }
 const document={documentElement:{},hidden:false,activeElement:null,addEventListener:(type,fn)=>{documentEvents[type]=fn},getElementById:id=>elements[id],querySelectorAll:()=>[],createElement:tag=>{const n=new Element(tag);n.ownerDocument=document;return n},createTextNode:text=>{const n=new Element('#text');n.textContent=text;return n}};
 uiDocument=document;for(const node of Object.values(elements))node.ownerDocument=document;
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
 const dispatch=(type,properties={})=>{const event={target:new Element('div'),defaultPrevented:false,...properties,preventDefault(){this.defaultPrevented=true}};documentEvents[type]?.(event);return event};
 return {elements,pending,decoding,cloudUpdates,respond,decode,decodeFrame,tick,document,dispatch,windowEvents,failCloud:error=>{cloudError=error},
  hide:()=>{document.hidden=true;documentEvents.visibilitychange()},pagehide:()=>windowEvents.pagehide()};
}
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve))};
async function startUI({delayTracking=false,delayFrames=false,delayBookmarks=false,bookmarks=[],trackingReport=null,frameIndices=[1,2,3]}={}){
 const ui=makeUI();
 ui.respond('/api/sessions/status',{tracking_worker_configured:true});await flush();
 ui.respond('/api/sessions',{sessions:[{session_id:'session-a',label:'A',frame_count:3},{session_id:'session-b',label:'B',frame_count:3}]});await flush();
 if(delayFrames)return ui;
 await finishFrames(ui,'session-a',!delayTracking,trackingReport,frameIndices,bookmarks,delayBookmarks);return ui;
}
async function finishFrames(ui,sid,withTracking=true,trackingReport=null,frameIndices=[1,2,3],bookmarks=[],delayBookmarks=false){
 ui.respond('/api/sessions/'+sid+'/frames',{frames:frameIndices.map(index=>({index,sha256:hash,engine:'da2-small',units:'relative',captured_at:1}))});await flush();
 if(delayBookmarks)return;
 ui.respond('/api/sessions/'+sid+'/bookmarks',bookmarkResponse(sid,bookmarks));await flush();
 ui.respond('/api/sessions/'+sid+'/temporal',{groups:[]});await flush();
 ui.respond('/api/sessions/'+sid+'/consistency',{pairs:[],skipped_pairs:[]});await flush();
 if(withTracking){ui.respond('/api/sessions/'+sid+'/tracking/report.json',trackingReport||report({session_id:sid}));await flush()}
}
function bookmarkRecord(index=1,overrides={}){
 return {index,snapshot_sha256:hash,tags:[],note:'',updated_at:1767225600,...overrides};
}
function bookmarkResponse(sid,bookmarks=[]){return {format:'depthport.session-bookmarks.v1',session_id:sid,bookmarks}}
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

function bookmarkWrites(ui){return ui.pending.filter(p=>/\/bookmark$/.test(p.url))}
function descendants(node){return [node,...node.children.flatMap(descendants)]}
function bookmarkJumpButtons(ui){return descendants(ui.elements['bookmarks-list']).filter(n=>n.tagName==='button')}
function editBookmark(ui,note,tags=[]){
 const e=ui.elements;e['bookmark-note'].value=note;e['bookmark-note'].oninput();
 for(const tag of ['id-switch','occlusion','crossing']){
  const input=e['bookmark-tag-'+tag];input.checked=tags.includes(tag);input.onchange();
 }
}

test('bookmarks require a committed frame and save explicit notes and tags against its exact snapshot',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;
 assert.equal(e['bookmark-mark'].disabled,true);assert.equal(e['bookmark-save'].disabled,true);
 assert.equal(bookmarkWrites(ui).length,0);await showFirst(ui);
 assert.equal(e['bookmark-mark'].disabled,false);e['bookmark-mark'].onclick();await flush();
 assert.equal(e['bookmark-note'].focused,true);
 const note='<img src=x onerror="bad()"> suspected switch & crossing';
 editBookmark(ui,note,['id-switch','crossing']);assert.equal(bookmarkWrites(ui).length,0,'typing must not save automatically');
 const saving=e['bookmark-save'].onclick();await flush();
 const write=bookmarkWrites(ui).at(-1);assert.equal(write.url,'/api/sessions/session-a/frames/1/bookmark');
 assert.equal(write.opt.method,'PUT');
 assert.deepEqual(JSON.parse(write.opt.body),{snapshot_sha256:hash,tags:['id-switch','crossing'],note});
 ui.respond(write.url,bookmarkResponse('session-a',[bookmarkRecord(1,{note,tags:['id-switch','crossing']})]));await saving;
 assert.ok(e['bookmarks-list'].textContent.includes(note),'saved user text must be displayed literally');
 assert.equal(bookmarkJumpButtons(ui).length,1);assert.equal(e['bookmark-delete'].disabled,false);
});

test('saved bookmarks load on Session selection and updating a note is visible after reloading',async()=>{
 const first=bookmarkRecord(1,{note:'old note',tags:['occlusion']}),ui=await startUI({bookmarks:[first]}),e=ui.elements;
 assert.equal(bookmarkJumpButtons(ui).length,1);assert.ok(e['bookmarks-list'].textContent.includes('old note'));
 await showFirst(ui);assert.equal(e['bookmark-note'].value,'old note');assert.equal(e['bookmark-tag-occlusion'].checked,true);
 editBookmark(ui,'reviewed crossing',['crossing']);const saving=e['bookmark-save'].onclick();await flush();
 const updated=bookmarkRecord(1,{note:'reviewed crossing',tags:['crossing']});
 ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[updated]));await saving;
 e['sessions-list'].value='session-b';const b=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b');await b;
 e['sessions-list'].value='session-a';const a=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-a',true,null,[1,2,3],[updated]);await a;
 await showFirst(ui);assert.equal(e['bookmark-note'].value,'reviewed crossing');
 assert.equal(e['bookmark-tag-crossing'].checked,true);assert.equal(e['bookmark-tag-occlusion'].checked,false);
 assert.equal(bookmarkJumpButtons(ui).length,1);
});

test('marking during pending autoplay binds to the displayed frame and cancels late images',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 e['bookmark-mark'].onclick();editBookmark(ui,'occlusion starts here',['occlusion']);
 const saving=e['bookmark-save'].onclick();await flush();
 assert.equal(bookmarkWrites(ui).at(-1).url,'/api/sessions/session-a/frames/1/bookmark');
 await ui.decodeFrame('session-a',2);await ui.tick(1000);
 assert.equal(e.rgb.src,'data:image/png;base64,session-a-1');assertProgress(ui,1,3);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.match(e['playback-status'].textContent,/Paused/);
 ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{note:'occlusion starts here',tags:['occlusion']})]));await saving;
});

test('bookmark focus pauses playback and cancels an in-flight progress seek before editing',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 const seek=scrub(ui,3);await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 e['bookmark-note'].focus();editBookmark(ui,'shown first frame');
 await ui.decodeFrame('session-a',3);await seek;assertProgress(ui,1,3);
 assert.equal(e.rgb.src,'data:image/png;base64,session-a-1');assert.equal(e['frames-list'].value,'1');
 const saving=e['bookmark-save'].onclick();await flush();assert.equal(bookmarkWrites(ui).at(-1).url,'/api/sessions/session-a/frames/1/bookmark');
 ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{note:'shown first frame'})]));await saving;
});

test('jumping to a bookmark presents matching images, progress and IDs while retaining A/B',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(3,{note:'crossing'})]}),e=ui.elements;
 await showFirst(ui);configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 const image=e.rgb,jumping=bookmarkJumpButtons(ui)[0].onclick();await flush();
 ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 assert.equal(e.rgb,image,'jump keeps the displayed image while the target loads');
 await ui.decodeFrame('session-a',3);await jumping;await ui.decodeFrame('session-a',2);await ui.tick(1000);
 assert.equal(e.rgb.src,'data:image/png;base64,session-a-3');assertProgress(ui,3,3);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');
 assert.equal(e['bookmark-note'].value,'crossing');assert.equal(e['loop-enabled'].checked,true);
 assert.equal(e['loop-start'].value,'1');assert.equal(e['loop-end'].value,'2');assert.match(e['playback-status'].textContent,/Paused/);
});

test('a bookmarked jump rejects a changed snapshot and retains the last complete replay',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(3,{note:'original snapshot only'})]}),e=ui.elements;
 await showFirst(ui);const image=e.rgb,depth=e.depth,jumping=bookmarkJumpButtons(ui)[0].onclick();await flush();
 ui.respond('/api/sessions/session-a/frames/3/replay',{...replayResponse('session-a',3),snapshot_sha256:otherHash});await jumping;await flush();
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertProgress(ui,1,3);assert.equal(e['frames-list'].value,'1');
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.equal(ui.cloudUpdates.length,1);
 assert.equal(ui.decoding.filter(item=>!item.done).length,0,'a mismatched bookmark target must not decode or present');
 assert.match(e.status.textContent,/snapshot|Request failed/i);assert.equal(e['bookmark-note'].value,'');
});

test('an older Session bookmark list cannot overwrite the newly selected Session',async()=>{
 const ui=await startUI({delayBookmarks:true}),e=ui.elements;
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'new Session note'})]);await switched;
 ui.respond('/api/sessions/session-a/bookmarks',bookmarkResponse('session-a',[bookmarkRecord(1,{note:'stale Session note'})]));await flush();
 assert.equal(e['sessions-list'].value,'session-b');assert.ok(e['bookmarks-list'].textContent.includes('new Session note'));
 assert.equal(e['bookmarks-list'].textContent.includes('stale Session note'),false);
 assert.equal(ui.pending.some(p=>p.url==='/api/sessions/session-a/temporal'),false);
});

test('an old Session save response cannot replace another Session list or discard its draft',async()=>{
 const ui=await startUI(),e=ui.elements;await showFirst(ui);editBookmark(ui,'saving in A');
 const saving=e['bookmark-save'].onclick();await flush();
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(1,{note:'B saved note'})]);await switched;
 await showSaved(ui,1,{sid:'session-b'});editBookmark(ui,'B draft',['crossing']);
 ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{note:'saving in A'})]));await saving;
 assert.equal(e['bookmark-note'].value,'B draft');assert.equal(e['bookmark-tag-crossing'].checked,true);
 assert.ok(e['bookmarks-list'].textContent.includes('B saved note'));assert.equal(e['bookmarks-list'].textContent.includes('saving in A'),false);
});

test('failed bookmark updates preserve the draft and saved list without sending parallel writes',async()=>{
 const saved=bookmarkRecord(1,{note:'saved note'}),ui=await startUI({bookmarks:[saved]}),e=ui.elements;await showFirst(ui);
 editBookmark(ui,'unsaved review',['id-switch']);const saving=e['bookmark-save'].onclick();await flush();
 assert.equal(e['bookmark-save'].disabled,true);e['bookmark-save'].onclick();e['bookmark-delete'].onclick();await flush();
 assert.equal(bookmarkWrites(ui).length,1,'busy mutations must not overlap');
 ui.respond('/api/sessions/session-a/frames/1/bookmark',{detail:'Storage unavailable'},false,500);await saving;
 assert.equal(e['bookmark-note'].value,'unsaved review');assert.equal(e['bookmark-tag-id-switch'].checked,true);
 assert.ok(e['bookmarks-list'].textContent.includes('saved note'));assert.equal(e['bookmarks-list'].textContent.includes('unsaved review'),false);
 assert.equal(e['bookmark-save'].disabled,false);assert.match(e['bookmarks-status'].textContent,/error|fail|Storage/i);
 const next=scrub(ui,2);await flush();await completeReplay(ui,2);await next;
 const back=scrub(ui,1);await flush();await completeReplay(ui,1);await back;
 assert.equal(e['bookmark-note'].value,'unsaved review');assert.equal(e['bookmark-tag-id-switch'].checked,true);
 assert.equal(bookmarkWrites(ui).length,1,'navigation must not auto-save a draft');
});

test('bookmark drafts are independent for saved snapshots with repeated source frame IDs',async()=>{
 const ui=await startUI(),e=ui.elements;await showFirst(ui);editBookmark(ui,'first snapshot draft',['occlusion']);
 const next=scrub(ui,2);await flush();
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();await ui.decodeFrame('session-a',2);await next;
 assert.equal(e['bookmark-note'].value,'');editBookmark(ui,'second snapshot draft',['crossing']);
 const back=scrub(ui,1);await flush();await completeReplay(ui,1);await back;
 assert.equal(e['bookmark-note'].value,'first snapshot draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-tag-crossing'].checked,false);
 const again=scrub(ui,2);await flush();await completeReplay(ui,2);await again;
 assert.equal(e['bookmark-note'].value,'second snapshot draft');assert.equal(e['bookmark-tag-crossing'].checked,true);
 assert.equal(bookmarkWrites(ui).length,0);
});

test('deleting a bookmark targets the current saved snapshot and leaves other bookmarks intact',async()=>{
 const one=bookmarkRecord(1,{note:'first'}),two=bookmarkRecord(2,{note:'second'}),ui=await startUI({bookmarks:[one,two]}),e=ui.elements;await showFirst(ui);
 editBookmark(ui,'x'.repeat(1001));assert.equal(e['bookmark-save'].disabled,true);assert.equal(e['bookmark-delete'].disabled,false);
 const deleting=e['bookmark-delete'].onclick();await flush();const write=bookmarkWrites(ui).at(-1);
 assert.equal(write.url,'/api/sessions/session-a/frames/1/bookmark');assert.equal(write.opt.method,'DELETE');
 assert.deepEqual(JSON.parse(write.opt.body),{snapshot_sha256:hash});
 ui.respond(write.url,bookmarkResponse('session-a',[two]));await deleting;
 assert.equal(e['bookmark-delete'].disabled,true);assert.equal(e['bookmark-note'].value,'');assert.equal(bookmarkJumpButtons(ui).length,1);
 assert.ok(e['bookmarks-list'].textContent.includes('second'));assert.equal(e['bookmarks-list'].textContent.includes('first'),false);
});

test('an empty general bookmark is allowed, while overlong notes cannot be submitted',async()=>{
 const ui=await startUI(),e=ui.elements;await showFirst(ui);
 for(const note of ['x'.repeat(1001),'hidden\u0000control','hidden\u0085control','unpaired\ud800','unpaired\udfff']){
  editBookmark(ui,note);assert.equal(e['bookmark-save'].disabled,true);
  e['bookmark-save'].onclick();await flush();assert.equal(bookmarkWrites(ui).length,0);
 }
 editBookmark(ui,'');assert.equal(e['bookmark-save'].disabled,false);const saving=e['bookmark-save'].onclick();await flush();
 assert.deepEqual(JSON.parse(bookmarkWrites(ui).at(-1).opt.body),{snapshot_sha256:hash,tags:[],note:''});
 ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1)]));await saving;
 assert.equal(bookmarkJumpButtons(ui).length,1);assert.equal(e['bookmark-delete'].disabled,false);
});

test('bookmark note limits count Unicode characters and preserve permitted tabs and newlines',async()=>{
 const ui=await startUI(),e=ui.elements;await showFirst(ui);const note='😀'.repeat(997)+'\n\t終';
 editBookmark(ui,note);assert.equal(e['bookmark-save'].disabled,false);const saving=e['bookmark-save'].onclick();await flush();
 assert.equal(JSON.parse(bookmarkWrites(ui).at(-1).opt.body).note,note);
 ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{note})]));await saving;
 assert.ok(e['bookmarks-list'].textContent.includes(note));
});

test('a bookmark list with stale snapshot identity cannot enable annotations or block normal replay',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1,{snapshot_sha256:otherHash,note:'wrong snapshot note'})]}),e=ui.elements;
 assert.equal(bookmarkJumpButtons(ui).length,0);assert.equal(e['bookmarks-list'].textContent.includes('wrong snapshot note'),false);
 await showFirst(ui);assertProgress(ui,1,3);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 assert.equal(e['bookmark-save'].disabled,true);assert.equal(e['bookmark-delete'].disabled,true);
 assert.equal(bookmarkWrites(ui).length,0);
});

test('a save completing after navigation updates its list without overwriting another frame draft',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);editBookmark(ui,'keep second frame draft',['crossing']);
 const first=scrub(ui,1);await flush();await completeReplay(ui,1);await first;editBookmark(ui,'save first frame',['id-switch']);
 const saving=e['bookmark-save'].onclick();await flush();const next=scrub(ui,2);await flush();await completeReplay(ui,2);await next;
 assert.equal(e['bookmark-note'].value,'keep second frame draft');assert.equal(e['bookmark-note'].disabled,true);
 ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{note:'save first frame',tags:['id-switch']})]));await saving;
 assertProgress(ui,2,3);assert.equal(e['bookmark-note'].value,'keep second frame draft');assert.equal(e['bookmark-tag-crossing'].checked,true);
 assert.ok(e['bookmarks-list'].textContent.includes('save first frame'));assert.equal(bookmarkWrites(ui).length,1);
 const back=scrub(ui,1);await flush();await completeReplay(ui,1);await back;
 assert.equal(e['bookmark-note'].value,'save first frame');assert.equal(e['bookmark-tag-id-switch'].checked,true);
});

const bookmarkRevision='c'.repeat(64);
function bookmarkImportResponse(sid,bookmarks,{dryRun=true,policy='keep',revision=bookmarkRevision,counts={incoming:1,added:1,updated:0,unchanged:0,conflicts:0}}={}){
 return {format:'depthport.bookmark-import.v1',session_id:sid,dry_run:dryRun,conflict_policy:policy,revision,counts,
  document:bookmarkResponse(sid,bookmarks)};
}
function importUrl(sid='session-a',policy='keep',dryRun=true){return '/api/sessions/'+sid+'/bookmarks/import?conflict='+policy+'&dry_run='+dryRun}
function bookmarkImports(ui){return ui.pending.filter(p=>p.url.includes('/bookmarks/import?'))}
function fakeBookmarkFile(document,{size,deferred=false,error=null,bytes}={}){
 const payload=bytes??Buffer.from(JSON.stringify(document),'utf8');
 const buffer=Uint8Array.from(payload).buffer;
 let resolve,reject,reads=0;
 const waiting=deferred?new Promise((yes,no)=>{resolve=yes;reject=no}):null;
 const file={name:'bookmark-backup.json',type:'application/json',size:size??payload.length,
  arrayBuffer:()=>{reads++;return waiting??(error?Promise.reject(error):Promise.resolve(buffer))}};
 return {file,bytes:payload,get reads(){return reads},resolve:()=>resolve(buffer),reject:error=>reject(error)};
}
async function chooseImport(ui,backup){
 const input=ui.elements['bookmark-import-file'];input.files=[backup.file];
 await input.onchange();await flush();
}
async function previewImport(ui,bookmarks,options={}){
 const previewing=ui.elements['bookmark-import-preview'].onclick();await flush();
 ui.respond(importUrl(options.sid,options.policy),bookmarkImportResponse(options.sid||'session-a',bookmarks,options));
 await previewing;await flush();
}

test('bookmark export is a Session-bound native download of saved notes and freezes playback without saving drafts',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1,{note:'saved review'})]}),e=ui.elements;
 await showFirst(ui);editBookmark(ui,'unsaved private draft',['occlusion']);
 assert.equal(e['bookmark-export'].href,'/api/sessions/session-a/bookmarks/export');
 e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 const fetches=ui.pending.length;e['bookmark-export'].onclick();await ui.decodeFrame('session-a',2);await ui.tick(1000);
 assert.equal(ui.pending.length,fetches,'native download needs no JavaScript fetch or annotation save');
 assert.equal(bookmarkWrites(ui).length,0);assertProgress(ui,1,3);
 assert.equal(e['bookmark-note'].value,'unsaved private draft');assert.match(e['playback-status'].textContent,/Paused/);
 assert.ok(e['bookmarks-list'].textContent.includes('saved review'));
 assert.equal(e['bookmarks-list'].textContent.includes('unsaved private draft'),false);
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 await finishFrames(ui,'session-b');await switched;
 assert.equal(e['bookmark-export'].href,'/api/sessions/session-b/bookmarks/export');
});

test('selecting JSON reads bytes locally; preview makes no bookmark changes and apply uses the reviewed revision',async()=>{
 const saved=bookmarkRecord(1,{note:'saved first'}),incoming=bookmarkRecord(3,{note:'incoming third 😀',tags:['crossing']});
 const ui=await startUI({bookmarks:[saved]}),e=ui.elements;await showFirst(ui);editBookmark(ui,'keep local draft',['occlusion']);
 const backup=fakeBookmarkFile(bookmarkResponse('session-a',[incoming]));
 const fetches=ui.pending.length;await chooseImport(ui,backup);
 assert.equal(backup.reads,1);assert.equal(ui.pending.length,fetches,'choosing a local file must not upload or import it');
 assert.equal(e['bookmark-import-policy'].value,'keep');assert.equal(e['bookmark-import-preview'].disabled,false);assert.equal(e['bookmark-import-apply'].disabled,true);
 const previewing=e['bookmark-import-preview'].onclick();await flush();const preview=bookmarkImports(ui).at(-1);
 assert.equal(preview.url,importUrl());assert.equal(preview.opt.method,'POST');
 assert.equal(preview.opt.headers['Content-Type'],'application/json');assert.equal(preview.opt.headers['If-Match'],undefined);
 assert.deepEqual(Buffer.from(preview.opt.body),backup.bytes,'the original bounded UTF-8 bytes are sent unchanged');
 ui.respond(preview.url,bookmarkImportResponse('session-a',[incoming,saved]));await previewing;
 assert.equal(bookmarkJumpButtons(ui).length,1);assert.equal(e['bookmarks-list'].textContent.includes('incoming third'),false,'dry run must not replace actual bookmarks');
 assert.match(e['bookmark-import-status'].textContent,/incoming.*1/i);assert.match(e['bookmark-import-status'].textContent,/add(?:ed)?.*1/i);
 assert.equal(e['bookmark-import-apply'].disabled,false);
 const applying=e['bookmark-import-apply'].onclick();await flush();const apply=bookmarkImports(ui).at(-1);
 assert.equal(apply.url,importUrl('session-a','keep',false));assert.equal(apply.opt.headers['If-Match'],'"'+bookmarkRevision+'"');
 assert.deepEqual(Buffer.from(apply.opt.body),backup.bytes);
 ui.respond(apply.url,bookmarkImportResponse('session-a',[incoming,saved],{dryRun:false}));await applying;
 const buttons=bookmarkJumpButtons(ui);assert.equal(buttons.length,2);
 assert.match(buttons[0].textContent,/1/);assert.match(buttons[1].textContent,/3/);
 assert.ok(e['bookmarks-list'].textContent.includes('incoming third 😀'));
 assert.equal(e['bookmark-note'].value,'keep local draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);
 assert.equal(bookmarkWrites(ui).length,0,'import must never auto-save an existing editor draft');
});

test('keep is the default conflict policy and explicitly choosing overwrite requires a new preview',async()=>{
 const saved=bookmarkRecord(1,{note:'local saved note'}),incoming=bookmarkRecord(1,{note:'backup version'});
 const ui=await startUI({bookmarks:[saved]}),e=ui.elements;await showFirst(ui);
 await chooseImport(ui,fakeBookmarkFile(bookmarkResponse('session-a',[incoming])));
 await previewImport(ui,[saved],{counts:{incoming:1,added:0,updated:0,unchanged:0,conflicts:1}});
 assert.equal(e['bookmark-import-apply'].disabled,false);assert.ok(e['bookmarks-list'].textContent.includes('local saved note'));
 e['bookmark-import-policy'].value='overwrite';e['bookmark-import-policy'].onchange();await flush();
 assert.equal(e['bookmark-import-apply'].disabled,true);const prior=bookmarkImports(ui).length;
 e['bookmark-import-apply'].onclick();await flush();assert.equal(bookmarkImports(ui).length,prior,'an old keep preview cannot authorize overwrite');
 await previewImport(ui,[incoming],{policy:'overwrite',counts:{incoming:1,added:0,updated:1,unchanged:0,conflicts:1}});
 assert.ok(e['bookmarks-list'].textContent.includes('local saved note'));assert.equal(e['bookmark-note'].value,'local saved note');
 const applying=e['bookmark-import-apply'].onclick();await flush();
 ui.respond(importUrl('session-a','overwrite',false),bookmarkImportResponse('session-a',[incoming],{dryRun:false,policy:'overwrite',counts:{incoming:1,added:0,updated:1,unchanged:0,conflicts:1}}));await applying;
 assert.equal(e['bookmark-note'].value,'backup version');assert.ok(e['bookmarks-list'].textContent.includes('backup version'));
 assert.equal(e['bookmarks-list'].textContent.includes('local saved note'),false);
});

test('preview and apply block parallel annotation mutations, and failed apply preserves saved notes and drafts',async()=>{
 const saved=bookmarkRecord(1,{note:'saved note'}),merged=[saved,bookmarkRecord(2,{note:'new backup note'})];
 const ui=await startUI({bookmarks:[saved]}),e=ui.elements;await showFirst(ui);editBookmark(ui,'unsaved investigation',['id-switch']);
 await chooseImport(ui,fakeBookmarkFile(bookmarkResponse('session-a',[merged[1]])));
 const previewing=e['bookmark-import-preview'].onclick();await flush();
 assert.equal(e['bookmark-import-file'].disabled,true);assert.equal(e['bookmark-import-policy'].disabled,true);
 assert.equal(e['bookmark-save'].disabled,true);assert.equal(e['bookmark-delete'].disabled,true);
 e['bookmark-import-preview'].onclick();e['bookmark-import-apply'].onclick();e['bookmark-save'].onclick();e['bookmark-delete'].onclick();await flush();
 assert.equal(bookmarkImports(ui).length,1);assert.equal(bookmarkWrites(ui).length,0);
 ui.respond(importUrl(),bookmarkImportResponse('session-a',merged));await previewing;
 const applying=e['bookmark-import-apply'].onclick();await flush();
 e['bookmark-import-apply'].onclick();e['bookmark-import-preview'].onclick();e['bookmark-save'].onclick();e['bookmark-delete'].onclick();await flush();
 assert.equal(bookmarkImports(ui).length,2);assert.equal(bookmarkWrites(ui).length,0);
 ui.respond(importUrl('session-a','keep',false),{detail:'Bookmark revision changed; preview again'},false,409);await applying;
 assert.equal(bookmarkJumpButtons(ui).length,1);assert.ok(e['bookmarks-list'].textContent.includes('saved note'));
 assert.equal(e['bookmarks-list'].textContent.includes('new backup note'),false);
 assert.equal(e['bookmark-note'].value,'unsaved investigation');assert.equal(e['bookmark-tag-id-switch'].checked,true);
 assert.equal(e['bookmark-save'].disabled,false);assert.equal(e['bookmark-import-file'].disabled,false);
 assert.equal(e['bookmark-import-preview'].disabled,false);assert.equal(e['bookmark-import-apply'].disabled,true,'a failed apply requires a fresh preview');
 assert.match(e['bookmark-import-status'].textContent,/revision|fail|error|did not complete/i);
});

test('file size and read failures cannot reach import endpoints or enable apply',async()=>{
 const ui=await startUI(),e=ui.elements;
 for(const options of [{size:0},{size:1048577},{size:1,bytes:Buffer.alloc(0)},{size:1,bytes:Buffer.alloc(1048577)},{error:Error('Local file unavailable')}]){
  const backup=fakeBookmarkFile(bookmarkResponse('session-a'),options);await chooseImport(ui,backup);
  assert.equal(e['bookmark-import-preview'].disabled,true);assert.equal(e['bookmark-import-apply'].disabled,true);
  e['bookmark-import-preview'].onclick();e['bookmark-import-apply'].onclick();await flush();
  assert.equal(bookmarkImports(ui).length,0);
  if(options.size===0||options.size>1048576)assert.equal(backup.reads,0,'reject the declared size before reading bytes');
 }
});

test('a late file read cannot revive a replaced file or cross a Session boundary',async()=>{
 const ui=await startUI(),e=ui.elements;
 const stale=fakeBookmarkFile(bookmarkResponse('session-a',[bookmarkRecord(1,{note:'old file'})]),{deferred:true});
 e['bookmark-import-file'].files=[stale.file];const reading=e['bookmark-import-file'].onchange();await flush();
 const current=fakeBookmarkFile(bookmarkResponse('session-a',[bookmarkRecord(2,{note:'new file'})]));await chooseImport(ui,current);
 stale.resolve();await reading;const previewing=e['bookmark-import-preview'].onclick();await flush();
 assert.deepEqual(Buffer.from(bookmarkImports(ui).at(-1).opt.body),current.bytes);
 ui.respond(importUrl(),bookmarkImportResponse('session-a',[bookmarkRecord(2,{note:'new file'})]));await previewing;
 const other=fakeBookmarkFile(bookmarkResponse('session-a',[bookmarkRecord(3)]),{deferred:true});
 e['bookmark-import-file'].files=[other.file];const oldReading=e['bookmark-import-file'].onchange();await flush();
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b');await switched;
 other.resolve();await oldReading;await flush();
 assert.equal(e['bookmark-import-preview'].disabled,true);assert.equal(e['bookmark-import-apply'].disabled,true);
 const calls=bookmarkImports(ui).length;e['bookmark-import-preview'].onclick();await flush();assert.equal(bookmarkImports(ui).length,calls);
 assert.equal(e['bookmark-export'].href,'/api/sessions/session-b/bookmarks/export');
});

test('a late preview response cannot change a newly selected Session or its draft',async()=>{
 const ui=await startUI(),e=ui.elements;await chooseImport(ui,fakeBookmarkFile(bookmarkResponse('session-a',[bookmarkRecord(1,{note:'old backup'})])));
 const previewing=e['bookmark-import-preview'].onclick();await flush();
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(1,{note:'B saved note'})]);await switched;
 await showSaved(ui,1,{sid:'session-b'});editBookmark(ui,'B editor draft',['crossing']);
 ui.respond(importUrl(),bookmarkImportResponse('session-a',[bookmarkRecord(1,{note:'old backup'})]));await previewing;
 assert.equal(e['bookmark-import-apply'].disabled,true);assert.equal(e['bookmark-note'].value,'B editor draft');
 assert.ok(e['bookmarks-list'].textContent.includes('B saved note'));assert.equal(e['bookmarks-list'].textContent.includes('old backup'),false);
});

test('a late apply response cannot replace another Session list or editor draft',async()=>{
 const ui=await startUI(),e=ui.elements;const imported=bookmarkRecord(1,{note:'A imported note'});
 await chooseImport(ui,fakeBookmarkFile(bookmarkResponse('session-a',[imported])));await previewImport(ui,[imported]);
 const applying=e['bookmark-import-apply'].onclick();await flush();
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'B saved note'})]);await switched;
 await showSaved(ui,1,{sid:'session-b'});editBookmark(ui,'B unsaved draft',['occlusion']);
 ui.respond(importUrl('session-a','keep',false),bookmarkImportResponse('session-a',[imported],{dryRun:false}));await applying;
 assert.equal(e['bookmark-note'].value,'B unsaved draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);
 assert.ok(e['bookmarks-list'].textContent.includes('B saved note'));assert.equal(e['bookmarks-list'].textContent.includes('A imported note'),false);
 assert.equal(e['bookmark-import-apply'].disabled,true);assert.equal(e['bookmark-save'].disabled,false);
});

test('changing the selected file invalidates a valid preview and requires reviewing the replacement bytes',async()=>{
 const ui=await startUI(),e=ui.elements,old=bookmarkRecord(1,{note:'first backup'}),next=bookmarkRecord(2,{note:'second backup'});
 await chooseImport(ui,fakeBookmarkFile(bookmarkResponse('session-a',[old])));await previewImport(ui,[old]);
 assert.equal(e['bookmark-import-apply'].disabled,false);
 await chooseImport(ui,fakeBookmarkFile(bookmarkResponse('session-a',[next])));
 assert.equal(e['bookmark-import-apply'].disabled,true);
 const before=bookmarkImports(ui).length;e['bookmark-import-apply'].onclick();await flush();assert.equal(bookmarkImports(ui).length,before);
 const previewing=e['bookmark-import-preview'].onclick();await flush();
 ui.respond(importUrl(),bookmarkImportResponse('session-a',[next]));await previewing;
 assert.equal(e['bookmark-import-apply'].disabled,false);assert.equal(bookmarkJumpButtons(ui).length,0);
 assert.equal(bookmarkWrites(ui).length,0);
});

test('preview rejects imported snapshot mismatches and an invalid revision without touching saved bookmarks',async()=>{
 for(const response of [
  bookmarkImportResponse('session-a',[bookmarkRecord(2,{snapshot_sha256:otherHash,note:'wrong snapshot'})]),
  bookmarkImportResponse('session-a',[bookmarkRecord(2)],{revision:'not-a-revision'}),
 ]){
  const saved=bookmarkRecord(1,{note:'saved review'}),ui=await startUI({bookmarks:[saved]}),e=ui.elements;
  await chooseImport(ui,fakeBookmarkFile(bookmarkResponse('session-a',[bookmarkRecord(2)])));
  const previewing=e['bookmark-import-preview'].onclick();await flush();ui.respond(importUrl(),response);await previewing;
  assert.equal(e['bookmark-import-apply'].disabled,true);assert.equal(bookmarkJumpButtons(ui).length,1);
  assert.ok(e['bookmarks-list'].textContent.includes('saved review'));assert.equal(e['bookmarks-list'].textContent.includes('wrong snapshot'),false);
 }
});

test('saving or deleting bookmarks invalidates a reviewed backup before another import can apply',async()=>{
 for(const remove of [false,true]){
  const saved=bookmarkRecord(1,{note:'saved'}),ui=await startUI({bookmarks:[saved]}),e=ui.elements;await showFirst(ui);
  await chooseImport(ui,fakeBookmarkFile(bookmarkResponse('session-a',[bookmarkRecord(3)])));await previewImport(ui,[saved,bookmarkRecord(3)]);
  assert.equal(e['bookmark-import-apply'].disabled,false);
  if(!remove)editBookmark(ui,'new saved note');
  const writing=e[remove?'bookmark-delete':'bookmark-save'].onclick();await flush();assert.equal(e['bookmark-import-apply'].disabled,true);
  ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',remove?[]:[bookmarkRecord(1,{note:'new saved note'})]));await writing;
  assert.equal(e['bookmark-import-apply'].disabled,true);const before=bookmarkImports(ui).length;e['bookmark-import-apply'].onclick();await flush();
  assert.equal(bookmarkImports(ui).length,before);
 }
});

test('refreshing the current Session clears any selected backup and preview permission',async()=>{
 const ui=await startUI(),e=ui.elements;await chooseImport(ui,fakeBookmarkFile(bookmarkResponse('session-a',[bookmarkRecord(2)])));
 await previewImport(ui,[bookmarkRecord(2)]);assert.equal(e['bookmark-import-apply'].disabled,false);
 const refreshed=e.refresh.onclick();await flush();ui.respond('/api/sessions/status',{tracking_worker_configured:true});await flush();
 ui.respond('/api/sessions',{sessions:[{session_id:'session-a',label:'A',frame_count:3}]});await flush();await finishFrames(ui,'session-a');await refreshed;
 assert.equal(e['bookmark-import-preview'].disabled,true);assert.equal(e['bookmark-import-apply'].disabled,true);
 assert.equal(bookmarkJumpButtons(ui).length,0);assert.equal(bookmarkWrites(ui).length,0);
});

function visibleBookmarkIndices(ui){return bookmarkJumpButtons(ui).map(button=>Number(button.getAttribute('data-index')))}
function filterBookmarkTag(ui,tag){const input=ui.elements['bookmark-filter-tag'];input.value=tag;input.onchange()}
function searchBookmarkNotes(ui,query){const input=ui.elements['bookmark-search'];input.value=query;input.oninput()}
function assertBookmarkCount(ui,matched,total){
 assert.match(ui.elements['bookmark-filter-status'].textContent,new RegExp('\\b'+matched+'\\s*(?:/|of)\\s*'+total+'\\b'));
}

test('bookmark categories select saved tags, include multi-tag rows and distinguish general bookmarks',async()=>{
 const bookmarks=[bookmarkRecord(1,{tags:['id-switch','crossing'],note:'first'}),
  bookmarkRecord(2,{tags:['occlusion'],note:'second'}),bookmarkRecord(3,{note:'third'})];
 const ui=await startUI({bookmarks}),e=ui.elements;
 assert.equal(e['bookmark-filter-tag'].value,'all');assert.equal(e['bookmark-search'].value,'');
 assert.deepEqual(visibleBookmarkIndices(ui),[1,2,3]);assertBookmarkCount(ui,3,3);
 for(const [tag,indices] of [['id-switch',[1]],['crossing',[1]],['occlusion',[2]],['general',[3]],['all',[1,2,3]]]){
  filterBookmarkTag(ui,tag);assert.deepEqual(visibleBookmarkIndices(ui),indices);assertBookmarkCount(ui,indices.length,3);
 }
});

test('bookmark note search combines a category and a literal keyword without regex interpretation',async()=>{
 const bookmarks=[bookmarkRecord(1,{tags:['occlusion'],note:'review [a+b].* crossing'}),
  bookmarkRecord(2,{tags:['crossing'],note:'review [a+b].* crossing'}),bookmarkRecord(3,{tags:['occlusion'],note:'different'})];
 const ui=await startUI({bookmarks});filterBookmarkTag(ui,'occlusion');searchBookmarkNotes(ui,'[a+b].*');
 assert.deepEqual(visibleBookmarkIndices(ui),[1]);assertBookmarkCount(ui,1,3);
 searchBookmarkNotes(ui,'^review');assert.deepEqual(visibleBookmarkIndices(ui),[]);assertBookmarkCount(ui,0,3);
 searchBookmarkNotes(ui,'review');filterBookmarkTag(ui,'crossing');assert.deepEqual(visibleBookmarkIndices(ui),[2]);
 searchBookmarkNotes(ui,'occlusion');assert.deepEqual(visibleBookmarkIndices(ui),[],'category labels are not note keywords');
});

test('bookmark note matching normalizes English case, fullwidth text and surrounding query whitespace',async()=>{
 const bookmarks=[bookmarkRecord(1,{note:'疑似換 ＩＤ — ReCHECK 車輛交會'}),
  bookmarkRecord(2,{note:'ID reassigned after 遮擋'}),bookmarkRecord(3,{note:'ＡＢＣ１２３'})];
 const ui=await startUI({bookmarks});
 for(const [query,indices] of [['  id  ',[1,2]],['ＲＥｃｈｅｃｋ',[1]],['車輛交會',[1]],['abc123',[3]],['　　',[1,2,3]],['',[1,2,3]]]){
  searchBookmarkNotes(ui,query);assert.deepEqual(visibleBookmarkIndices(ui),indices,query);assertBookmarkCount(ui,indices.length,3);
 }
});

test('filtering and clearing retain all saved bookmarks, the current draft and replay state without network work',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1,{note:'saved first',tags:['id-switch']}),bookmarkRecord(3,{note:'saved third'})]}),e=ui.elements;
 await showFirst(ui);editBookmark(ui,'unsaved crossing investigation',['crossing']);configureLoop(ui,1,2);
 const image=e.rgb,cloudCount=ui.cloudUpdates.length,fetchCount=ui.pending.length,writeCount=bookmarkWrites(ui).length;
 const exportHref=e['bookmark-export'].href;
 filterBookmarkTag(ui,'id-switch');searchBookmarkNotes(ui,'missing');assert.deepEqual(visibleBookmarkIndices(ui),[]);
 assertBookmarkCount(ui,0,2);assert.match(e['bookmark-filter-status'].textContent,/no match/i);
 assert.equal(e['bookmark-note'].value,'unsaved crossing investigation');assert.equal(e['bookmark-tag-crossing'].checked,true);
 e['bookmark-filter-clear'].onclick();await flush();
 assert.equal(e['bookmark-filter-tag'].value,'all');assert.equal(e['bookmark-search'].value,'');
 assert.deepEqual(visibleBookmarkIndices(ui),[1,3]);assertBookmarkCount(ui,2,2);
 assert.equal(e.rgb,image);assertProgress(ui,1,3);assert.equal(e['frames-list'].value,'1');assert.equal(ui.cloudUpdates.length,cloudCount);
 assert.equal(e['bookmark-note'].value,'unsaved crossing investigation');assert.equal(e['bookmark-tag-crossing'].checked,true);
 assert.equal(e['loop-enabled'].checked,true);assert.equal(e['loop-start'].value,'1');assert.equal(e['loop-end'].value,'2');
 assert.equal(ui.pending.length,fetchCount);assert.equal(bookmarkWrites(ui).length,writeCount);
 assert.equal(e['bookmark-export'].href,exportHref,'export remains the complete saved Session document');
});

test('searching uses only saved notes while a newer editor draft remains independent',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1,{note:'saved occlusion review',tags:['occlusion']})]}),e=ui.elements;await showFirst(ui);
 editBookmark(ui,'unsaved switch investigation',['id-switch']);searchBookmarkNotes(ui,'unsaved');
 assert.deepEqual(visibleBookmarkIndices(ui),[]);assertBookmarkCount(ui,0,1);
 searchBookmarkNotes(ui,'saved occlusion');assert.deepEqual(visibleBookmarkIndices(ui),[1]);
 filterBookmarkTag(ui,'id-switch');assert.deepEqual(visibleBookmarkIndices(ui),[],'draft tags do not enter saved category results');
 filterBookmarkTag(ui,'occlusion');assert.deepEqual(visibleBookmarkIndices(ui),[1]);
 assert.equal(e['bookmark-note'].value,'unsaved switch investigation');assert.equal(e['bookmark-tag-id-switch'].checked,true);
 assert.equal(bookmarkWrites(ui).length,0);
});

test('filtering and clearing during autoplay neither pause nor cancel the pending next frame',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(3,{note:'crossing',tags:['crossing']})]}),e=ui.elements;
 await showFirst(ui);configureLoop(ui,1,3);e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 const requests=ui.pending.length;filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'cross');e['bookmark-filter-clear'].onclick();
 assert.equal(ui.pending.length,requests);assert.equal(e['playback-pause'].disabled,false);assert.match(e['playback-status'].textContent,/Playing/);
 await ui.decodeFrame('session-a',2);assertProgress(ui,2,3);assert.equal(e.rgb.src,'data:image/png;base64,session-a-2');
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(e['loop-enabled'].checked,true);
 e['playback-pause'].onclick();assert.equal(bookmarkWrites(ui).length,0);
});

test('a filtered bookmark jump pauses playback and commits matching replay identity while retaining A/B',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1,{note:'first'}),bookmarkRecord(3,{note:'intersection crossing',tags:['crossing']})]}),e=ui.elements;
 await showFirst(ui);configureLoop(ui,1,2);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'intersection');
 assert.deepEqual(visibleBookmarkIndices(ui),[3]);e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 const jumping=bookmarkJumpButtons(ui)[0].onclick();await flush();
 ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();await ui.decodeFrame('session-a',3);await jumping;
 await ui.decodeFrame('session-a',2);await ui.tick(1000);
 assertProgress(ui,3,3);assert.equal(e.rgb.src,'data:image/png;base64,session-a-3');assert.equal(e['frames-list'].value,'3');
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');assert.equal(e['bookmark-note'].value,'intersection crossing');
 assert.match(e['playback-status'].textContent,/Paused/);assert.equal(e['loop-enabled'].checked,true);assert.equal(e['loop-start'].value,'1');assert.equal(e['loop-end'].value,'2');
 assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'intersection');assertBookmarkCount(ui,1,2);
});

test('bookmark filter controls distinguish loading, failed and truly empty saved lists',async()=>{
 const ui=await startUI({delayBookmarks:true}),e=ui.elements;
 for(const id of ['bookmark-filter-tag','bookmark-search','bookmark-filter-clear'])assert.equal(e[id].disabled,true,id);
 assert.match(e['bookmarks-status'].textContent,/loading/i);assert.doesNotMatch(e['bookmark-filter-status'].textContent,/no match/i);
 ui.respond('/api/sessions/session-a/bookmarks',{detail:'Storage unavailable'},false,500);await flush();
 for(const id of ['bookmark-filter-tag','bookmark-search','bookmark-filter-clear'])assert.equal(e[id].disabled,true,id);
 assert.match(e['bookmarks-status'].textContent,/could not|fail|error/i);assert.doesNotMatch(e['bookmark-filter-status'].textContent,/no match/i);
 const empty=await startUI();for(const id of ['bookmark-filter-tag','bookmark-search'])assert.equal(empty.elements[id].disabled,false,id);
 assert.equal(empty.elements['bookmark-filter-clear'].disabled,true,'neutral filters have nothing to clear');
 assertBookmarkCount(empty,0,0);assert.doesNotMatch(empty.elements['bookmark-filter-status'].textContent,/no match/i);
 searchBookmarkNotes(empty,'missing');assertBookmarkCount(empty,0,0);assert.doesNotMatch(empty.elements['bookmark-filter-status'].textContent,/no match/i);
});

test('switching or refreshing a Session resets transient filters before loading another bookmark list',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1,{note:'first',tags:['id-switch']})]}),e=ui.elements;
 filterBookmarkTag(ui,'id-switch');searchBookmarkNotes(ui,'first');
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 assert.equal(e['bookmark-filter-tag'].value,'all');assert.equal(e['bookmark-search'].value,'');assert.equal(e['bookmark-search'].disabled,true);
 await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'second',tags:['occlusion']})]);await switched;
 assert.deepEqual(visibleBookmarkIndices(ui),[2]);assertBookmarkCount(ui,1,1);
 filterBookmarkTag(ui,'occlusion');searchBookmarkNotes(ui,'second');
 const refreshed=e.refresh.onclick();await flush();ui.respond('/api/sessions/status',{tracking_worker_configured:true});await flush();
 ui.respond('/api/sessions',{sessions:[{session_id:'session-b',label:'B',frame_count:3}]});await flush();
 assert.equal(e['bookmark-filter-tag'].value,'all');assert.equal(e['bookmark-search'].value,'');
 await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(3,{note:'new list',tags:['crossing']})]);await refreshed;
 assert.deepEqual(visibleBookmarkIndices(ui),[3]);assertBookmarkCount(ui,1,1);
});

test('a save and delete re-render the active filter without treating filter changes as bookmark writes',async()=>{
 const saved=bookmarkRecord(1,{note:'old note',tags:['occlusion']}),other=bookmarkRecord(2,{note:'switch next',tags:['id-switch']});
 const ui=await startUI({bookmarks:[saved,other]}),e=ui.elements;await showFirst(ui);
 filterBookmarkTag(ui,'id-switch');searchBookmarkNotes(ui,'switch');assert.deepEqual(visibleBookmarkIndices(ui),[2]);
 editBookmark(ui,'switch confirmed',['id-switch']);const saving=e['bookmark-save'].onclick();await flush();
 for(const id of ['bookmark-filter-tag','bookmark-search','bookmark-filter-clear'])assert.equal(e[id].disabled,false,id);
 searchBookmarkNotes(ui,'confirmed');assert.deepEqual(visibleBookmarkIndices(ui),[]);
 const updated=bookmarkRecord(1,{note:'switch confirmed',tags:['id-switch']});
 ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[updated,other]));await saving;
 assert.deepEqual(visibleBookmarkIndices(ui),[1]);assertBookmarkCount(ui,1,2);assert.equal(e['bookmark-filter-tag'].value,'id-switch');assert.equal(e['bookmark-search'].value,'confirmed');
 const deleting=e['bookmark-delete'].onclick();await flush();searchBookmarkNotes(ui,'switch');
 ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[other]));await deleting;
 assert.deepEqual(visibleBookmarkIndices(ui),[2]);assertBookmarkCount(ui,1,1);assert.equal(bookmarkWrites(ui).length,2);
});

test('import preview preserves active filter results and apply updates them without exporting a filtered subset',async()=>{
 const saved=bookmarkRecord(1,{note:'saved review',tags:['occlusion']}),incoming=bookmarkRecord(3,{note:'intersection crossing',tags:['crossing']});
 const ui=await startUI({bookmarks:[saved]}),e=ui.elements;
 await chooseImport(ui,fakeBookmarkFile(bookmarkResponse('session-a',[incoming])));
 filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'intersection');assert.deepEqual(visibleBookmarkIndices(ui),[]);
 const previewing=e['bookmark-import-preview'].onclick();await flush();
 for(const id of ['bookmark-filter-tag','bookmark-search','bookmark-filter-clear'])assert.equal(e[id].disabled,false,id);
 ui.respond(importUrl(),bookmarkImportResponse('session-a',[saved,incoming]));await previewing;
 assert.deepEqual(visibleBookmarkIndices(ui),[]);assertBookmarkCount(ui,0,1);
 const applying=e['bookmark-import-apply'].onclick();await flush();searchBookmarkNotes(ui,'crossing');
 ui.respond(importUrl('session-a','keep',false),bookmarkImportResponse('session-a',[saved,incoming],{dryRun:false}));await applying;
 assert.deepEqual(visibleBookmarkIndices(ui),[3]);assertBookmarkCount(ui,1,2);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'crossing');
 assert.equal(e['bookmark-export'].href,'/api/sessions/session-a/bookmarks/export');assert.equal(bookmarkWrites(ui).length,0);assert.equal(bookmarkImports(ui).length,2);
 e['bookmark-filter-clear'].onclick();assert.deepEqual(visibleBookmarkIndices(ui),[1,3]);assertBookmarkCount(ui,2,2);
});

const bookmarkNavPairs=[['bookmark-prev','bookmark-next'],['bookmark-list-prev','bookmark-list-next']];
function assertBookmarkNav(ui,previous,next,{busy=false}={}){
 for(const [prevId,nextId] of bookmarkNavPairs){
  for(const [id,target] of [[prevId,previous],[nextId,next]]){
   const button=ui.elements[id];assert.ok(button,id+' exists');
   assert.equal(button.disabled,busy||target===null,id+' availability');
   if(target!==null)assert.equal(button.getAttribute('data-index'),String(target),id+' target saved index');
  }
 }
 assert.equal(ui.elements['bookmark-nav-status'].textContent,ui.elements['bookmark-list-nav-status'].textContent,'both toolbars describe the same position');
}
function assertBookmarkNavPosition(ui,position,total){
 const text=ui.elements['bookmark-nav-status'].textContent;
 assert.match(text,new RegExp('\\b'+position+'\\s*(?:/|of)\\s*'+total+'\\b'));
 assert.equal(text,ui.elements['bookmark-list-nav-status'].textContent);
}
async function jumpBookmarkNav(ui,direction,index,{list=false,...options}={}){
 const id='bookmark-'+(list?'list-':'')+direction,jumping=ui.elements[id].onclick();await flush();
 await completeReplay(ui,index,options);await jumping;return jumping;
}

test('both bookmark toolbars disable unavailable lists and start from the first filtered bookmark before any replay',async()=>{
 for(const delayBookmarks of [false,true]){
  const ui=await startUI({delayBookmarks}),e=ui.elements;
  assertBookmarkNav(ui,null,null);assert.equal(replayRequests(ui).length,0);
  if(delayBookmarks){
   ui.respond('/api/sessions/session-a/bookmarks',{detail:'Unavailable'},false,500);await flush();
   assertBookmarkNav(ui,null,null);assert.equal(replayRequests(ui).length,0);
  }else{
   assert.equal(e['bookmark-nav-status'].textContent.length>0,true);
  }
 }
 const ui=await startUI({bookmarks:[bookmarkRecord(3),bookmarkRecord(1)]});
 assertBookmarkNav(ui,null,1);await jumpBookmarkNav(ui,'next',1,{list:true});
 assertBookmarkNav(ui,null,3);assertBookmarkNavPosition(ui,1,2);assertProgress(ui,1,3);
});

test('bookmark navigation uses strict nearest filtered neighbors and never wraps at either end',async()=>{
 const bookmarks=[bookmarkRecord(1,{tags:['crossing']}),bookmarkRecord(2,{tags:['occlusion']}),bookmarkRecord(3,{tags:['crossing']})];
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks}),e=ui.elements;filterBookmarkTag(ui,'crossing');
 await showSaved(ui,2);assertBookmarkNav(ui,1,3);
 await jumpBookmarkNav(ui,'next',3);assertBookmarkNav(ui,1,null);assertBookmarkNavPosition(ui,2,2);
 const count=replayRequests(ui).length;await e['bookmark-list-next'].onclick();await flush();assert.equal(replayRequests(ui).length,count);
 await jumpBookmarkNav(ui,'prev',1,{list:true});assertBookmarkNav(ui,null,3);assertBookmarkNavPosition(ui,1,2);
 await e['bookmark-prev'].onclick();await flush();assert.equal(replayRequests(ui).length,count+1);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
});

test('one matched bookmark is reachable from either side while zero matches disable both controls',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(2,{note:'recheck crossing',tags:['crossing']})]});
 assertBookmarkNav(ui,null,2);await showSaved(ui,1);assertBookmarkNav(ui,null,2);
 await jumpBookmarkNav(ui,'next',2);assertBookmarkNav(ui,null,null);assertBookmarkNavPosition(ui,1,1);
 await showSaved(ui,3);assertBookmarkNav(ui,2,null);
 searchBookmarkNotes(ui,'missing');assertBookmarkNav(ui,null,null);assertBookmarkCount(ui,0,1);
 searchBookmarkNotes(ui,'RECHECK');assertBookmarkNav(ui,2,null);
});

test('bookmark targets follow saved option positions rather than source frame IDs or contiguous arithmetic',async()=>{
 const indices=[12,4,9],bookmarks=indices.map(index=>bookmarkRecord(index));
 const ui=await startUI({frameIndices:indices,bookmarks});
 assertBookmarkNav(ui,null,12);await jumpBookmarkNav(ui,'next',12);assertProgress(ui,1,3);
 assertBookmarkNav(ui,null,4);assertBookmarkNavPosition(ui,1,3);
 await jumpBookmarkNav(ui,'next',4,{list:true});assertProgress(ui,2,3);assertBookmarkNav(ui,12,9);assertBookmarkNavPosition(ui,2,3);
 await jumpBookmarkNav(ui,'next',9);assertProgress(ui,3,3);assertBookmarkNav(ui,4,null);assertBookmarkNavPosition(ui,3,3);
});

test('navigation and list filtering share the combined saved tag and normalized note keyword',async()=>{
 const bookmarks=[bookmarkRecord(1,{tags:['occlusion'],note:'recheck A'}),bookmarkRecord(2,{tags:['crossing'],note:'recheck B'}),bookmarkRecord(3,{tags:['occlusion'],note:'ＲＥＣＨＥＣＫ C'})];
 const ui=await startUI({bookmarks});await showSaved(ui,2);filterBookmarkTag(ui,'occlusion');searchBookmarkNotes(ui,' reCHECK ');
 assert.deepEqual(visibleBookmarkIndices(ui),[1,3]);assertBookmarkNav(ui,1,3);
 searchBookmarkNotes(ui,'C');assert.deepEqual(visibleBookmarkIndices(ui),[1,3]);assertBookmarkNav(ui,1,3);
 searchBookmarkNotes(ui,'recheck C');assert.deepEqual(visibleBookmarkIndices(ui),[3]);assertBookmarkNav(ui,null,3);
 ui.elements['bookmark-filter-clear'].onclick();assertBookmarkNav(ui,1,3);
});

test('a pending progress target and changed dropdown cannot replace the committed bookmark navigation anchor',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showSaved(ui,1);
 e['frames-list'].value='3';e['replay-progress'].value='2';e['replay-progress'].oninput();await flush();
 assertBookmarkNav(ui,null,3);const jumping=e['bookmark-list-next'].onclick();await flush();
 await completeReplay(ui,3);await jumping;assertProgress(ui,3,3);assertBookmarkNav(ui,1,null);
 assert.equal(replayRequests(ui).length,2,'a thumb preview does not load or become the anchor');
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');
});

test('a bookmark neighbor jump cancels pending autoplay and keeps both toolbars serialized until commit',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);
 configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();assertBookmarkNav(ui,null,3);
 const jumping=e['bookmark-next'].onclick();await flush();assertBookmarkNav(ui,null,3,{busy:true});
 const calls=replayRequests(ui).length;await e['bookmark-list-next'].onclick();await e['bookmark-prev'].onclick();await flush();assert.equal(replayRequests(ui).length,calls);
 ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();ui.decode('data:image/png;base64,session-a-3');await flush();
 assertBookmarkNav(ui,null,3,{busy:true});assertProgress(ui,1,3);assert.equal(e['frames-list'].value,'1');
 ui.decode('data:image/jpeg;base64,session-a-depth-3');await jumping;await ui.decodeFrame('session-a',2);await ui.tick(1000);
 assertProgress(ui,3,3);assertBookmarkNav(ui,1,null);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');
 assert.match(e['playback-status'].textContent,/Paused/);assert.equal(e['loop-enabled'].checked,true);assert.equal(e['loop-end'].value,'2');
});

test('filter, search and clear changes cancel only a pending bookmark jump and reject its late decoding',async()=>{
 for(const change of ['tag','search','clear']){
  const bookmarks=[bookmarkRecord(1,{tags:['crossing'],note:'first'}),bookmarkRecord(3,{tags:['crossing'],note:'third'})];
  const ui=await startUI({trackingReport:trackedSequence(),bookmarks}),e=ui.elements;await showFirst(ui);
  if(change==='clear')filterBookmarkTag(ui,'crossing');
  const image=e.rgb,jumping=e['bookmark-list-next'].onclick();await flush();
  ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
  if(change==='tag')filterBookmarkTag(ui,'occlusion');else if(change==='search')searchBookmarkNotes(ui,'first');else e['bookmark-filter-clear'].onclick();
  await ui.decodeFrame('session-a',3);await jumping;
  assert.equal(e.rgb,image);assertProgress(ui,1,3);assert.equal(ui.cloudUpdates.length,1);
  assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
  assertBookmarkNav(ui,null,change==='clear'?3:null);
 }
});

test('a direct list jump can supersede a pending neighbor jump without the old completion re-enabling stale targets',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(2),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);
 const first=e['bookmark-next'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 const second=bookmarkJumpButtons(ui).find(b=>b.getAttribute('data-index')==='3').onclick();await flush();
 ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 await ui.decodeFrame('session-a',2);await first;assertBookmarkNav(ui,null,2,{busy:true});assertProgress(ui,1,3);
 await ui.decodeFrame('session-a',3);await second;assertBookmarkNav(ui,2,null);assertBookmarkNavPosition(ui,2,2);assertProgress(ui,3,3);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');
});

test('failed fetch, snapshot validation and image decode restore both bookmark toolbars to the last complete frame',async()=>{
 for(const failure of ['fetch','snapshot','decode']){
  const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);
  const image=e.rgb,depth=e.depth,jumping=e['bookmark-list-next'].onclick();await flush();assertBookmarkNav(ui,null,3,{busy:true});
  if(failure==='fetch')ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'Unavailable'},false,404);
  else{
   ui.respond('/api/sessions/session-a/frames/3/replay',{...replayResponse('session-a',3),...(failure==='snapshot'?{snapshot_sha256:otherHash}:{})});await flush();
   if(failure==='decode'){ui.decode('data:image/png;base64,session-a-3',Error('Decode failed'));ui.decode('data:image/jpeg;base64,session-a-depth-3')}
  }
  await jumping;assertBookmarkNav(ui,null,3);assertBookmarkNavPosition(ui,1,2);assertProgress(ui,1,3);
  assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(e['frames-list'].value,'1');assert.equal(ui.cloudUpdates.length,1);
  assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.match(e.status.textContent,/Request failed/);
 }
});

test('manual frame seeking and page exit cancel a pending bookmark target without leaving navigation busy',async()=>{
 for(const cancel of ['seek','mark','edit','pagehide']){
  const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);
  const jumping=e['bookmark-next'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
  let seeking;
  if(cancel==='seek'){e['frames-list'].value='2';seeking=e['frames-list'].onchange();await flush()}
  else if(cancel==='mark')e['bookmark-mark'].onclick();else if(cancel==='edit')e['bookmark-note'].focus();else ui.pagehide();
  await ui.decodeFrame('session-a',3);await jumping;
  if(seeking){await completeReplay(ui,2);await seeking;assertProgress(ui,2,3);assertBookmarkNav(ui,1,3)}
  else{assertProgress(ui,1,3);assertBookmarkNav(ui,null,3)}
  assert.equal(e.rgb.src,'data:image/png;base64,session-a-'+(cancel==='seek'?2:1));
 }
});

test('switching Sessions cancels a pending bookmark neighbor and loads targets for the new saved list',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);
 const jumping=e['bookmark-next'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();assertBookmarkNav(ui,null,null);
 await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2)]);await switched;await ui.decodeFrame('session-a',3);await jumping;
 assert.equal(e.result.hidden,true);assertBookmarkNav(ui,null,2);assert.equal(ui.cloudUpdates.length,1);
 await jumpBookmarkNav(ui,'next',2,{list:true,sid:'session-b'});assertBookmarkNav(ui,null,null);assertBookmarkNavPosition(ui,1,1);assertProgress(ui,2,3);
});

test('neighbor jumps retain per-frame drafts and A/B settings across revisiting bookmarks',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1,{note:'saved first'}),bookmarkRecord(3,{note:'saved third'})]}),e=ui.elements;await showFirst(ui);
 editBookmark(ui,'unsaved review',['id-switch']);configureLoop(ui,1,2);await jumpBookmarkNav(ui,'next',3);
 assert.equal(e['bookmark-note'].value,'saved third');await jumpBookmarkNav(ui,'prev',1,{list:true});
 assert.equal(e['bookmark-note'].value,'unsaved review');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(bookmarkWrites(ui).length,0);
 assert.equal(e['loop-enabled'].checked,true);assert.equal(e['loop-start'].value,'1');assert.equal(e['loop-end'].value,'2');assertBookmarkNav(ui,null,3);
});

test('save and delete disable both bookmark toolbars during writes and recompute the active filtered targets',async()=>{
 const first=bookmarkRecord(1,{note:'first',tags:['occlusion']}),third=bookmarkRecord(3,{note:'third',tags:['crossing']});
 const ui=await startUI({bookmarks:[first,third]}),e=ui.elements;await showFirst(ui);filterBookmarkTag(ui,'crossing');assertBookmarkNav(ui,null,3);
 editBookmark(ui,'first crossing',['crossing']);const saving=e['bookmark-save'].onclick();await flush();assertBookmarkNav(ui,null,3,{busy:true});
 const requests=replayRequests(ui).length;await e['bookmark-next'].onclick();await flush();assert.equal(replayRequests(ui).length,requests);
 const updated=bookmarkRecord(1,{note:'first crossing',tags:['crossing']});ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[updated,third]));await saving;
 assertBookmarkNav(ui,null,3);assertBookmarkNavPosition(ui,1,2);
 const deleting=e['bookmark-delete'].onclick();await flush();assertBookmarkNav(ui,null,3,{busy:true});ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[third]));await deleting;
 assertBookmarkNav(ui,null,3);assertBookmarkCount(ui,1,1);
});

test('import preview and apply serialize bookmark navigation and refresh targets only after saved changes',async()=>{
 const first=bookmarkRecord(1,{tags:['crossing'],note:'first'}),third=bookmarkRecord(3,{tags:['crossing'],note:'third'});
 const ui=await startUI({bookmarks:[first]}),e=ui.elements;await showSaved(ui,2);filterBookmarkTag(ui,'crossing');assertBookmarkNav(ui,1,null);
 await chooseImport(ui,fakeBookmarkFile(bookmarkResponse('session-a',[third])));
 const previewing=e['bookmark-import-preview'].onclick();await flush();assertBookmarkNav(ui,1,null,{busy:true});
 ui.respond(importUrl(),bookmarkImportResponse('session-a',[first,third]));await previewing;assertBookmarkNav(ui,1,null);
 const applying=e['bookmark-import-apply'].onclick();await flush();assertBookmarkNav(ui,1,null,{busy:true});
 ui.respond(importUrl('session-a','keep',false),bookmarkImportResponse('session-a',[first,third],{dryRun:false}));await applying;assertBookmarkNav(ui,1,3);
 await jumpBookmarkNav(ui,'next',3,{list:true});assertBookmarkNav(ui,1,null);assertBookmarkNavPosition(ui,2,2);
});

test('a bookmark neighbor jump supersedes an already loading progress seek using the displayed frame as its anchor',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);
 const seeking=scrub(ui,2);await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 assertBookmarkNav(ui,null,3);const jumping=e['bookmark-next'].onclick();await flush();assertBookmarkNav(ui,null,3,{busy:true});
 await completeReplay(ui,3);await jumping;await ui.decodeFrame('session-a',2);await seeking;
 assertProgress(ui,3,3);assertBookmarkNav(ui,1,null);assertBookmarkNavPosition(ui,2,2);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');assert.equal(ui.cloudUpdates.length,2);
});

test('a completed autoplay frame refreshes both bookmark neighbors while ordinary filtering keeps playback running',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1,{tags:['crossing']}),bookmarkRecord(2,{tags:['occlusion']}),bookmarkRecord(3,{tags:['crossing']})]}),e=ui.elements;
 await showFirst(ui);assertBookmarkNav(ui,null,2);assertBookmarkNavPosition(ui,1,3);
 e['playback-play'].onclick();await ui.tick(0);filterBookmarkTag(ui,'crossing');assertBookmarkNav(ui,null,3);
 await completeReplay(ui,2);assertProgress(ui,2,3);assertBookmarkNav(ui,1,3);assert.match(e['playback-status'].textContent,/Playing/);
 e['bookmark-filter-clear'].onclick();assertBookmarkNav(ui,1,3);assertBookmarkNavPosition(ui,2,3);assert.equal(e['playback-pause'].disabled,false);
 e['playback-pause'].onclick();
});

function pressBookmarkKey(ui,key,properties={}){return ui.dispatch('keydown',{key,...properties})}
async function completeBookmarkKey(ui,key,index,properties={}){
 const event=pressBookmarkKey(ui,key,properties);assert.equal(event.defaultPrevented,true,'a valid bookmark shortcut is consumed');
 await flush();await completeReplay(ui,index);await flush();return event;
}

test('bracket shortcuts navigate nearest filtered bookmarks in both directions with coherent frame IDs',async()=>{
 const bookmarks=[bookmarkRecord(1,{tags:['crossing'],note:'Review first'}),bookmarkRecord(2,{tags:['occlusion'],note:'Review second'}),bookmarkRecord(3,{tags:['crossing'],note:'ＲＥＶＩＥＷ third'})];
 const ui=await startUI({bookmarks,trackingReport:trackedSequence()}),e=ui.elements;
 await showSaved(ui,2);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,' review ');
 await completeBookmarkKey(ui,']',3);assertProgress(ui,3,3);assertBookmarkNavPosition(ui,2,2);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');
 await completeBookmarkKey(ui,'[',1);assertProgress(ui,1,3);assertBookmarkNavPosition(ui,1,2);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 assert.equal(bookmarkWrites(ui).length,0);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,' review ');
});

test('bookmark shortcuts are unconsumed at boundaries, with no matches or before bookmarks are available',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]});
 assert.equal(pressBookmarkKey(ui,'[').defaultPrevented,false);await completeBookmarkKey(ui,']',1);
 const calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,'[').defaultPrevented,false);await flush();assert.equal(replayRequests(ui).length,calls);
 await completeBookmarkKey(ui,']',3);assert.equal(pressBookmarkKey(ui,']').defaultPrevented,false);
 searchBookmarkNotes(ui,'no matching note');assert.equal(pressBookmarkKey(ui,'[').defaultPrevented,false);assert.equal(pressBookmarkKey(ui,']').defaultPrevented,false);
 for(const delayed of [false,true]){
  const unavailable=await startUI({delayBookmarks:delayed});
  assert.equal(pressBookmarkKey(unavailable,'[').defaultPrevented,false);assert.equal(pressBookmarkKey(unavailable,']').defaultPrevented,false);
  assert.equal(replayRequests(unavailable).length,0);
 }
});

test('typing in native form controls never triggers bookmark shortcuts or consumes text keys',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);
 const calls=replayRequests(ui).length;
 for(const target of [e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e.label,e['replay-progress'],e['bookmark-shortcuts-enabled'],new Element('select'),new Element('input'),new Element('textarea')]){
  assert.equal(pressBookmarkKey(ui,']',{target}).defaultPrevented,false,target.id||target.tagName);
  assert.equal(pressBookmarkKey(ui,'[',{target}).defaultPrevented,false,target.id||target.tagName);
 }
 e['bookmark-note'].focus();assert.equal(pressBookmarkKey(ui,']',{target:new Element('div')}).defaultPrevented,false,'focused note rejects retargeted events');
 e['bookmark-search'].focus();assert.equal(pressBookmarkKey(ui,']',{target:new Element('button')}).defaultPrevented,false,'focused search rejects retargeted events');
 ui.dispatch('paste',{target:e['bookmark-note'],clipboardData:{getData:()=>'] ['}});await flush();
 assert.equal(replayRequests(ui).length,calls);assertProgress(ui,1,3);assert.equal(bookmarkWrites(ui).length,0);
 ui.document.activeElement=null;await completeBookmarkKey(ui,']',3);
});

test('contenteditable and accessible custom editors guard descendants, active focus and shadow event paths',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]});await showFirst(ui);
 const calls=replayRequests(ui).length;
 const editors=[];
 for(const value of ['', 'true', 'plaintext-only']){const editor=new Element('div');editor.setAttribute('contenteditable',value);editors.push(editor)}
 for(const role of ['textbox','searchbox','combobox','spinbutton']){const editor=new Element('div');editor.setAttribute('role',role);editors.push(editor)}
 const nativeEditable=new Element('div');nativeEditable.isContentEditable=true;editors.push(nativeEditable);
 for(const editor of editors){
  const child=new Element('span');editor.append(child);
  assert.equal(pressBookmarkKey(ui,']',{target:editor}).defaultPrevented,false);
  assert.equal(pressBookmarkKey(ui,']',{target:child}).defaultPrevented,false);
  assert.equal(pressBookmarkKey(ui,']',{composedPath:()=>[new Element('span'),child,editor]}).defaultPrevented,false);
  ui.document.activeElement=child;assert.equal(pressBookmarkKey(ui,']').defaultPrevented,false);ui.document.activeElement=null;
 }
 await flush();assert.equal(replayRequests(ui).length,calls);assertProgress(ui,1,3);
 const readonly=new Element('div');readonly.setAttribute('contenteditable','false');
 await completeBookmarkKey(ui,']',3,{target:readonly});
});

test('bookmark shortcuts ignore modified, repeated, composing, prevented and unrelated key events',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]});await showFirst(ui);
 const calls=replayRequests(ui).length;
 for(const properties of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229}]){
  const event=pressBookmarkKey(ui,']',properties);assert.equal(event.defaultPrevented,false,JSON.stringify(properties));
 }
 const prevented=pressBookmarkKey(ui,']',{defaultPrevented:true});assert.equal(prevented.defaultPrevented,true);
 for(const key of ['ArrowLeft','ArrowRight','j','k','{','}','Escape','Process','Dead',''])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key);
 await flush();assert.equal(replayRequests(ui).length,calls);assertProgress(ui,1,3);
 await completeBookmarkKey(ui,']',3);
});

test('composition state blocks bookmark navigation even when key events omit the composing flag',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]});await showFirst(ui);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,']',{isComposing:false}).defaultPrevented,false);await flush();assert.equal(replayRequests(ui).length,1);
 ui.dispatch('compositionend');await completeBookmarkKey(ui,']',3);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'[').defaultPrevented,false);
 ui.windowEvents.blur();await completeBookmarkKey(ui,'[',1);
});

test('shortcut opt-out controls both toolbars metadata and does not persist or alter manual navigation',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);
 assert.equal(e['bookmark-shortcuts-enabled'].checked,true);
 for(const [previous,next] of bookmarkNavPairs){assert.equal(e[previous].getAttribute('aria-keyshortcuts'),'[');assert.equal(e[next].getAttribute('aria-keyshortcuts'),']')}
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();
 for(const ids of bookmarkNavPairs)for(const id of ids)assert.equal(e[id].getAttribute('aria-keyshortcuts')||'', '');
 assert.equal(pressBookmarkKey(ui,']').defaultPrevented,false);await flush();assert.equal(replayRequests(ui).length,1);
 await jumpBookmarkNav(ui,'next',3);assertProgress(ui,3,3);
 e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();await completeBookmarkKey(ui,'[',1);
 const fresh=await startUI({bookmarks:[bookmarkRecord(1)]});assert.equal(fresh.elements['bookmark-shortcuts-enabled'].checked,true);
});

test('hidden-page shortcuts stay unconsumed and hiding clears stale composition state',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]});await showFirst(ui);
 ui.dispatch('compositionstart');ui.hide();assert.equal(pressBookmarkKey(ui,']').defaultPrevented,false);await flush();assert.equal(replayRequests(ui).length,1);
 ui.document.hidden=false;await completeBookmarkKey(ui,']',3);
});

test('keyboard bookmark jumps serialize requests while image decoding or annotation writes are pending',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);
 assert.equal(pressBookmarkKey(ui,']').defaultPrevented,true);await flush();const calls=replayRequests(ui).length;
 for(const key of [']','['])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);
 ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();ui.decode('data:image/png;base64,session-a-3');await flush();
 assert.equal(pressBookmarkKey(ui,'[').defaultPrevented,false);assert.equal(replayRequests(ui).length,calls);
 ui.decode('data:image/jpeg;base64,session-a-depth-3');await flush();assertProgress(ui,3,3);
 editBookmark(ui,'synthetic pending review',['crossing']);const saving=e['bookmark-save'].onclick();await flush();
 assert.equal(pressBookmarkKey(ui,'[').defaultPrevented,false);assert.equal(replayRequests(ui).length,calls);
 ui.respond('/api/sessions/session-a/frames/3/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1),bookmarkRecord(3,{note:'synthetic pending review',tags:['crossing']})]));await saving;
 await completeBookmarkKey(ui,'[',1);
});

test('keyboard navigation cancels a stale seek and preserves saved-snapshot drafts and A/B settings',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1,{note:'saved first'}),bookmarkRecord(3,{note:'saved third'})],trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 editBookmark(ui,'synthetic unsaved note',['id-switch']);configureLoop(ui,1,2);
 const seeking=scrub(ui,2);await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 await completeBookmarkKey(ui,']',3);await ui.decodeFrame('session-a',2);await seeking;assertProgress(ui,3,3);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');await completeBookmarkKey(ui,'[',1);
 assert.equal(e['bookmark-note'].value,'synthetic unsaved note');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(bookmarkWrites(ui).length,0);
 assert.equal(e['loop-enabled'].checked,true);assert.equal(e['loop-start'].value,'1');assert.equal(e['loop-end'].value,'2');
});

test('Session changes invalidate a keyboard bookmark jump and leave shortcuts unavailable until the new list is ready',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);
 assert.equal(pressBookmarkKey(ui,']').defaultPrevented,true);await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 for(const key of ['[',']'])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);
 await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2)]);await switched;await ui.decodeFrame('session-a',3);await flush();
 assert.equal(e.result.hidden,true);assertBookmarkNav(ui,null,2);
 assert.equal(pressBookmarkKey(ui,']').defaultPrevented,true);await flush();await completeReplay(ui,2,{sid:'session-b'});await flush();assertProgress(ui,2,3);
 assert.equal(e.rgb.src,'data:image/png;base64,session-b-2');assert.equal(pressBookmarkKey(ui,']').defaultPrevented,false);
});
