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
  this._value='';this._selectedIndex=-1;this.hidden=false;this.disabled=false;this.open=false;
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
   if(part==='a[href]')return node.tagName.toLowerCase()==='a'&&node.getAttribute('href')!==null;
   if(part==='[contenteditable]:not([contenteditable="false"])')return node.getAttribute('contenteditable')!==null&&node.getAttribute('contenteditable')!=='false';
   const role=part.match(/^\[role="([^"]+)"\]$/);return role&&node.getAttribute('role')===role[1];
  });
  for(let node=this;node;node=node.parentElement)if(matches(node))return node;
  return null;
 }
 // Model only the native dialog contract; actual focus trapping/Esc are browser-tested.
 showModal(){this.modalFocus=this.ownerDocument.activeElement;this.open=true;this.modalShows=(this.modalShows||0)+1;this.ownerDocument.getElementById('shortcut-help-close').focus()}
 close(){if(!this.open)return;this.open=false;this.modalCloses=(this.modalCloses||0)+1;this.modalFocus?.focus();this.onclose?.()}
 getContext(){return null}
 scrollIntoView(options){(this.scrollCalls??=[]).push(options)}
 focus(options){this.focused=true;(this.focusCalls??=[]).push(options);if(this.ownerDocument)this.ownerDocument.activeElement=this;this.onfocus?.()}
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
 for(const key of ['j','k','{','}','Escape','Process','Dead',''])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key);
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

const playbackShortcutKeys=[' ','ArrowLeft','ArrowRight'];
async function completeFrameKey(ui,key,index,options={}){
 const event=pressBookmarkKey(ui,key,options.event);assert.equal(event.defaultPrevented,true,'an available frame shortcut is consumed');
 await flush();await completeReplay(ui,index,options);await flush();return event;
}
function assertShownFrame(ui,index){
 const e=ui.elements;assert.equal(e.rgb.src,'data:image/png;base64,session-a-'+index);
 assert.equal(e.depth.src,'data:image/jpeg;base64,session-a-depth-'+index);assert.equal(e['frames-list'].value,String(index));
 assert.equal(ui.cloudUpdates.at(-1)[0],'points-session-a-'+index);assertProgress(ui,index,3);
}

test('Space plays, pauses, resumes and restarts after the final saved frame with synchronized Object IDs',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,true);await ui.tick(0);await completeReplay(ui,2);
 assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');
 assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,true);await ui.tick(1000);
 assert.match(e['playback-status'].textContent,/Paused/);assert.equal(replayRequests(ui).length,2);
 assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,true);await ui.tick(0);await completeReplay(ui,3);await ui.tick(200);
 assertShownFrame(ui,3);assert.match(e['playback-status'].textContent,/End of saved frames/);
 assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,true);await ui.tick(0);await completeReplay(ui,1);
 assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,true);
});

test('Space cancels an in-flight autoplay frame without committing partially decoded images or IDs',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 pressBookmarkKey(ui,' ');await ui.tick(0);ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 ui.decode('data:image/png;base64,session-a-2');await flush();const image=e.rgb,depth=e.depth;
 assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,true);ui.decode('data:image/jpeg;base64,session-a-depth-2');await ui.tick(1000);
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertShownFrame(ui,1);assert.equal(ui.cloudUpdates.length,1);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.match(e['playback-status'].textContent,/Paused/);
});

test('Space preserves A/B playback while arrow steps can inspect frames outside the loop and bookmark filters',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(3,{tags:['crossing'],note:'synthetic match'})]}),e=ui.elements;
 await showFirst(ui);configureLoop(ui,2,3);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'synthetic match');
 assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,true);await ui.tick(0);await completeReplay(ui,2);
 await ui.tick(200);await completeReplay(ui,3);await ui.tick(200);await completeReplay(ui,2);
 assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,true);await completeFrameKey(ui,'ArrowLeft',1);assertShownFrame(ui,1);
 assert.equal(e['loop-enabled'].checked,true);assert.equal(e['loop-start'].value,'2');assert.equal(e['loop-end'].value,'3');
 assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'synthetic match');assert.equal(bookmarkWrites(ui).length,0);
 assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,true);await ui.tick(0);await completeReplay(ui,2);pressBookmarkKey(ui,' ');
});

test('arrow shortcuts commit one complete saved frame at a time and serialize repeated manual requests',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);const image=e.rgb,depth=e.depth;
 assert.equal(pressBookmarkKey(ui,'ArrowRight').defaultPrevented,true);await flush();
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(e.result.hidden,false);assertShownFrame(ui,1);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 for(const key of playbackShortcutKeys)assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key);
 assert.equal(replayRequests(ui).length,2);ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();
 assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.match(e['playback-status'].textContent,/Paused/);
 await completeFrameKey(ui,'ArrowLeft',1);assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
});

test('arrow targets use the displayed saved order rather than numeric IDs or an uncommitted selector value',async()=>{
 const ui=await startUI({frameIndices:[12,4,9],bookmarks:[bookmarkRecord(12),bookmarkRecord(9)]}),e=ui.elements;
 assert.equal(pressBookmarkKey(ui,'ArrowLeft').defaultPrevented,false);
 await completeFrameKey(ui,'ArrowRight',12);assertProgress(ui,1,3);assert.equal(e['frames-list'].value,'12');
 e['frames-list'].value='9';await completeFrameKey(ui,'ArrowRight',4);assertProgress(ui,2,3);assert.equal(e['frames-list'].value,'4');
 await completeFrameKey(ui,'ArrowRight',9);assertProgress(ui,3,3);assert.equal(e['frames-list'].value,'9');
 const calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,'ArrowRight').defaultPrevented,false);await flush();assert.equal(replayRequests(ui).length,calls);
 await completeFrameKey(ui,'ArrowLeft',4);await completeFrameKey(ui,'ArrowLeft',12);
 assert.equal(pressBookmarkKey(ui,'ArrowLeft').defaultPrevented,false);assert.equal(bookmarkWrites(ui).length,0);
});

test('an arrow pauses autoplay and cancels its pending next frame using the last displayed frame as the anchor',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);
 pressBookmarkKey(ui,' ');await ui.tick(0);ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 ui.decode('data:image/png;base64,session-a-3');await flush();
 await completeFrameKey(ui,'ArrowLeft',1);ui.decode('data:image/jpeg;base64,session-a-depth-3');await ui.tick(1000);
 assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 assert.equal(ui.cloudUpdates.length,2);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(replayRequests(ui).length,3);
});

test('playback shortcuts leave progress previews, manual seeks, bookmark jumps and annotation writes undisturbed',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);
 e['replay-progress'].value='2';e['replay-progress'].oninput();const beforePreview=replayRequests(ui).length;
 for(const key of playbackShortcutKeys)assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key);
 assert.equal(replayRequests(ui).length,beforePreview);const seeking=e['replay-progress'].onchange();await flush();
 for(const key of playbackShortcutKeys)assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key);
 await completeReplay(ui,2);await seeking;
 const jumping=e['bookmark-next'].onclick();await flush();for(const key of playbackShortcutKeys)assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key);
 await completeReplay(ui,3);await jumping;editBookmark(ui,'synthetic pending write',['crossing']);const saving=e['bookmark-save'].onclick();await flush();
 const calls=replayRequests(ui).length;for(const key of playbackShortcutKeys)assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key);
 assert.equal(replayRequests(ui).length,calls);ui.respond('/api/sessions/session-a/frames/3/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1),bookmarkRecord(3,{note:'synthetic pending write',tags:['crossing']})]));await saving;
 await completeFrameKey(ui,'ArrowLeft',2);assertShownFrame(ui,2);
});

test('Space follows Play availability and frame shortcuts work without saved bookmarks being loaded',async()=>{
 const empty=await startUI({frameIndices:[]});for(const key of playbackShortcutKeys)assert.equal(pressBookmarkKey(empty,key).defaultPrevented,false,key);
 assert.equal(replayRequests(empty).length,0);
 const ui=await startUI({delayBookmarks:true});await showFirst(ui);configureLoop(ui,3,1);
 assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,false);await completeFrameKey(ui,'ArrowRight',2);assertShownFrame(ui,2);
 configureLoop(ui,1,3,false);assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,true);await ui.tick(0);await completeReplay(ui,3);pressBookmarkKey(ui,' ');
});

test('all playback shortcuts respect typing focus, editable descendants and shadow paths',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);const calls=replayRequests(ui).length;
 const guards=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress'],e['playback-speed'],e['bookmark-shortcuts-enabled']];
 for(const value of ['', 'true', 'plaintext-only']){const node=new Element('div');node.setAttribute('contenteditable',value);guards.push(node)}
 for(const role of ['textbox','searchbox','combobox','spinbutton','slider','listbox','radiogroup','menu','tablist','tree','grid']){const node=new Element('div');node.setAttribute('role',role);guards.push(node)}
 for(const target of guards)for(const key of playbackShortcutKeys){
  const child=new Element('span');target.append(child);
  assert.equal(pressBookmarkKey(ui,key,{target}).defaultPrevented,false,key+' target');
  assert.equal(pressBookmarkKey(ui,key,{target:child}).defaultPrevented,false,key+' descendant');
  assert.equal(pressBookmarkKey(ui,key,{composedPath:()=>[new Element('span'),child,target]}).defaultPrevented,false,key+' path');
  ui.document.activeElement=child;assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key+' focus');ui.document.activeElement=null;
 }
 await flush();assert.equal(replayRequests(ui).length,calls);assertShownFrame(ui,2);assert.equal(bookmarkWrites(ui).length,0);
});

test('Space preserves native and accessible action activation while arrows remain usable on ordinary buttons',async()=>{
 const ui=await startUI();await showFirst(ui);const guarded=[];
 for(const tag of ['button','summary','audio','video'])guarded.push(new Element(tag));
 const link=new Element('a');link.setAttribute('href','#synthetic');guarded.push(link);
 for(const role of ['button','link','tab','menuitem','menuitemcheckbox','menuitemradio','checkbox','radio','switch','option','treeitem']){const node=new Element('div');node.setAttribute('role',role);guarded.push(node)}
 for(const target of guarded){
  const child=new Element('span');target.append(child);
  assert.equal(pressBookmarkKey(ui,' ',{target}).defaultPrevented,false,target.tagName+' '+target.getAttribute('role'));
  assert.equal(pressBookmarkKey(ui,' ',{target:child}).defaultPrevented,false,'descendant');
  assert.equal(pressBookmarkKey(ui,' ',{composedPath:()=>[new Element('span'),child,target]}).defaultPrevented,false,'shadow path');
  ui.document.activeElement=child;assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,false,'active focus');ui.document.activeElement=null;
 }
 await flush();assert.equal(replayRequests(ui).length,1);await completeFrameKey(ui,'ArrowRight',2,{event:{target:new Element('button')}});assertShownFrame(ui,2);
});

test('playback shortcuts ignore modifiers, held keys, IME, prior consumption and hidden pages',async()=>{
 const ui=await startUI();await showSaved(ui,2);const calls=replayRequests(ui).length;
 for(const key of playbackShortcutKeys){
  for(const properties of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,properties).defaultPrevented,false,key+' '+JSON.stringify(properties));
  assert.equal(pressBookmarkKey(ui,key,{defaultPrevented:true}).defaultPrevented,true);
 }
 ui.dispatch('compositionstart');for(const key of playbackShortcutKeys)assert.equal(pressBookmarkKey(ui,key,{isComposing:false}).defaultPrevented,false);ui.dispatch('compositionend');
 ui.hide();for(const key of playbackShortcutKeys)assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);
 await flush();assert.equal(replayRequests(ui).length,calls);assertShownFrame(ui,2);ui.document.hidden=false;await completeFrameKey(ui,'ArrowLeft',1);
});

test('the shared shortcut switch clears all metadata and disables playback keys without changing button behavior',async()=>{
 const ui=await startUI(),e=ui.elements;await showFirst(ui);
 const metadata=[['playback-play','Space'],['playback-pause','Space'],['frame-prev','ArrowLeft'],['frame-next','ArrowRight']];
 for(const [id,key] of metadata)assert.equal(e[id].getAttribute('aria-keyshortcuts'),key);
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();
 for(const [id] of metadata)assert.equal(e[id].getAttribute('aria-keyshortcuts')||'','');
 for(const key of playbackShortcutKeys)assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);await flush();assert.equal(replayRequests(ui).length,1);
 const stepping=e['frame-next'].onclick();await flush();await completeReplay(ui,2);await stepping;assertShownFrame(ui,2);
 e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();await completeFrameKey(ui,'ArrowLeft',1);
 const fresh=await startUI();assert.equal(fresh.elements['bookmark-shortcuts-enabled'].checked,true);
});

test('failed keyboard frame loads preserve the complete displayed image, position and IDs and can be retried',async()=>{
 for(const failure of ['fetch','decode']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);const image=e.rgb,depth=e.depth;
  assert.equal(pressBookmarkKey(ui,'ArrowRight').defaultPrevented,true);await flush();
  if(failure==='fetch')ui.respond('/api/sessions/session-a/frames/2/replay',{detail:'synthetic unavailable'},false,404);
  else {ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2',Error('synthetic decode failure'));ui.decode('data:image/jpeg;base64,session-a-depth-2')}
  await flush();assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertShownFrame(ui,1);assert.equal(e.result.hidden,false);
  assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.match(e.status.textContent,/Request failed/);
  await completeFrameKey(ui,'ArrowRight',2);assertShownFrame(ui,2);
 }
});

test('Session changes invalidate an arrow load before old images and IDs can commit',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 pressBookmarkKey(ui,'ArrowRight');await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 for(const key of playbackShortcutKeys)assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key);
 await finishFrames(ui,'session-b');await switched;await ui.decodeFrame('session-a',2);await flush();
 assert.equal(e.result.hidden,true);assert.equal(ui.cloudUpdates.length,1);assert.equal(e['sessions-list'].value,'session-b');
 await completeFrameKey(ui,'ArrowRight',1,{sid:'session-b'});assert.equal(e.rgb.src,'data:image/png;base64,session-b-1');assertProgress(ui,1,3);
});

test('keyboard stepping preserves per-frame unsaved notes, tags and A/B settings without writing them',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1,{note:'synthetic saved note'})]}),e=ui.elements;await showFirst(ui);
 editBookmark(ui,'synthetic unsaved note',['occlusion']);configureLoop(ui,1,2);await completeFrameKey(ui,'ArrowRight',2);await completeFrameKey(ui,'ArrowRight',3);await completeFrameKey(ui,'ArrowLeft',2);await completeFrameKey(ui,'ArrowLeft',1);
 assert.equal(e['bookmark-note'].value,'synthetic unsaved note');assert.equal(e['bookmark-tag-occlusion'].checked,true);
 assert.equal(e['loop-enabled'].checked,true);assert.equal(e['loop-start'].value,'1');assert.equal(e['loop-end'].value,'2');assert.equal(bookmarkWrites(ui).length,0);assertShownFrame(ui,1);
});

const loopShortcutKeys=['a','b','l'];
function pressLoopKey(ui,key,properties={}){
 const event=pressBookmarkKey(ui,key,properties);assert.equal(event.defaultPrevented,true,'an available A/B shortcut is consumed');return event;
}
function assertLoopValues(ui,start,end,enabled){
 const e=ui.elements;assert.equal(e['loop-start'].value,String(start));assert.equal(e['loop-end'].value,String(end));assert.equal(e['loop-enabled'].checked,enabled);
}

test('A/B/L shortcuts mark shown positions and toggle the loop with lowercase or Caps Lock key values',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);const requests=ui.pending.length;
 pressLoopKey(ui,'a');assertLoopValues(ui,2,3,false);
 pressLoopKey(ui,'b');assertLoopValues(ui,2,2,false);
 pressLoopKey(ui,'l');assertLoopValues(ui,2,2,true);assert.equal(e['playback-play'].disabled,true);
 pressLoopKey(ui,'A');pressLoopKey(ui,'B');pressLoopKey(ui,'L');assertLoopValues(ui,2,2,false);
 await flush();assert.equal(ui.pending.length,requests);assert.match(e['playback-status'].textContent,/Paused/);assertProgress(ui,2,3);
});

test('A/B require a shown frame and at least two saved frames while L can toggle before the first replay',async()=>{
 for(const frameIndices of [[],[1]]){
  const ui=await startUI({frameIndices});if(frameIndices.length)await showFirst(ui);
  const requests=ui.pending.length;
  for(const key of [...loopShortcutKeys,...loopShortcutKeys.map(key=>key.toUpperCase())])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key);
  assertLoopValues(ui,1,Math.max(1,frameIndices.length),false);assert.equal(ui.pending.length,requests);
 }
 const ui=await startUI(),e=ui.elements;
 assert.equal(pressBookmarkKey(ui,'a').defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'b').defaultPrevented,false);
 pressLoopKey(ui,'l');assertLoopValues(ui,1,3,true);assert.equal(replayRequests(ui).length,0);assert.equal(e.result.hidden,true);
 pressLoopKey(ui,'L');assertLoopValues(ui,1,3,false);
});

test('loop shortcut markers use displayed saved ordinals rather than source indices, selector targets or scrub previews',async()=>{
 const ui=await startUI({frameIndices:[12,4,9]}),e=ui.elements;await showSaved(ui,4,{total:12});const requests=ui.pending.length,image=e.rgb;
 e['frames-list'].value='9';pressLoopKey(ui,'a');assertLoopValues(ui,2,3,false);
 e['replay-progress'].value='3';e['replay-progress'].oninput();pressLoopKey(ui,'b');assertLoopValues(ui,2,2,false);
 assert.equal(e.rgb,image);assert.equal(e.rgb.src,'data:image/png;base64,session-a-4');assertProgress(ui,2,3);assert.equal(ui.pending.length,requests);
 await showSaved(ui,9,{total:12});pressLoopKey(ui,'b');assertLoopValues(ui,2,3,false);
});

test('each A/B/L key pauses autoplay and cancels a partially decoded automatic frame using the last shown position',async()=>{
 for(const key of loopShortcutKeys){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);
  pressBookmarkKey(ui,' ');await ui.tick(0);ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
  ui.decode('data:image/png;base64,session-a-3');await flush();const image=e.rgb,depth=e.depth,requests=ui.pending.length;
  pressLoopKey(ui,key);ui.decode('data:image/jpeg;base64,session-a-depth-3');await ui.tick(1000);
  assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertShownFrame(ui,2);assert.equal(ui.cloudUpdates.length,1);
  assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.match(e['playback-status'].textContent,/Paused/);
  assertLoopValues(ui,key==='a'?2:1,key==='b'?2:3,key==='l');assert.equal(ui.pending.length,requests);
 }
});

test('A/B/L shortcuts cancel an in-flight progress seek without showing its images or IDs',async()=>{
 for(const key of loopShortcutKeys){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);
  const seeking=scrub(ui,3);await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
  const requests=ui.pending.length,image=e.rgb;pressLoopKey(ui,key);await ui.decodeFrame('session-a',3);await seeking;await ui.tick(1000);
  assert.equal(e.rgb,image);assertShownFrame(ui,2);assert.equal(ui.cloudUpdates.length,1);assert.equal(ui.pending.length,requests);
  assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(e['playback-play'].disabled,false);
  assertLoopValues(ui,key==='a'?2:1,key==='b'?2:3,key==='l');
 }
});

test('A/B/L shortcuts cancel a loading filtered bookmark jump and retain the complete shown frame',async()=>{
 for(const key of loopShortcutKeys){
  const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showSaved(ui,2);
  const jumping=e['bookmark-next'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
  const requests=ui.pending.length,image=e.rgb;pressLoopKey(ui,key);await ui.decodeFrame('session-a',3);await jumping;
  assert.equal(e.rgb,image);assertShownFrame(ui,2);assertBookmarkNav(ui,1,3);assert.equal(ui.cloudUpdates.length,1);assert.equal(ui.pending.length,requests);
  assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assertLoopValues(ui,key==='a'?2:1,key==='b'?2:3,key==='l');
 }
});

test('A/B follow unavailable marker buttons during a cleared manual replay while L can cancel the pending load',async()=>{
 for(const key of loopShortcutKeys){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);
  e['frames-list'].value='3';const loading=e.replay.onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
  const requests=ui.pending.length,image=e.rgb;
  assert.equal(pressBookmarkKey(ui,key).defaultPrevented,key==='l');await ui.decodeFrame('session-a',3);await loading;
  assert.equal(ui.pending.length,requests);assertLoopValues(ui,1,3,key==='l');
  if(key==='l'){assert.equal(e.rgb,image);assert.equal(e.result.hidden,true);assert.equal(ui.cloudUpdates.length,1);assert.equal(e['tracking-overlay'].children.length,0)}
  else{assertShownFrame(ui,3);assert.equal(ui.cloudUpdates.length,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003')}
 }
});

test('invalid keyboard A/B marks retain both endpoints and toggling L never starts playback',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);
 pressLoopKey(ui,'a');pressLoopKey(ui,'b');pressLoopKey(ui,'l');assertLoopValues(ui,2,2,true);
 assert.equal(e['playback-play'].disabled,true);assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,false);assert.match(e['loop-status'].textContent,/A before B/);
 await showSaved(ui,1);pressLoopKey(ui,'b');assertLoopValues(ui,2,1,true);assert.equal(e['playback-play'].disabled,true);
 const requests=ui.pending.length;pressLoopKey(ui,'l');assertLoopValues(ui,2,1,false);assert.equal(e['playback-play'].disabled,false);
 pressLoopKey(ui,'L');assertLoopValues(ui,2,1,true);assert.equal(e['playback-play'].disabled,true);await ui.tick(1000);assert.equal(ui.pending.length,requests);
 await showSaved(ui,3);pressLoopKey(ui,'B');assertLoopValues(ui,2,3,true);assert.equal(e['playback-play'].disabled,false);
 assert.equal(pressBookmarkKey(ui,' ').defaultPrevented,true);await ui.tick(0);await completeReplay(ui,2);assertShownFrame(ui,2);
 await ui.tick(200);await completeReplay(ui,3);assertShownFrame(ui,3);await ui.tick(200);await completeReplay(ui,2);assertShownFrame(ui,2);pressBookmarkKey(ui,' ');
});

test('loop shortcut marks and toggles preserve unsaved tags, notes and bookmark filters without writes',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(3,{tags:['crossing'],note:'synthetic review'})]}),e=ui.elements;
 await showSaved(ui,2);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'synthetic review');editBookmark(ui,'synthetic unsaved draft',['id-switch','occlusion']);
 const requests=ui.pending.length;pressLoopKey(ui,'a');pressLoopKey(ui,'b');pressLoopKey(ui,'l');await flush();
 assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);assert.equal(e['bookmark-note'].value,'synthetic unsaved draft');
 assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-tag-crossing'].checked,false);
 assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'synthetic review');assertBookmarkNav(ui,null,3);
 await showSaved(ui,3);pressLoopKey(ui,'b');await showSaved(ui,2);assertLoopValues(ui,2,3,true);
 assert.equal(e['bookmark-note'].value,'synthetic unsaved draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(bookmarkWrites(ui).length,0);
});

test('A/B/L typing guards cover native controls, contenteditable descendants, accessible editors and shadow paths',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);const requests=ui.pending.length;
 const guards=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['loop-start'],e['loop-end'],e['loop-enabled'],e['replay-progress'],e['playback-speed'],e['bookmark-shortcuts-enabled'],new Element('textarea'),new Element('select')];
 for(const value of ['', 'true', 'plaintext-only']){const node=new Element('div');node.setAttribute('contenteditable',value);guards.push(node)}
 for(const role of ['textbox','searchbox','combobox','spinbutton','slider','listbox','radiogroup','menu','tablist','tree','grid']){const node=new Element('div');node.setAttribute('role',role);guards.push(node)}
 const nativeEditable=new Element('div');nativeEditable.isContentEditable=true;guards.push(nativeEditable);
 for(const target of guards)for(const key of loopShortcutKeys){
  const child=new Element('span');target.append(child);
  assert.equal(pressBookmarkKey(ui,key,{target}).defaultPrevented,false,key+' target');
  assert.equal(pressBookmarkKey(ui,key,{target:child}).defaultPrevented,false,key+' descendant');
  assert.equal(pressBookmarkKey(ui,key,{composedPath:()=>[new Element('span'),child,target]}).defaultPrevented,false,key+' shadow path');
  ui.document.activeElement=child;assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key+' active focus');ui.document.activeElement=null;
 }
 await flush();assert.equal(ui.pending.length,requests);assertLoopValues(ui,1,3,false);assertProgress(ui,2,3);assert.equal(bookmarkWrites(ui).length,0);
 const readonly=new Element('div');readonly.setAttribute('contenteditable','false');pressLoopKey(ui,'a',{target:readonly});assertLoopValues(ui,2,3,false);
});

test('A/B/L ignore modified, repeated, composing, previously consumed and unrelated keyboard events',async()=>{
 const ui=await startUI();await showSaved(ui,2);const requests=ui.pending.length;
 for(const key of loopShortcutKeys){
  for(const properties of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,properties).defaultPrevented,false,key+' '+JSON.stringify(properties));
  if(key==='l')for(const letter of ['l','L'])assert.equal(pressBookmarkKey(ui,letter,{shiftKey:true}).defaultPrevented,false,'Shift+L is not a loop toggle');
  assert.equal(pressBookmarkKey(ui,key,{defaultPrevented:true}).defaultPrevented,true);
 }
 for(const key of ['AKey','KeyA','KeyB','KeyL','ab','ａ','ｂ','ｌ','Enter','Escape','Process','Dead',''])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key);
 ui.dispatch('compositionstart');for(const key of loopShortcutKeys)assert.equal(pressBookmarkKey(ui,key,{isComposing:false}).defaultPrevented,false);ui.dispatch('compositionend');
 assertLoopValues(ui,1,3,false);assert.equal(ui.pending.length,requests);pressLoopKey(ui,'a');assertLoopValues(ui,2,3,false);
});

test('hidden-page and blurred composition state do not leave A/B/L stuck or trigger stale loop actions',async()=>{
 const ui=await startUI();await showSaved(ui,2);const requests=ui.pending.length;
 ui.dispatch('compositionstart');ui.hide();for(const key of loopShortcutKeys)assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);
 assertLoopValues(ui,1,3,false);ui.document.hidden=false;pressLoopKey(ui,'a');assertLoopValues(ui,2,3,false);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'b').defaultPrevented,false);ui.windowEvents.blur();pressLoopKey(ui,'b');assertLoopValues(ui,2,2,false);
 await flush();assert.equal(ui.pending.length,requests);assertProgress(ui,2,3);
});

test('the shared shortcut switch removes A/B/L metadata, disables keys and preserves manual loop controls',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);
 const metadata=[['loop-set-start','a'],['loop-set-end','b'],['loop-enabled','l']];
 for(const [id,key] of metadata)assert.equal(e[id].getAttribute('aria-keyshortcuts'),key);
 assert.ok(e['loop-shortcut-help'],'the A/B controls have their own shortcut hint');
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();
 for(const [id] of metadata)assert.equal(e[id].getAttribute('aria-keyshortcuts')||'','');
 for(const key of [...loopShortcutKeys,...loopShortcutKeys.map(key=>key.toUpperCase())])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key);
 assertLoopValues(ui,1,3,false);e['loop-set-start'].onclick();assertLoopValues(ui,2,3,false);
 e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();for(const [id,key] of metadata)assert.equal(e[id].getAttribute('aria-keyshortcuts'),key);
 pressLoopKey(ui,'b');assertLoopValues(ui,2,2,false);const fresh=await startUI();assert.equal(fresh.elements['bookmark-shortcuts-enabled'].checked,true);
});

test('A/B/L follow loop control availability during a pending annotation save without adding writes or replays',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);editBookmark(ui,'synthetic pending draft',['occlusion']);
 const saving=e['bookmark-save'].onclick();await flush();const requests=ui.pending.length;
 for(const key of loopShortcutKeys)pressLoopKey(ui,key);assertLoopValues(ui,2,2,true);assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,1);
 ui.respond('/api/sessions/session-a/frames/2/bookmark',bookmarkResponse('session-a',[bookmarkRecord(2,{note:'synthetic pending draft',tags:['occlusion']})]));await saving;
 assertLoopValues(ui,2,2,true);assert.equal(e['bookmark-note'].value,'synthetic pending draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assertProgress(ui,2,3);
});

function pressMarkKey(ui,key='m',properties={}){
 const event=pressBookmarkKey(ui,key,properties);assert.equal(event.defaultPrevented,true,'an available mark shortcut is consumed');
 assert.equal(ui.document.activeElement,ui.elements['bookmark-note']);assert.equal(ui.elements['bookmark-note'].disabled,false);return event;
}

test('M focuses the shown frame note with lowercase or Caps Lock values without saving or loading another frame',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);const requests=ui.pending.length,image=e.rgb,depth=e.depth;
 assert.equal(e['bookmark-mark'].getAttribute('aria-keyshortcuts'),'m');assert.equal(e['bookmark-shortcuts-enabled'].checked,true);
 pressMarkKey(ui);assert.match(e['playback-status'].textContent,/Paused/);assertShownFrame(ui,2);
 ui.document.activeElement=null;pressMarkKey(ui,'M');await flush();
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');
 assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);assert.equal(e['bookmark-save'].disabled,false);
});

test('M follows mark availability before display, during bookmark loading and after corrupt or failed bookmark responses',async()=>{
 for(const response of [null,{detail:'Unavailable'},{format:'depthport.session-bookmarks.v1',session_id:'session-a',bookmarks:[bookmarkRecord(1,{snapshot_sha256:otherHash})]}]){
  const ui=await startUI({delayBookmarks:true}),e=ui.elements;
  assert.equal(pressBookmarkKey(ui,'m').defaultPrevented,false);await showFirst(ui);
  assert.equal(e['bookmark-mark'].disabled,true);assert.equal(pressBookmarkKey(ui,'M').defaultPrevented,false);
  if(response){ui.respond('/api/sessions/session-a/bookmarks',response,!response.detail,response.detail?500:200);await flush();assert.equal(e['bookmark-mark'].disabled,true);assert.equal(pressBookmarkKey(ui,'m').defaultPrevented,false)}
  assert.equal(ui.document.activeElement,null);assert.equal(bookmarkWrites(ui).length,0);assert.equal(replayRequests(ui).length,1);assertProgress(ui,1,3);
 }
 const ready=await startUI();assert.equal(pressBookmarkKey(ready,'m').defaultPrevented,false);assert.equal(replayRequests(ready).length,0);
});

test('M marks a single saved frame but rejects an empty Session and a displayed snapshot absent from its saved manifest',async()=>{
 const empty=await startUI({frameIndices:[]});assert.equal(pressBookmarkKey(empty,'m').defaultPrevented,false);assert.equal(empty.document.activeElement,null);
 const single=await startUI({frameIndices:[1]}),e=single.elements;await showSaved(single,1,{total:1});const requests=single.pending.length;
 pressMarkKey(single);assertProgress(single,1,1);assert.equal(e['bookmark-save'].disabled,false);assert.equal(single.pending.length,requests);
 const stale=await startUI(),s=stale.elements;const loading=s.replay.onclick();await flush();
 stale.respond('/api/sessions/session-a/frames/1/replay',{...replayResponse('session-a',1),snapshot_sha256:otherHash});await flush();await stale.decodeFrame('session-a',1);await loading;
 assert.equal(s.result.hidden,false);assert.equal(s['bookmark-mark'].disabled,true);assert.equal(pressBookmarkKey(stale,'m').defaultPrevented,false);assert.equal(stale.document.activeElement,null);
});

test('M marks the displayed snapshot rather than a selector target or scrub preview and only explicit Save writes it',async()=>{
 const ui=await startUI({frameIndices:[12,4,9]}),e=ui.elements;await showSaved(ui,4,{total:12});const requests=ui.pending.length,image=e.rgb;
 e['frames-list'].value='9';e['replay-progress'].value='3';e['replay-progress'].oninput();pressMarkKey(ui);
 assert.equal(e.rgb,image);assertProgress(ui,2,3);assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);
 editBookmark(ui,'synthetic mark review',['occlusion']);assert.equal(bookmarkWrites(ui).length,0);
 const saving=e['bookmark-save'].onclick();await flush();const write=bookmarkWrites(ui).at(-1);
 assert.equal(write.url,'/api/sessions/session-a/frames/4/bookmark');assert.deepEqual(JSON.parse(write.opt.body),{snapshot_sha256:hash,note:'synthetic mark review',tags:['occlusion']});
 ui.respond(write.url,bookmarkResponse('session-a',[bookmarkRecord(4,{note:'synthetic mark review',tags:['occlusion']})]));await saving;
});

test('M pauses autoplay and cancels partially decoded automatic frames while retaining the shown images and Object IDs',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();ui.decode('data:image/png;base64,session-a-3');await flush();
 const requests=ui.pending.length,image=e.rgb,depth=e.depth;pressMarkKey(ui);editBookmark(ui,'synthetic paused review',['id-switch']);
 ui.decode('data:image/jpeg;base64,session-a-depth-3');await ui.tick(1000);
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertShownFrame(ui,2);assert.equal(ui.cloudUpdates.length,1);assert.equal(ui.pending.length,requests);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.match(e['playback-status'].textContent,/Paused/);
 assert.equal(e['bookmark-note'].value,'synthetic paused review');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(bookmarkWrites(ui).length,0);
});

test('M cancels a loading progress seek and focuses the note for the still displayed frame',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);
 const seeking=scrub(ui,3);await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 const requests=ui.pending.length,image=e.rgb;pressMarkKey(ui);await ui.decodeFrame('session-a',3);await seeking;
 assert.equal(e.rgb,image);assertShownFrame(ui,2);assert.equal(ui.pending.length,requests);assert.equal(ui.cloudUpdates.length,1);
 assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(e['bookmark-note'].disabled,false);assert.equal(bookmarkWrites(ui).length,0);
});

test('M cancels a loading filtered bookmark jump without accepting its late image or changing bookmark filters',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1,{tags:['crossing']}),bookmarkRecord(3,{tags:['crossing']})]}),e=ui.elements;await showSaved(ui,2);filterBookmarkTag(ui,'crossing');
 const jumping=e['bookmark-next'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 const requests=ui.pending.length,image=e.rgb;pressMarkKey(ui);await ui.decodeFrame('session-a',3);await jumping;
 assert.equal(e.rgb,image);assertShownFrame(ui,2);assertBookmarkNav(ui,1,3);assert.equal(ui.cloudUpdates.length,1);assert.equal(ui.pending.length,requests);
 assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(bookmarkWrites(ui).length,0);
});

test('M leaves a cleared manual replay and an annotation write undisturbed while the mark button is unavailable',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);
 e['frames-list'].value='3';const loading=e.replay.onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 assert.equal(e['bookmark-mark'].disabled,true);assert.equal(pressBookmarkKey(ui,'m').defaultPrevented,false);assert.equal(ui.document.activeElement,null);
 await ui.decodeFrame('session-a',3);await loading;assertShownFrame(ui,3);editBookmark(ui,'synthetic pending write',['crossing']);
 const saving=e['bookmark-save'].onclick();await flush();const requests=ui.pending.length;
 assert.equal(e['bookmark-mark'].disabled,true);assert.equal(pressBookmarkKey(ui,'M').defaultPrevented,false);assert.equal(ui.document.activeElement,null);assert.equal(ui.pending.length,requests);
 ui.respond('/api/sessions/session-a/frames/3/bookmark',bookmarkResponse('session-a',[bookmarkRecord(3,{note:'synthetic pending write',tags:['crossing']})]));await saving;
 pressMarkKey(ui);assertShownFrame(ui,3);assert.equal(bookmarkWrites(ui).length,1);
});

test('M preserves unsaved note and tag drafts, A/B settings and a filter that excludes the current frame',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(3,{tags:['crossing'],note:'synthetic saved match'})]}),e=ui.elements;await showSaved(ui,2);
 filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'saved match');configureLoop(ui,1,3);editBookmark(ui,'synthetic unsaved mark draft',['id-switch','occlusion']);const requests=ui.pending.length;
 pressMarkKey(ui);assert.equal(e['bookmark-note'].value,'synthetic unsaved mark draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-tag-crossing'].checked,false);
 assertLoopValues(ui,1,3,true);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'saved match');assertBookmarkNav(ui,null,3);assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);
 await showSaved(ui,3);await showSaved(ui,2);assert.equal(e['bookmark-note'].value,'synthetic unsaved mark draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-tag-occlusion'].checked,true);assertLoopValues(ui,1,3,true);
});

test('M typing guards protect native controls, editable descendants, accessible editors and composed event paths',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);const requests=ui.pending.length;
 const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress'],e['playback-speed'],e['bookmark-shortcuts-enabled'],new Element('textarea'),new Element('input'),new Element('select')];
 for(const value of ['', 'true', 'plaintext-only']){const node=new Element('div');node.setAttribute('contenteditable',value);editors.push(node)}
 for(const role of ['textbox','searchbox','combobox','spinbutton','slider','listbox','radiogroup','menu','tablist','tree','grid']){const node=new Element('div');node.setAttribute('role',role);editors.push(node)}
 const nativeEditable=new Element('div');nativeEditable.isContentEditable=true;editors.push(nativeEditable);
 for(const target of editors){
  const child=new Element('span');target.append(child);
  for(const key of ['m','M']){
   assert.equal(pressBookmarkKey(ui,key,{target}).defaultPrevented,false,key+' target');assert.equal(pressBookmarkKey(ui,key,{target:child}).defaultPrevented,false,key+' descendant');
   assert.equal(pressBookmarkKey(ui,key,{composedPath:()=>[new Element('span'),child,target]}).defaultPrevented,false,key+' shadow path');
   ui.document.activeElement=child;assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key+' active focus');ui.document.activeElement=null;
  }
 }
 assert.equal(ui.pending.length,requests);assert.equal(ui.document.activeElement,null);pressMarkKey(ui);
 for(const key of ['m','M'])assert.equal(pressBookmarkKey(ui,key,{target:new Element('div')}).defaultPrevented,false,'typing after first M retains note focus');
 e['bookmark-search'].focus();assert.equal(pressBookmarkKey(ui,'M',{target:new Element('button')}).defaultPrevented,false);assert.equal(ui.document.activeElement,e['bookmark-search']);assert.equal(bookmarkWrites(ui).length,0);
});

test('M ignores modifiers, held keys, IME, consumed keys and hidden pages without leaving composition stuck',async()=>{
 const ui=await startUI();await showSaved(ui,2);const requests=ui.pending.length;
 for(const key of ['m','M']){
  for(const properties of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,properties).defaultPrevented,false,key+' '+JSON.stringify(properties));
  assert.equal(pressBookmarkKey(ui,key,{defaultPrevented:true}).defaultPrevented,true);
 }
 for(const key of ['KeyM','ｍ','mm','Enter','Escape','Process','Dead',''])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false,key);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'m',{isComposing:false}).defaultPrevented,false);ui.dispatch('compositionend');
 assert.equal(ui.document.activeElement,null);ui.dispatch('compositionstart');ui.hide();assert.equal(pressBookmarkKey(ui,'M').defaultPrevented,false);ui.document.hidden=false;pressMarkKey(ui);
 ui.document.activeElement=null;ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'m').defaultPrevented,false);ui.windowEvents.blur();pressMarkKey(ui,'M');
 await flush();assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);assertProgress(ui,2,3);
});

test('the shared shortcut switch removes M metadata and keeps the manual mark button available',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);const requests=ui.pending.length;
 assert.equal(e['bookmark-mark'].getAttribute('aria-keyshortcuts'),'m');e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();
 assert.equal(e['bookmark-mark'].getAttribute('aria-keyshortcuts')||'','');for(const key of ['m','M'])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);
 assert.equal(ui.document.activeElement,null);e['bookmark-mark'].onclick();assert.equal(ui.document.activeElement,e['bookmark-note']);
 ui.document.activeElement=null;e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-mark'].getAttribute('aria-keyshortcuts'),'m');pressMarkKey(ui);
 assert.equal(ui.pending.length,requests);const fresh=await startUI();assert.equal(fresh.elements['bookmark-shortcuts-enabled'].checked,true);assert.equal(fresh.elements['bookmark-mark'].getAttribute('aria-keyshortcuts'),'m');
});

test('M cannot mark the prior Session during transition and requires a displayed snapshot in the newly selected Session',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 assert.equal(e['bookmark-mark'].disabled,true);assert.equal(pressBookmarkKey(ui,'m').defaultPrevented,false);assert.equal(ui.document.activeElement,null);
 await finishFrames(ui,'session-b');await switched;assert.equal(pressBookmarkKey(ui,'M').defaultPrevented,false);assert.equal(e.result.hidden,true);
 await showSaved(ui,1,{sid:'session-b'});const requests=ui.pending.length;pressMarkKey(ui);
 assert.equal(e.rgb.src,'data:image/png;base64,session-b-1');assert.equal(e['bookmark-note'].value,'');assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);
});

function pressNoteSaveKey(ui,properties={}){
 const note=ui.elements['bookmark-note'];
 const event={key:'Enter',ctrlKey:true,target:note,defaultPrevented:false,...properties,preventDefault(){this.defaultPrevented=true}};
 event.completion=note.onkeydown?.(event);return event;
}
async function finishNoteSave(ui,index,note,tags=[],{sid='session-a',bookmarks}={}){
 const write=bookmarkWrites(ui).at(-1);assert.ok(write,'an admitted shortcut issues a bookmark request');
 assert.equal(write.url,'/api/sessions/'+sid+'/frames/'+index+'/bookmark');assert.equal(write.opt.method,'PUT');
 assert.deepEqual(JSON.parse(write.opt.body),{snapshot_sha256:hash,note,tags});
 ui.respond(write.url,bookmarkResponse(sid,bookmarks||[bookmarkRecord(index,{note,tags})]));await flush();return write;
}

test('M then Ctrl+Enter saves the focused shown-frame note and tags once without changing its images or Object IDs',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);
 e['playback-play'].onclick();await ui.tick(0);ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
 pressMarkKey(ui);const image=e.rgb,depth=e.depth;editBookmark(ui,'synthetic keyboard review\n遮擋與交會',['id-switch','occlusion']);
 assert.equal(typeof e['bookmark-note'].onkeydown,'function');const saving=pressNoteSaveKey(ui);assert.equal(saving.defaultPrevented,true);await flush();
 assert.equal(bookmarkWrites(ui).length,1);assert.equal(e['bookmark-save'].disabled,true);assert.equal(e['bookmark-note'].disabled,true);
 assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);assert.equal(pressNoteSaveKey(ui,{repeat:true}).defaultPrevented,false);await flush();assert.equal(bookmarkWrites(ui).length,1);
 await finishNoteSave(ui,2,'synthetic keyboard review\n遮擋與交會',['id-switch','occlusion']);await saving.completion;await ui.decodeFrame('session-a',3);await ui.tick(1000);
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');
 assert.match(e['playback-status'].textContent,/Paused/);assertLoopValues(ui,1,3,true);assert.equal(e['bookmark-note'].disabled,false);assert.equal(e['bookmark-save'].disabled,false);
 assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/);assert.ok(e['bookmarks-list'].textContent.includes('synthetic keyboard review'));assert.equal(bookmarkWrites(ui).length,1);
});

test('Ctrl+Enter requires both the exact note target and active note focus and never saves from search, controls or the page',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);editBookmark(ui,'synthetic focus guard');const requests=ui.pending.length;
 const others=[null,e['bookmark-search'],e['bookmark-filter-tag'],e['bookmark-tag-crossing'],e['bookmark-save'],e['bookmark-mark'],e['replay-progress'],new Element('textarea'),new Element('div')];
 for(const active of others){ui.document.activeElement=active;assert.equal(pressNoteSaveKey(ui).defaultPrevented,false,'a note target without note focus is insufficient')}
 e['bookmark-note'].focus();
 for(const target of others){assert.equal(pressNoteSaveKey(ui,{target}).defaultPrevented,false,'a focused note without the exact event target is insufficient');assert.equal(pressBookmarkKey(ui,'Enter',{ctrlKey:true,target}).defaultPrevented,false)}
 const child=new Element('span');e['bookmark-note'].append(child);assert.equal(pressNoteSaveKey(ui,{target:child,composedPath:()=>[child,e['bookmark-note']]}).defaultPrevented,false);
 assert.equal(pressBookmarkKey(ui,'Enter',{ctrlKey:true,target:e['bookmark-note']}).defaultPrevented,false,'the global replay handler does not capture note saves');
 await flush();assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);assert.equal(e['bookmark-note'].value,'synthetic focus guard');
});

test('plain Enter keeps its native newline behavior and other keys and modified Enter combinations do not save',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e['bookmark-note'].focus();editBookmark(ui,'synthetic first line');const requests=ui.pending.length;
 for(const properties of [{ctrlKey:false},{ctrlKey:false,shiftKey:true},{ctrlKey:false,metaKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true}])assert.equal(pressNoteSaveKey(ui,properties).defaultPrevented,false,JSON.stringify(properties));
 for(const key of ['NumpadEnter','Return','enter',' ','m','M','[',']','ArrowRight','Escape','Process','Dead',''])assert.equal(pressNoteSaveKey(ui,{key}).defaultPrevented,false,key);
 const consumed=pressNoteSaveKey(ui,{defaultPrevented:true});assert.equal(consumed.defaultPrevented,true);assert.equal(consumed.completion,undefined);
 editBookmark(ui,'synthetic first line\nsecond line');await flush();assert.equal(e['bookmark-note'].value,'synthetic first line\nsecond line');assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);
});

test('Ctrl+Enter cannot submit during IME composition through event flags, key code or the document composition state',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e['bookmark-note'].focus();editBookmark(ui,'合成測試');const requests=ui.pending.length;
 for(const properties of [{isComposing:true},{keyCode:229},{isComposing:true,keyCode:229}])assert.equal(pressNoteSaveKey(ui,properties).defaultPrevented,false);
 ui.dispatch('compositionstart',{target:e['bookmark-note']});assert.equal(pressNoteSaveKey(ui,{isComposing:false,keyCode:13}).defaultPrevented,false);
 ui.dispatch('compositionend',{target:e['bookmark-note']});await flush();assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);
 const saving=pressNoteSaveKey(ui);assert.equal(saving.defaultPrevented,true);await flush();await finishNoteSave(ui,2,'合成測試');await saving.completion;
 assert.equal(e['bookmark-note'].value,'合成測試');assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/);
});

test('hidden pages reject Ctrl+Enter and composition state resets on visibility and window blur',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e['bookmark-note'].focus();editBookmark(ui,'synthetic visibility review');
 ui.dispatch('compositionstart');ui.hide();assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);assert.equal(bookmarkWrites(ui).length,0);
 ui.document.hidden=false;let saving=pressNoteSaveKey(ui);assert.equal(saving.defaultPrevented,true);await flush();await finishNoteSave(ui,2,'synthetic visibility review');await saving.completion;
 ui.dispatch('compositionstart');assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);ui.windowEvents.blur();
 saving=pressNoteSaveKey(ui);assert.equal(saving.defaultPrevented,true);await flush();await finishNoteSave(ui,2,'synthetic visibility review');await saving.completion;assert.equal(bookmarkWrites(ui).length,2);
});

test('the shared shortcut switch clears Control+Enter metadata and disables only the shortcut while explicit Save remains available',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e['bookmark-note'].focus();editBookmark(ui,'synthetic opted-out review');
 assert.ok(e['bookmark-save-shortcut-help'],'the note editor has a dedicated save shortcut hint');
 assert.equal(e['bookmark-note'].getAttribute('aria-keyshortcuts'),'Control+Enter Escape');assert.equal(e['bookmark-save'].getAttribute('aria-keyshortcuts'),'Control+Enter');
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();
 for(const id of ['bookmark-note','bookmark-save'])assert.equal(e[id].getAttribute('aria-keyshortcuts')||'','');
 assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);assert.equal(bookmarkWrites(ui).length,0);assert.equal(e['bookmark-save'].disabled,false);
 const saving=e['bookmark-save'].onclick();await flush();await finishNoteSave(ui,2,'synthetic opted-out review');await saving;
 e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-note'].getAttribute('aria-keyshortcuts'),'Control+Enter Escape');assert.equal(e['bookmark-save'].getAttribute('aria-keyshortcuts'),'Control+Enter');
 const fresh=await startUI();assert.equal(fresh.elements['bookmark-shortcuts-enabled'].checked,true);assert.equal(fresh.elements['bookmark-note'].getAttribute('aria-keyshortcuts'),'Control+Enter Escape');
});

test('Ctrl+Enter follows note and Save availability before display, during bookmark loading and after a rejected list',async()=>{
 for(const response of [null,{detail:'Unavailable'},bookmarkResponse('session-a',[bookmarkRecord(1,{snapshot_sha256:otherHash})])]){
  const ui=await startUI({delayBookmarks:true}),e=ui.elements;ui.document.activeElement=e['bookmark-note'];assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);
  await showSaved(ui,2);assert.equal(e['bookmark-note'].disabled,true);assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);
  if(response){ui.respond('/api/sessions/session-a/bookmarks',response,!response.detail,response.detail?500:200);await flush();assert.equal(pressNoteSaveKey(ui).defaultPrevented,false)}
  assert.equal(bookmarkWrites(ui).length,0);assertProgress(ui,2,3);
 }
 const ready=await startUI();ready.document.activeElement=ready.elements['bookmark-note'];assert.equal(pressNoteSaveKey(ready).defaultPrevented,false);assert.equal(bookmarkWrites(ready).length,0);
});

test('Ctrl+Enter rejects invalid Unicode, control characters and overlong notes but saves permitted Unicode and empty general bookmarks',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e['bookmark-note'].focus();
 for(const note of ['x'.repeat(1001),'hidden\u0000control','hidden\u0085control','unpaired\ud800','unpaired\udfff']){
  editBookmark(ui,note);assert.equal(e['bookmark-save'].disabled,true);assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);assert.equal(bookmarkWrites(ui).length,0);
 }
 for(const note of ['😀'.repeat(997)+'\n\t終','']){
  editBookmark(ui,note);assert.equal(e['bookmark-save'].disabled,false);const saving=pressNoteSaveKey(ui);assert.equal(saving.defaultPrevented,true);await flush();await finishNoteSave(ui,2,note);await saving.completion;
  assert.equal(e['bookmark-note'].value,note);assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/);
 }
 assert.equal(bookmarkWrites(ui).length,2);
});

test('Ctrl+Enter saves the committed snapshot rather than a selected target and does not submit an active progress preview',async()=>{
 const ui=await startUI({frameIndices:[12,4,9]}),e=ui.elements;await showSaved(ui,4,{total:12});e['bookmark-note'].focus();editBookmark(ui,'synthetic exact snapshot',['crossing']);
 e['frames-list'].value='9';const saving=pressNoteSaveKey(ui);assert.equal(saving.defaultPrevented,true);await flush();await finishNoteSave(ui,4,'synthetic exact snapshot',['crossing']);await saving.completion;
 assert.equal(e.rgb.src,'data:image/png;base64,session-a-4');assertProgress(ui,2,3);assert.equal(bookmarkWrites(ui).length,1);
 e['replay-progress'].value='3';e['replay-progress'].oninput();assert.equal(e['bookmark-note'].disabled,true);assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);assert.equal(bookmarkWrites(ui).length,1);
});

test('Ctrl+Enter does not interrupt pending progress seeks, bookmark jumps or cleared manual replays when the note is unavailable',async()=>{
 for(const kind of ['seek','jump','manual']){
  const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(3)]}),e=ui.elements;await showSaved(ui,2);e['bookmark-note'].focus();editBookmark(ui,'synthetic retained draft');
  let loading;if(kind==='seek')loading=scrub(ui,3);else if(kind==='jump')loading=e['bookmark-next'].onclick();else{e['frames-list'].value='3';loading=e.replay.onclick()}
  await flush();assert.equal(e['bookmark-note'].disabled,true);assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);assert.equal(bookmarkWrites(ui).length,0);
  await completeReplay(ui,3);await loading;assertShownFrame(ui,3);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');
  await showSaved(ui,2);assert.equal(e['bookmark-note'].value,'synthetic retained draft');assert.equal(bookmarkWrites(ui).length,0);
 }
});

test('Ctrl+Enter failure keeps the draft and prior saved note and permits a later explicit keyboard retry',async()=>{
 const original=bookmarkRecord(2,{note:'synthetic original note',tags:['crossing']}),ui=await startUI({bookmarks:[original]}),e=ui.elements;await showSaved(ui,2);e['bookmark-note'].focus();editBookmark(ui,'synthetic retry draft',['occlusion']);
 let saving=pressNoteSaveKey(ui);assert.equal(saving.defaultPrevented,true);await flush();ui.respond('/api/sessions/session-a/frames/2/bookmark',{detail:'Storage unavailable'},false,500);await saving.completion;
 assert.equal(e['bookmark-note'].value,'synthetic retry draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.ok(e['bookmarks-list'].textContent.includes('synthetic original note'));assert.equal(e['bookmark-save'].disabled,false);assert.match(e['bookmarks-status'].textContent,/error|fail|Storage/i);
 saving=pressNoteSaveKey(ui);assert.equal(saving.defaultPrevented,true);await flush();await finishNoteSave(ui,2,'synthetic retry draft',['occlusion']);await saving.completion;
 assert.equal(bookmarkWrites(ui).length,2);assert.ok(e['bookmarks-list'].textContent.includes('synthetic retry draft'));assert.equal(e['bookmarks-list'].textContent.includes('synthetic original note'),false);
});

test('a Ctrl+Enter save finishing in an old Session cannot replace the new Session list or draft',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e['bookmark-note'].focus();editBookmark(ui,'synthetic old Session save',['occlusion']);
 const saving=pressNoteSaveKey(ui);assert.equal(saving.defaultPrevented,true);await flush();e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();
 assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(1,{note:'synthetic B saved'})]);await switched;
 assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);await showSaved(ui,1,{sid:'session-b'});e['bookmark-note'].focus();editBookmark(ui,'synthetic B draft',['crossing']);
 ui.respond('/api/sessions/session-a/frames/2/bookmark',bookmarkResponse('session-a',[bookmarkRecord(2,{note:'synthetic old Session save',tags:['occlusion']})]));await saving.completion;
 assert.equal(e['bookmark-note'].value,'synthetic B draft');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.ok(e['bookmarks-list'].textContent.includes('synthetic B saved'));assert.equal(e['bookmarks-list'].textContent.includes('synthetic old Session save'),false);
 const next=pressNoteSaveKey(ui);assert.equal(next.defaultPrevented,true);await flush();await finishNoteSave(ui,1,'synthetic B draft',['crossing'],{sid:'session-b'});await next.completion;assert.equal(bookmarkWrites(ui).length,2);
});

test('Ctrl+Enter refreshes filtered matches and bookmark neighbors without clearing the query, category or A/B loop',async()=>{
 const one=bookmarkRecord(1,{note:'synthetic review first',tags:['crossing']}),three=bookmarkRecord(3,{note:'synthetic review last',tags:['crossing']});
 const ui=await startUI({bookmarks:[one,three]}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'review');assertBookmarkNav(ui,1,3);
 e['bookmark-note'].focus();editBookmark(ui,'synthetic review middle',['crossing']);const saving=pressNoteSaveKey(ui);assert.equal(saving.defaultPrevented,true);await flush();
 await finishNoteSave(ui,2,'synthetic review middle',['crossing'],{bookmarks:[one,bookmarkRecord(2,{note:'synthetic review middle',tags:['crossing']}),three]});await saving.completion;
 assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'review');assertBookmarkNav(ui,1,3);assertBookmarkNavPosition(ui,2,3);assert.equal(bookmarkJumpButtons(ui).length,3);assertLoopValues(ui,1,3,true);
});

function pressNoteEscape(ui,properties={}){
 const note=ui.elements['bookmark-note'];
 const event={key:'Escape',target:note,defaultPrevented:false,...properties,preventDefault(){this.defaultPrevented=true}};
 event.completion=note.onkeydown?.(event);return event;
}
function assertNoteReturnedToReplay(ui){
 const result=ui.elements.result;assert.equal(ui.document.activeElement,result);
 assert.equal(result.focusCalls.at(-1).preventScroll,true);assert.equal(result.scrollCalls.at(-1).block,'start');assert.equal(result.scrollCalls.at(-1).behavior,'auto');
 assert.match(ui.elements['playback-status'].textContent,/Paused/);
}

test('Esc returns M note focus to the shown replay without saving, discarding drafts or changing images, filters and A/B settings',async()=>{
 const saved=bookmarkRecord(3,{tags:['crossing'],note:'synthetic saved match'}),ui=await startUI({trackingReport:trackedSequence(),bookmarks:[saved]}),e=ui.elements;
 await showSaved(ui,2);configureLoop(ui,1,3);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'saved match');pressMarkKey(ui);
 editBookmark(ui,'synthetic unsaved escape draft\n遮擋與交會',['id-switch','occlusion']);const requests=ui.pending.length,image=e.rgb,depth=e.depth;
 assert.equal(pressNoteEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);await ui.tick(1000);
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');
 assert.equal(e['bookmark-note'].value,'synthetic unsaved escape draft\n遮擋與交會');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-tag-crossing'].checked,false);
 assert.match(e['bookmark-editor-status'].textContent,/Unsaved changes/);assertLoopValues(ui,1,3,true);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'saved match');assertBookmarkNav(ui,null,3);
 assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);assert.equal(e['bookmarks-list'].textContent.includes('synthetic unsaved escape draft'),false);
});

test('Esc retains an invalid draft even when Ctrl+Enter and the Save button are unavailable',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);
 for(const note of ['x'.repeat(1001),'synthetic\u0000control','synthetic\u0085control','synthetic\ud800']){
  e['bookmark-note'].focus();editBookmark(ui,note,['occlusion']);assert.equal(e['bookmark-save'].disabled,true);assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);
  const requests=ui.pending.length;assert.equal(pressNoteEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);
  assert.equal(e['bookmark-note'].value,note);assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-note'].getAttribute('aria-invalid'),'true');
  assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);
 }
 await completeFrameKey(ui,'ArrowRight',3,{event:{target:e.result}});await completeFrameKey(ui,'ArrowLeft',2,{event:{target:e.result}});pressMarkKey(ui);
 assert.equal(e['bookmark-note'].value,'synthetic\ud800');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-save'].disabled,true);
});

test('after Esc, Space and frame keys work from replay and M restores the exact per-frame note and tags',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);pressMarkKey(ui);editBookmark(ui,'synthetic return-to-replay draft',['crossing']);
 assert.equal(pressNoteEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);
 assert.equal(pressBookmarkKey(ui,' ',{target:e.result}).defaultPrevented,true);assert.equal(pressBookmarkKey(ui,' ',{target:e.result}).defaultPrevented,true);await ui.tick(1000);assertShownFrame(ui,2);
 await completeFrameKey(ui,'ArrowRight',3,{event:{target:e.result}});assert.equal(e['bookmark-note'].value,'');assert.equal(e['bookmark-tag-crossing'].checked,false);
 await completeFrameKey(ui,'ArrowLeft',2,{event:{target:e.result}});pressMarkKey(ui);
 assert.equal(e['bookmark-note'].value,'synthetic return-to-replay draft');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.equal(bookmarkWrites(ui).length,0);
});

test('after Esc, filtered bookmark keys navigate and the draft remains attached to its original snapshot',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1,{tags:['crossing']}),bookmarkRecord(3,{tags:['crossing']})]}),e=ui.elements;
 await showSaved(ui,2);filterBookmarkTag(ui,'crossing');pressMarkKey(ui);editBookmark(ui,'synthetic filtered escape draft',['id-switch']);assert.equal(pressNoteEscape(ui).defaultPrevented,true);
 assert.equal(pressBookmarkKey(ui,']',{target:e.result}).defaultPrevented,true);await flush();await completeReplay(ui,3);await flush();assertShownFrame(ui,3);
 assert.equal(pressBookmarkKey(ui,'[',{target:e.result}).defaultPrevented,true);await flush();await completeReplay(ui,1);await flush();assertShownFrame(ui,1);
 await completeFrameKey(ui,'ArrowRight',2,{event:{target:e.result}});pressMarkKey(ui);assert.equal(e['bookmark-note'].value,'synthetic filtered escape draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);
 assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(bookmarkWrites(ui).length,0);
});

test('Esc requires both the exact note event target and active note focus and ignores search, tags, buttons and page keys',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);editBookmark(ui,'synthetic exact focus draft');const requests=ui.pending.length;
 const others=[null,e['bookmark-search'],e['bookmark-filter-tag'],e['bookmark-tag-crossing'],e['bookmark-save'],e['bookmark-mark'],e['replay-progress'],e.result,new Element('textarea'),new Element('div')];
 for(const active of others){ui.document.activeElement=active;assert.equal(pressNoteEscape(ui).defaultPrevented,false,'note target requires active note focus')}
 e['bookmark-note'].focus();for(const target of others){assert.equal(pressNoteEscape(ui,{target}).defaultPrevented,false,'note focus requires exact note event target');assert.equal(pressBookmarkKey(ui,'Escape',{target}).defaultPrevented,false)}
 const child=new Element('span');e['bookmark-note'].append(child);assert.equal(pressNoteEscape(ui,{target:child,composedPath:()=>[child,e['bookmark-note']]}).defaultPrevented,false);
 assert.equal(pressBookmarkKey(ui,'Escape',{target:e['bookmark-note']}).defaultPrevented,false,'global replay shortcuts do not capture editor escape');
 assert.equal(ui.document.activeElement,e['bookmark-note']);assert.equal(e.result.focusCalls,undefined);assert.equal(e.result.scrollCalls,undefined);assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);
});

test('Esc ignores modifiers, held keys, consumed events and unrelated key values without moving note focus',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e['bookmark-note'].focus();editBookmark(ui,'synthetic native Escape draft');const requests=ui.pending.length;
 for(const properties of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true}])assert.equal(pressNoteEscape(ui,properties).defaultPrevented,false,JSON.stringify(properties));
 const consumed=pressNoteEscape(ui,{defaultPrevented:true});assert.equal(consumed.defaultPrevented,true);assert.equal(consumed.completion,undefined);
 for(const key of ['Esc','escape','EscapeEscape','Enter',' ','ArrowRight','m','Process','Dead',''])assert.equal(pressNoteEscape(ui,{key}).defaultPrevented,false,key);
 assert.equal(ui.document.activeElement,e['bookmark-note']);assert.equal(e.result.focusCalls,undefined);assert.equal(e.result.scrollCalls,undefined);assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);
});

test('Esc cannot steal IME cancellation through composing flags, key code 229 or document composition state',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e['bookmark-note'].focus();editBookmark(ui,'合成選字草稿',['occlusion']);const requests=ui.pending.length;
 for(const properties of [{isComposing:true},{keyCode:229},{isComposing:true,keyCode:229}])assert.equal(pressNoteEscape(ui,properties).defaultPrevented,false);
 ui.dispatch('compositionstart',{target:e['bookmark-note']});assert.equal(pressNoteEscape(ui,{isComposing:false,keyCode:27}).defaultPrevented,false);assert.equal(ui.document.activeElement,e['bookmark-note']);
 assert.equal(e.result.focusCalls,undefined);assert.equal(e['bookmark-note'].value,'合成選字草稿');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(ui.pending.length,requests);
 ui.dispatch('compositionend',{target:e['bookmark-note']});assert.equal(pressNoteEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);assert.equal(bookmarkWrites(ui).length,0);
});

test('hidden pages reject Esc and visibility and blur clear stale composition without discarding the note',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e['bookmark-note'].focus();editBookmark(ui,'synthetic visibility escape draft');
 ui.dispatch('compositionstart');ui.hide();assert.equal(pressNoteEscape(ui).defaultPrevented,false);assert.equal(ui.document.activeElement,e['bookmark-note']);assert.equal(e.result.focusCalls,undefined);
 ui.document.hidden=false;assert.equal(pressNoteEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);
 e['bookmark-note'].focus();ui.dispatch('compositionstart');assert.equal(pressNoteEscape(ui).defaultPrevented,false);ui.windowEvents.blur();assert.equal(pressNoteEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);
 assert.equal(e['bookmark-note'].value,'synthetic visibility escape draft');assert.equal(bookmarkWrites(ui).length,0);
});

test('the shortcut switch removes Escape metadata and prevents focus changes while explicit marking and saving remain available',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);pressMarkKey(ui);editBookmark(ui,'synthetic opt-out escape draft');
 assert.equal(e['bookmark-note'].getAttribute('aria-keyshortcuts'),'Control+Enter Escape');assert.equal(e['bookmark-save'].getAttribute('aria-keyshortcuts'),'Control+Enter');
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-note'].getAttribute('aria-keyshortcuts'),'');assert.equal(e['bookmark-save'].getAttribute('aria-keyshortcuts'),'');
 assert.equal(pressNoteEscape(ui).defaultPrevented,false);assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);assert.equal(ui.document.activeElement,e['bookmark-note']);assert.equal(e['bookmark-mark'].disabled,false);assert.equal(e['bookmark-save'].disabled,false);
 e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressNoteEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);assert.equal(bookmarkWrites(ui).length,0);
});

test('Esc is unavailable before display, during bookmark loading, after rejected bookmarks and for a mismatched saved snapshot',async()=>{
 for(const response of [null,{detail:'Unavailable'},bookmarkResponse('session-a',[bookmarkRecord(1,{snapshot_sha256:otherHash})])]){
  const ui=await startUI({delayBookmarks:true}),e=ui.elements;ui.document.activeElement=e['bookmark-note'];assert.equal(pressNoteEscape(ui).defaultPrevented,false);
  await showSaved(ui,2);assert.equal(e['bookmark-note'].disabled,true);assert.equal(pressNoteEscape(ui).defaultPrevented,false);
  if(response){ui.respond('/api/sessions/session-a/bookmarks',response,!response.detail,response.detail?500:200);await flush();assert.equal(pressNoteEscape(ui).defaultPrevented,false)}
  assert.equal(e.result.focusCalls,undefined);assert.equal(bookmarkWrites(ui).length,0);
 }
 const stale=await startUI(),s=stale.elements;const showing=s.replay.onclick();await flush();stale.respond('/api/sessions/session-a/frames/1/replay',{...replayResponse('session-a',1),snapshot_sha256:otherHash});await flush();await stale.decodeFrame('session-a',1);await showing;
 stale.document.activeElement=s['bookmark-note'];assert.equal(s['bookmark-note'].disabled,true);assert.equal(pressNoteEscape(stale).defaultPrevented,false);assert.equal(s.result.focusCalls,undefined);
 const unshown=await startUI();unshown.document.activeElement=unshown.elements['bookmark-note'];assert.equal(pressNoteEscape(unshown).defaultPrevented,false);assert.equal(unshown.elements.result.focusCalls,undefined);
});

test('Esc does not cancel loading seeks, bookmark jumps or manual replays while the note is disabled',async()=>{
 for(const kind of ['seek','jump','manual']){
  const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(3)]}),e=ui.elements;await showSaved(ui,2);e['bookmark-note'].focus();editBookmark(ui,'synthetic pending escape draft',['occlusion']);
  let loading;if(kind==='seek')loading=scrub(ui,3);else if(kind==='jump')loading=e['bookmark-next'].onclick();else{e['frames-list'].value='3';loading=e.replay.onclick()}
  await flush();assert.equal(e['bookmark-note'].disabled,true);assert.equal(pressNoteEscape(ui).defaultPrevented,false);assert.equal(e.result.focusCalls,undefined);
  await completeReplay(ui,3);await loading;assertShownFrame(ui,3);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');
  await showSaved(ui,2);assert.equal(e['bookmark-note'].value,'synthetic pending escape draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(bookmarkWrites(ui).length,0);
 }
});

test('a valid note followed by Esc retains the last complete frame when a canceled automatic presentation finishes late',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);editBookmark(ui,'synthetic pending automatic escape draft',['crossing']);
 e['playback-play'].onclick();await ui.tick(0);ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();ui.decode('data:image/png;base64,session-a-3');await flush();
 assert.equal(e['bookmark-note'].disabled,true);e['bookmark-note'].focus();assert.equal(e['bookmark-note'].disabled,false);const requests=ui.pending.length,image=e.rgb,depth=e.depth;
 assert.equal(pressNoteEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);ui.decode('data:image/jpeg;base64,session-a-depth-3');await ui.tick(1000);
 assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(ui.cloudUpdates.length,1);
 assert.equal(e['bookmark-note'].value,'synthetic pending automatic escape draft');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);
});

test('Esc leaves a pending write intact and a note remains savable by Ctrl+Enter after returning with M',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);pressMarkKey(ui);editBookmark(ui,'synthetic Escape then save draft',['crossing']);
 assert.equal(pressNoteEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);pressMarkKey(ui);const saving=pressNoteSaveKey(ui);assert.equal(saving.defaultPrevented,true);await flush();
 const requests=ui.pending.length;assert.equal(e['bookmark-note'].disabled,true);assert.equal(pressNoteEscape(ui).defaultPrevented,false);assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,1);
 await finishNoteSave(ui,2,'synthetic Escape then save draft',['crossing']);await saving.completion;assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/);assert.equal(e['bookmark-note'].value,'synthetic Escape then save draft');
 assert.equal(pressNoteEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);assert.equal(bookmarkWrites(ui).length,1);
});

test('Esc rejects a note from an old Session and returns only after a displayed frame is ready in the new Session',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);pressMarkKey(ui);editBookmark(ui,'synthetic old Session Escape draft',['occlusion']);
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();assert.equal(pressNoteEscape(ui).defaultPrevented,false);assert.equal(e.result.focusCalls,undefined);
 await finishFrames(ui,'session-b');await switched;assert.equal(pressNoteEscape(ui).defaultPrevented,false);await showSaved(ui,1,{sid:'session-b'});e['bookmark-note'].focus();editBookmark(ui,'synthetic new Session Escape draft',['crossing']);
 const requests=ui.pending.length;assert.equal(pressNoteEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);assert.equal(e.rgb.src,'data:image/png;base64,session-b-1');assert.equal(e['bookmark-note'].value,'synthetic new Session Escape draft');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.equal(e['bookmark-tag-occlusion'].checked,false);
 assert.equal(ui.pending.length,requests);assert.equal(bookmarkWrites(ui).length,0);
});

test('the replay return target is keyboard-focusable and named by its visible heading',()=>{
 const markup=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8'),result=markup.match(/<section\b[^>]*\bid="result"[^>]*>/)?.[0];
 assert.ok(result,'replay result section exists');assert.match(result,/\btabindex="-1"/);assert.match(result,/\baria-labelledby="replay-title"/);
 assert.match(markup,/<h2\b[^>]*\bid="replay-title"[^>]*data-i="view"/);
});

function pressHelpKey(ui,properties={}){return pressBookmarkKey(ui,'?',properties)}
function assertHelpOpen(ui){assert.equal(ui.elements['shortcut-help-dialog'].open,true);assert.equal(ui.document.activeElement,ui.elements['shortcut-help-close']);assert.equal(ui.elements['shortcut-help-open'].getAttribute('aria-expanded'),'true');assert.match(ui.elements['playback-status'].textContent,/Paused|已暫停/)}

test('question mark including Shift opens and closes help before any frame is displayed',async()=>{
 const ui=await startUI(),e=ui.elements,calls=ui.pending.length;e['shortcut-help-open'].focus();
 assert.equal(e['shortcut-help-dialog'].open,false);assert.equal(e['shortcut-help-open'].getAttribute('aria-keyshortcuts'),'?');
 assert.equal(pressHelpKey(ui,{shiftKey:true}).defaultPrevented,true);assertHelpOpen(ui);assert.equal(e['shortcut-help-dialog'].modalShows,1);
 assert.equal(pressHelpKey(ui,{target:e['shortcut-help-close']}).defaultPrevented,true);assert.equal(e['shortcut-help-dialog'].open,false);assert.equal(ui.document.activeElement,e['shortcut-help-open']);
 assert.equal(e['shortcut-help-open'].getAttribute('aria-expanded'),'false');assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('help uses a native labeled modal and lists every playback/bookmark/note action',()=>{
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');
 assert.match(html,/<dialog id="shortcut-help-dialog" aria-labelledby="shortcut-help-title" aria-describedby="shortcut-help-intro">/);
 assert.match(html,/<button id="shortcut-help-close"[^>]*autofocus/);
 for(const key of ['shortcutHelpSpace','shortcutHelpFrames','shortcutHelpBounds','shortcutHelpLoop','shortcutHelpBookmarks','shortcutHelpMark','shortcutHelpSave','shortcutHelpEscape','shortcutHelpEnter','shortcutHelpScope'])assert.ok(html.includes('data-i="'+key+'"'),key);
 assert.match(html,/aria-haspopup="dialog" aria-controls="shortcut-help-dialog"/);
});

test('question mark is ordinary text in notes/search and cannot bypass focused or custom editors',async()=>{
 const ui=await startUI(),e=ui.elements;await showFirst(ui);const calls=ui.pending.length;
 const controls=[e['bookmark-note'],e['bookmark-search'],e['frames-list'],e['replay-progress'],e.label];
 for(const role of ['textbox','searchbox','combobox','slider','listbox']){const editor=new Element('div');editor.setAttribute('role',role);controls.push(editor)}
 const editable=new Element('div');editable.setAttribute('contenteditable','true');controls.push(editable);
 for(const target of controls){assert.equal(pressHelpKey(ui,{target,shiftKey:true}).defaultPrevented,false);const child=new Element('span');target.append(child);assert.equal(pressHelpKey(ui,{composedPath:()=>[child,target],shiftKey:true}).defaultPrevented,false)}
 e['bookmark-note'].focus();assert.equal(pressHelpKey(ui,{target:e.result}).defaultPrevented,false);e['bookmark-search'].focus();assert.equal(pressHelpKey(ui,{target:e['shortcut-help-open']}).defaultPrevented,false);
 assert.equal(e['shortcut-help-dialog'].open,false);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('help ignores composition, modified, repeated, handled, hidden and non-question keys',async()=>{
 const ui=await startUI(),e=ui.elements;await showFirst(ui);
 for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressHelpKey(ui,props).defaultPrevented,false);
 assert.equal(pressHelpKey(ui,{defaultPrevented:true}).defaultPrevented,true);
 for(const key of ['/','？','Dead','Process'])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);
 ui.dispatch('compositionstart');assert.equal(pressHelpKey(ui).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressHelpKey(ui).defaultPrevented,false);
 ui.document.hidden=false;assert.equal(e['shortcut-help-dialog'].open,false);assert.equal(pressHelpKey(ui,{shiftKey:true}).defaultPrevented,true);assertHelpOpen(ui);
});

test('opening help cancels partial autoplay and keeps the previous complete image and IDs until an explicit resume',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);e.result.focus();e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();
 assert.equal(pressHelpKey(ui).defaultPrevented,true);assertHelpOpen(ui);ui.decode('data:image/jpeg;base64,session-a-depth-2');await ui.tick(1000);
 assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.equal(ui.cloudUpdates.length,1);
 e['shortcut-help-close'].onclick();assert.equal(ui.document.activeElement,e.result);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(pressBookmarkKey(ui,' ',{target:e.result}).defaultPrevented,true);await ui.tick(0);await completeReplay(ui,2);assertShownFrame(ui,2);e['playback-pause'].onclick();
});

test('help cancels a delayed progress seek and a bookmark jump without replacing the displayed snapshot',async()=>{
 for(const mode of ['seek','bookmark']){
  const ui=await startUI({bookmarks:[bookmarkRecord(3)],trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);e.result.focus();
  const pending=mode==='seek'?scrub(ui,3):e['bookmark-next'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();
  assert.equal(pressHelpKey(ui,{target:e.result}).defaultPrevented,true);assertHelpOpen(ui);await ui.decodeFrame('session-a',3);await pending;
  assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.equal(bookmarkWrites(ui).length,0);e['shortcut-help-close'].onclick();assert.equal(e['playback-play'].disabled,false);
 }
});

test('an open help modal never triggers background replay, loop, bookmark or note-save shortcuts',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);e.result.focus();pressHelpKey(ui);const calls=ui.pending.length;
 for(const key of [' ','ArrowLeft','ArrowRight','[',']','a','b','l','m'])assert.equal(pressBookmarkKey(ui,key,{target:e['shortcut-help-close']}).defaultPrevented,false,key);
 ui.document.activeElement=e['bookmark-note'];assert.equal(pressNoteSaveKey(ui).defaultPrevented,false);assert.equal(pressNoteEscape(ui).defaultPrevented,false);ui.document.activeElement=e['shortcut-help-close'];
 assert.equal(pressBookmarkKey(ui,'Escape',{target:e['shortcut-help-close']}).defaultPrevented,false,'native dialog Escape is not intercepted');
 assertLoopValues(ui,1,3,true);assertShownFrame(ui,2);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
 e['shortcut-help-dialog'].close();assert.equal(e['shortcut-help-open'].getAttribute('aria-expanded'),'false');assert.equal(ui.document.activeElement,e.result);
});

test('the help button remains available with shortcuts off and reports the current enabled state',async()=>{
 const ui=await startUI(),e=ui.elements;e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();
 assert.equal(e['shortcut-help-open'].getAttribute('aria-keyshortcuts')||'','');assert.equal(pressHelpKey(ui).defaultPrevented,false);e['shortcut-help-open'].focus();e['shortcut-help-open'].onclick();assertHelpOpen(ui);
 assert.match(e['shortcut-help-status'].textContent,/disabled/);assert.equal(pressHelpKey(ui).defaultPrevented,false);e['shortcut-help-close'].onclick();assert.equal(ui.document.activeElement,e['shortcut-help-open']);
 e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();pressHelpKey(ui);assert.match(e['shortcut-help-status'].textContent,/enabled/);e.lang.value='zh-TW';e.lang.onchange();assert.match(e['shortcut-help-status'].textContent,/已開啟/);assertHelpOpen(ui);
});

test('help preserves even invalid unsaved drafts, tags, filters and A/B settings without writes',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1,{tags:['crossing'],note:'saved'})]}),e=ui.elements;await showFirst(ui);configureLoop(ui,1,2);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'saved');editBookmark(ui,'x'.repeat(1001),['occlusion']);e['bookmark-note'].focus();const calls=ui.pending.length;
 e['shortcut-help-open'].onclick();assertHelpOpen(ui);assert.equal(e['bookmark-save'].disabled,true);e['shortcut-help-close'].onclick();assert.equal(ui.document.activeElement,e['bookmark-note']);
 assert.equal(e['bookmark-note'].value,'x'.repeat(1001));assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'saved');assertLoopValues(ui,1,2,true);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('opening help does not cancel an explicit in-flight bookmark save',async()=>{
 const ui=await startUI(),e=ui.elements;await showFirst(ui);editBookmark(ui,'synthetic review',['crossing']);e['bookmark-note'].focus();const saving=pressNoteSaveKey(ui);await flush();e['shortcut-help-open'].focus();e['shortcut-help-open'].onclick();assertHelpOpen(ui);assert.equal(bookmarkWrites(ui).length,1);
 ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{note:'synthetic review',tags:['crossing']})]));await saving.completion;
 assert.equal(e['shortcut-help-dialog'].open,true);assert.equal(ui.document.activeElement,e['shortcut-help-close']);assert.equal(e['bookmark-note'].value,'synthetic review');assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/);e['shortcut-help-close'].onclick();assert.equal(ui.document.activeElement,e['shortcut-help-open']);
});

test('plus/minus speed keys step through selector options, clamp at both ends and keep paused replay/drafts intact',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1,{note:'saved',tags:['crossing']})],trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 configureLoop(ui,1,3);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'saved');editBookmark(ui,'synthetic speed draft',['occlusion']);e.result.focus();const calls=ui.pending.length;
 for(const [key,expected] of [['-',.5],['-',.25],['-',.25],['+',.5],['+',1],['+',2],['+',2],['－',1],['＋',2]]){
  assert.equal(pressBookmarkKey(ui,key,{target:e.result,shiftKey:key==='+'}).defaultPrevented,true,key);
  assert.equal(Number(e['playback-speed'].value),expected);assert.match(e['playback-status'].textContent,new RegExp('Paused.*'+String(expected).replace('.','\\.')+'×'));
  assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 }
 assert.equal(pressBookmarkKey(ui,'-',{target:e.result,code:'NumpadSubtract',location:3}).defaultPrevented,true);assert.equal(Number(e['playback-speed'].value),1);
 assert.equal(pressBookmarkKey(ui,'+',{target:e.result,code:'NumpadAdd',location:3}).defaultPrevented,true);assert.equal(Number(e['playback-speed'].value),2);
 assertLoopValues(ui,1,3,true);assert.equal(e['bookmark-note'].value,'synthetic speed draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'saved');assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('speed keys retain a pending autoplay decode and apply the new cadence without duplicate frame requests',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);e.result.focus();e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();const calls=replayRequests(ui).length;
 assert.equal(pressBookmarkKey(ui,'+',{shiftKey:true,target:e.result}).defaultPrevented,true);assert.match(e['playback-status'].textContent,/Playing.*2×/);assertShownFrame(ui,1);assert.equal(replayRequests(ui).length,calls);
 ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');
 await ui.tick(99);assert.equal(replayRequests(ui).length,calls);await ui.tick(1);assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,3);assertShownFrame(ui,3);e['playback-pause'].onclick();
});

test('speed shortcuts use the same rescheduling as the selector while a timer is waiting',async()=>{
 const ui=await startUI(),e=ui.elements;await showFirst(ui);e.result.focus();e['playback-play'].onclick();await ui.tick(0);await completeReplay(ui,2);await ui.tick(50);
 assert.equal(pressBookmarkKey(ui,'-',{target:e.result}).defaultPrevented,true);assert.match(e['playback-status'].textContent,/Playing.*0\.5×/);
 await ui.tick(349);assert.equal(replayRequests(ui).length,2);await ui.tick(1);assert.equal(replayRequests(ui).length,3);await completeReplay(ui,3);e['playback-pause'].onclick();
});

test('speed shortcuts leave note/search/native/custom editors and composed-path focus unconsumed',async()=>{
 const ui=await startUI(),e=ui.elements;await showFirst(ui);
 const editors=[e['bookmark-note'],e['bookmark-search'],e['playback-speed'],e['loop-start'],e['frames-list'],e['replay-progress'],e.label];
 for(const role of ['textbox','searchbox','combobox','slider','spinbutton','listbox']){const editor=new Element('div');editor.setAttribute('role',role);editors.push(editor)}
 const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const key of ['+','-','＋','－'])for(const target of editors){
  assert.equal(pressBookmarkKey(ui,key,{target,shiftKey:key==='+'}).defaultPrevented,false);
  const child=new Element('span');target.append(child);assert.equal(pressBookmarkKey(ui,key,{target:e.result,composedPath:()=>[child,target]}).defaultPrevented,false);
 }
 e['bookmark-note'].focus();assert.equal(pressBookmarkKey(ui,'+',{target:e.result,shiftKey:true}).defaultPrevented,false);e['bookmark-search'].focus();assert.equal(pressBookmarkKey(ui,'-',{target:e.result}).defaultPrevented,false);
 assert.equal(Number(e['playback-speed'].value),1);assert.equal(bookmarkWrites(ui).length,0);
});

test('speed shortcut opt-out, IME, modifiers, repeated/handled/hidden events and an open modal are guarded',async()=>{
 const ui=await startUI(),e=ui.elements;await showFirst(ui);e.result.focus();
 for(const key of ['+','-','＋','－'])for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,{target:e.result,...props}).defaultPrevented,false);
 assert.equal(pressBookmarkKey(ui,'+',{defaultPrevented:true}).defaultPrevented,true);for(const key of ['=','_','Add','Subtract'])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'+').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'-').defaultPrevented,false);ui.document.hidden=false;
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['playback-speed'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'+').defaultPrevented,false);
 e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['playback-speed'].getAttribute('aria-keyshortcuts'),'Plus Shift+= - 0');e['shortcut-help-open'].onclick();
 for(const key of ['+','-','＋','－'])assert.equal(pressBookmarkKey(ui,key,{target:e['shortcut-help-close']}).defaultPrevented,false);e['shortcut-help-close'].onclick();
 e['playback-speed'].disabled=true;assert.equal(pressBookmarkKey(ui,'+',{target:e.result}).defaultPrevented,false);e['playback-speed'].disabled=false;e['playback-speed'].selectedIndex=-1;assert.equal(pressBookmarkKey(ui,'+',{target:e.result}).defaultPrevented,false);
 e['playback-speed'].value='1';assert.match(e['playback-status'].textContent,/Paused.*1×/);assert.equal(bookmarkWrites(ui).length,0);
});

test('speed may be preselected without a displayed frame and is reflected in both language statuses and help',async()=>{
 const ui=await startUI(),e=ui.elements;assert.equal(e.result.hidden,true);const calls=ui.pending.length;
 assert.equal(pressBookmarkKey(ui,'-').defaultPrevented,true);assert.equal(Number(e['playback-speed'].value),.5);assert.match(e['playback-status'].textContent,/Paused.*0\.5×/);
 e.lang.value='zh-TW';e.lang.onchange();assert.match(e['playback-status'].textContent,/已暫停.*0\.5×/);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>\+<\/kbd> \/ <kbd>-<\/kbd><\/dt><dd data-i="shortcutHelpSpeed">/);
 assert.match(sessionsSource,/shortcutHelpSpeed:"Increase \/ decrease speed/);assert.match(sessionsSource,/shortcutHelpSpeed:"加速／減速/);
});

test('zero resets every selected speed to 1x without changing paused frame, draft, filters or A/B',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1,{note:'saved',tags:['crossing']})],trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);
 configureLoop(ui,1,3);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'saved');editBookmark(ui,'synthetic normal-speed draft',['occlusion']);e.result.focus();const calls=ui.pending.length;
 for(const speed of ['.25','.5','1','2']){
  e['playback-speed'].value=speed;e['playback-speed'].onchange();
  assert.equal(pressBookmarkKey(ui,'0',{target:e.result,code:'Digit0'}).defaultPrevented,true);assert.equal(e['playback-speed'].value,'1');assert.match(e['playback-status'].textContent,/Paused.*1×/);assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 }
 e['playback-speed'].value='.5';e['playback-speed'].onchange();assert.equal(pressBookmarkKey(ui,'0',{target:e.result,code:'Numpad0',location:3}).defaultPrevented,true);assert.equal(e['playback-speed'].value,'1');
 assertLoopValues(ui,1,3,true);assert.equal(e['bookmark-note'].value,'synthetic normal-speed draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'saved');assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('zero keeps playing and pending exact-frame decode valid, with 1x cadence and no duplicate requests',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);e.result.focus();e['playback-speed'].value='2';e['playback-speed'].onchange();e['playback-play'].onclick();await ui.tick(0);
 ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();const calls=replayRequests(ui).length;
 assert.equal(pressBookmarkKey(ui,'0',{target:e.result}).defaultPrevented,true);assert.equal(e['playback-speed'].value,'1');assert.match(e['playback-status'].textContent,/Playing.*1×/);assertShownFrame(ui,1);assert.equal(replayRequests(ui).length,calls);
 ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');
 await ui.tick(75);assert.equal(pressBookmarkKey(ui,'0',{target:e.result}).defaultPrevented,true);await ui.tick(124);assert.equal(replayRequests(ui).length,calls);await ui.tick(1);assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,3);assertShownFrame(ui,3);e['playback-pause'].onclick();
});

test('zero reset ignores editors, IME, modifiers, repeated/handled/hidden keys, opt-out and modal background',async()=>{
 const ui=await startUI(),e=ui.elements;await showFirst(ui);e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();const calls=ui.pending.length;
 const editors=[e['bookmark-note'],e['bookmark-search'],e['playback-speed'],e['loop-start'],e['frames-list'],e['replay-progress'],e.label];
 for(const role of ['textbox','searchbox','combobox','slider','spinbutton','listbox']){const editor=new Element('div');editor.setAttribute('role',role);editors.push(editor)}
 const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'0',{target}).defaultPrevented,false);const child=new Element('span');target.append(child);assert.equal(pressBookmarkKey(ui,'0',{target:e.result,composedPath:()=>[child,target]}).defaultPrevented,false)}
 e['bookmark-note'].focus();assert.equal(pressBookmarkKey(ui,'0',{target:e.result}).defaultPrevented,false);e['bookmark-search'].focus();assert.equal(pressBookmarkKey(ui,'0',{target:e.result}).defaultPrevented,false);e.result.focus();
 for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'0',{target:e.result,...props}).defaultPrevented,false);
 assert.equal(pressBookmarkKey(ui,'0',{defaultPrevented:true}).defaultPrevented,true);for(const key of ['Insert',')','０'])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'0').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'0').defaultPrevented,false);ui.document.hidden=false;
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['playback-speed'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'0').defaultPrevented,false);
 e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['playback-speed'].getAttribute('aria-keyshortcuts'),'Plus Shift+= - 0');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'0',{target:e['shortcut-help-close']}).defaultPrevented,false);e['shortcut-help-close'].onclick();
 e['playback-speed'].disabled=true;assert.equal(pressBookmarkKey(ui,'0',{target:e.result}).defaultPrevented,false);e['playback-speed'].disabled=false;assert.equal(e['playback-speed'].value,'2');assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('zero preselects normal speed without a replay and updates bilingual help and status',async()=>{
 const ui=await startUI(),e=ui.elements;assert.equal(e.result.hidden,true);e['playback-speed'].value='.25';e['playback-speed'].onchange();const calls=ui.pending.length;
 assert.equal(pressBookmarkKey(ui,'0').defaultPrevented,true);assert.equal(e['playback-speed'].value,'1');assert.match(e['playback-status'].textContent,/Paused.*1×/);e.lang.value='zh-TW';e.lang.onchange();assert.match(e['playback-status'].textContent,/已暫停.*1×/);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>0<\/kbd><\/dt><dd data-i="shortcutHelpSpeedReset">/);assert.match(sessionsSource,/shortcutHelpSpeedReset:"Reset speed to 1×/);assert.match(sessionsSource,/shortcutHelpSpeedReset:"速度恢復為 1×/);
});

test('Home/End jump across the full Session outside filters and A/B, preserving per-frame drafts and speed',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(2,{note:'saved middle',tags:['crossing']})]}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,2,3);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'saved middle');editBookmark(ui,'synthetic middle draft',['occlusion']);e['playback-speed'].value='.5';e['playback-speed'].onchange();e.result.focus();
 await completeFrameKey(ui,'Home',1);assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');editBookmark(ui,'synthetic first draft',['id-switch']);e.result.focus();
 await completeFrameKey(ui,'End',3);assertShownFrame(ui,3);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');assert.match(e['playback-status'].textContent,/Paused.*0\.5×/);assertLoopValues(ui,2,3,true);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'saved middle');
 await completeFrameKey(ui,'Home',1);assert.equal(e['bookmark-note'].value,'synthetic first draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);await completeFrameKey(ui,'ArrowRight',2);assert.equal(e['bookmark-note'].value,'synthetic middle draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(bookmarkWrites(ui).length,0);
});

test('endpoint keys use saved ordering with sparse indices, work before replay and do not reload an already shown endpoint',async()=>{
 const ui=await startUI({frameIndices:[4,9,20]}),e=ui.elements;assert.equal(e.result.hidden,true);await completeFrameKey(ui,'End',20);assert.equal(e['frames-list'].value,'20');assertProgress(ui,3,3);await completeFrameKey(ui,'Home',4);assert.equal(e['frames-list'].value,'4');assertProgress(ui,1,3);
 const calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,'Home').defaultPrevented,true);await flush();assert.equal(replayRequests(ui).length,calls);assert.match(e['playback-status'].textContent,/Paused/);
 const single=await startUI({frameIndices:[7]});await completeFrameKey(single,'Home',7,{total:1});const oneCalls=replayRequests(single).length;assert.equal(pressBookmarkKey(single,'End').defaultPrevented,true);await flush();assert.equal(replayRequests(single).length,oneCalls);
 const empty=await startUI({frameIndices:[]});for(const key of ['Home','End'])assert.equal(pressBookmarkKey(empty,key).defaultPrevented,false);
});

test('Home cancels a pending autoplay decode at the already displayed endpoint and permits a new End jump immediately',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);e.result.focus();e['playback-play'].onclick();await ui.tick(0);ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();
 const calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,'Home',{target:e.result}).defaultPrevented,true);await flush();assert.equal(replayRequests(ui).length,calls);assertShownFrame(ui,1);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(e['playback-play'].disabled,false);
 assert.equal(pressBookmarkKey(ui,'End',{target:e.result}).defaultPrevented,true);await flush();await completeReplay(ui,3);ui.decode('data:image/jpeg;base64,session-a-depth-2');await ui.tick(1000);assertShownFrame(ui,3);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');assert.equal(ui.cloudUpdates.length,2);
});

test('End cancels pending autoplay fetch and ignores duplicate jumps during a manual endpoint load',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);e.result.focus();e['playback-play'].onclick();await ui.tick(0);assert.equal(pressBookmarkKey(ui,'End',{target:e.result}).defaultPrevented,true);await flush();const calls=replayRequests(ui).length;
 for(const key of ['Home','End'])assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);await completeReplay(ui,3);ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await ui.tick(1000);assertShownFrame(ui,3);assert.equal(replayRequests(ui).length,calls);assert.match(e['playback-status'].textContent,/Paused/);
});

test('endpoint/page keys preserve editor/native behavior and ignore IME, modifiers, hidden/repeated/handled events, opt-out and modal focus',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e.result.focus();const calls=ui.pending.length;
 const editors=[e['bookmark-note'],e['bookmark-search'],e['playback-speed'],e['loop-start'],e['frames-list'],e['replay-progress'],e.label];for(const role of ['textbox','searchbox','combobox','slider','spinbutton','listbox','grid','tablist']){const editor=new Element('div');editor.setAttribute('role',role);editors.push(editor)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const key of ['Home','End','PageUp','PageDown']){
  for(const target of editors){assert.equal(pressBookmarkKey(ui,key,{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,key,{composedPath:()=>[child,target]}).defaultPrevented,false)}
  e['bookmark-note'].focus();assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);e['bookmark-search'].focus();assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);e.result.focus();
  for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,key,{defaultPrevented:true}).defaultPrevented,true);
  ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);ui.document.hidden=false;
 }
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');for(const key of ['Home','End','PageUp','PageDown'])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e.result.getAttribute('aria-keyshortcuts'),'Home End PageUp PageDown Shift+A Shift+B');e['shortcut-help-open'].onclick();for(const key of ['Home','End','PageUp','PageDown'])assert.equal(pressBookmarkKey(ui,key,{target:e['shortcut-help-close']}).defaultPrevented,false);e['shortcut-help-close'].onclick();assertShownFrame(ui,2);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('endpoint/page keys cannot replace an in-flight seek, bookmark jump or explicit bookmark write',async()=>{
 for(const mode of ['seek','bookmark','write']){
  const ui=await startUI({bookmarks:[bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);e.result.focus();
  let pending;if(mode==='seek')pending=scrub(ui,2);else if(mode==='bookmark')pending=e['bookmark-next'].onclick();else{editBookmark(ui,'synthetic pending annotation');pending=e['bookmark-save'].onclick()}await flush();const calls=ui.pending.length;
  for(const key of ['Home','End','PageUp','PageDown'])assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);for(const key of ['a','b'])assert.equal(pressBookmarkKey(ui,key,{target:e.result,shiftKey:true}).defaultPrevented,false);assert.equal(ui.pending.length,calls);
  if(mode==='write')ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{note:'synthetic pending annotation'})]));else await completeReplay(ui,mode==='seek'?2:3);await pending;
 }
});

test('failed endpoint loads retain exact images and IDs and can be retried; bilingual help lists Home/End',async()=>{
 for(const failure of ['fetch','decode']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);e.result.focus();const image=e.rgb,depth=e.depth;assert.equal(pressBookmarkKey(ui,'End').defaultPrevented,true);await flush();
  if(failure==='fetch')ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic failure'},false,404);else{ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();ui.decode('data:image/png;base64,session-a-3',Error('synthetic decode failure'));ui.decode('data:image/jpeg;base64,session-a-depth-3')}await flush();assertShownFrame(ui,2);assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.match(e.status.textContent,/Request failed/);await completeFrameKey(ui,'End',3);assertShownFrame(ui,3);
 }
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>Home<\/kbd> \/ <kbd>End<\/kbd><\/dt><dd data-i="shortcutHelpEdges">/);assert.match(sessionsSource,/shortcutHelpEdges:"Pause and jump/);assert.match(sessionsSource,/shortcutHelpEdges:"暫停並跳到/);
});

function pageKeySequence(indices){return report({total_session_frames:indices.length,frames:indices.map(index=>({...report().frames[0],index,objects:[observation({object_id:'obj-'+String(index).padStart(4,'0')})]}))})}
async function completePageKey(ui,key,index,total=24){await completeFrameKey(ui,key,index,{total});assert.equal(ui.elements['frames-list'].value,String(index));assert.equal(ui.elements.rgb.src,'data:image/png;base64,session-a-'+index);assert.equal(ui.elements.depth.src,'data:image/jpeg;base64,session-a-depth-'+index);assert.equal(ui.cloudUpdates.at(-1)[0],'points-session-a-'+index)}

test('Page Up/Down jump ten saved positions and clamp without wrapping, preserving drafts, speed, filters and A/B',async()=>{
 const indices=Array.from({length:24},(_,i)=>i+1),ui=await startUI({frameIndices:indices,trackingReport:pageKeySequence(indices),bookmarks:[bookmarkRecord(12,{note:'saved review',tags:['crossing']})]}),e=ui.elements;await showSaved(ui,12,{total:24});configureLoop(ui,10,15);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'saved review');editBookmark(ui,'synthetic ten-frame draft',['occlusion']);e['playback-speed'].value='.5';e['playback-speed'].onchange();e.result.focus();
 await completePageKey(ui,'PageUp',2);assertProgress(ui,2,24);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');await completePageKey(ui,'PageDown',12);assert.equal(e['bookmark-note'].value,'synthetic ten-frame draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);
 for(const [key,index] of [['PageDown',22],['PageDown',24],['PageUp',14],['PageUp',4],['PageUp',1]]){await completePageKey(ui,key,index);assertProgress(ui,index,24);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-'+String(index).padStart(4,'0'))}
 let calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,'PageUp',{target:e.result}).defaultPrevented,true);await flush();assert.equal(replayRequests(ui).length,calls);
 for(const index of [11,21,24])await completePageKey(ui,'PageDown',index);calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,'PageDown',{target:e.result}).defaultPrevented,true);await flush();assert.equal(replayRequests(ui).length,calls);
 assert.match(e['playback-status'].textContent,/Paused.*0\.5×/);assertLoopValues(ui,10,15,true);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'saved review');assert.equal(bookmarkWrites(ui).length,0);
});

test('page jumps count sparse saved order, require a displayed snapshot and handle empty/single-frame Sessions',async()=>{
 const indices=Array.from({length:24},(_,i)=>4+i*3),ui=await startUI({frameIndices:indices}),e=ui.elements;const calls=replayRequests(ui).length;
 for(const key of ['PageUp','PageDown'])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);assert.equal(replayRequests(ui).length,calls);await showSaved(ui,indices[11],{total:24});
 await completePageKey(ui,'PageDown',indices[21]);assertProgress(ui,22,24);await completePageKey(ui,'PageUp',indices[11]);assertProgress(ui,12,24);
 const empty=await startUI({frameIndices:[]});for(const key of ['PageUp','PageDown'])assert.equal(pressBookmarkKey(empty,key).defaultPrevented,false);
 const single=await startUI({frameIndices:[7]});await showSaved(single,7,{total:1});const singleCalls=replayRequests(single).length;for(const key of ['PageUp','PageDown'])assert.equal(pressBookmarkKey(single,key).defaultPrevented,true);await flush();assert.equal(replayRequests(single).length,singleCalls);assertProgress(single,1,1);
});

test('page jumps cancel pending autoplay fetch/decode, use the shown frame and serialize manual page loads',async()=>{
 for(const mode of ['fetch','decode','boundary']){
  const indices=Array.from({length:24},(_,i)=>i+1),ui=await startUI({frameIndices:indices,trackingReport:pageKeySequence(indices)}),e=ui.elements;await showSaved(ui,1,{total:24});e.result.focus();e['playback-play'].onclick();await ui.tick(0);
  if(mode!=='fetch'){ui.respond('/api/sessions/session-a/frames/2/replay',{...replayResponse('session-a',2),total_session_frames:24});await flush();ui.decode('data:image/png;base64,session-a-2');await flush()}
  // A pending dropdown selection must not become the jump origin.
  e['frames-list'].value='20';if(mode==='boundary'){const calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,'PageUp',{target:e.result}).defaultPrevented,true);await flush();assert.equal(replayRequests(ui).length,calls);assert.equal(e['frames-list'].value,'1');assert.equal(e['playback-play'].disabled,false)}
  assert.equal(pressBookmarkKey(ui,'PageDown',{target:e.result}).defaultPrevented,true);await flush();for(const key of ['PageUp','PageDown'])assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);await completeReplay(ui,11,{total:24});
  if(mode==='fetch')ui.respond('/api/sessions/session-a/frames/2/replay',{...replayResponse('session-a',2),total_session_frames:24});else ui.decode('data:image/jpeg;base64,session-a-depth-2');await ui.tick(1000);
  assert.equal(e['frames-list'].value,'11');assertProgress(ui,11,24);assert.equal(e.rgb.src,'data:image/png;base64,session-a-11');assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0011');assert.equal(ui.cloudUpdates.length,2);assert.match(e['playback-status'].textContent,/Paused/);
 }
});

test('page jump failures retain the complete snapshot and retry; Session changes invalidate pending jumps and help is bilingual',async()=>{
 const indices=Array.from({length:24},(_,i)=>i+1);
 for(const failure of ['fetch','decode']){
  const ui=await startUI({frameIndices:indices,trackingReport:pageKeySequence(indices)}),e=ui.elements;await showSaved(ui,12,{total:24});const image=e.rgb,depth=e.depth;assert.equal(pressBookmarkKey(ui,'PageDown').defaultPrevented,true);await flush();
  if(failure==='fetch')ui.respond('/api/sessions/session-a/frames/22/replay',{detail:'synthetic unavailable'},false,404);else{ui.respond('/api/sessions/session-a/frames/22/replay',{...replayResponse('session-a',22),total_session_frames:24});await flush();ui.decode('data:image/png;base64,session-a-22',Error('synthetic decode failure'));ui.decode('data:image/jpeg;base64,session-a-depth-22')}await flush();assert.equal(e.rgb,image);assert.equal(e.depth,depth);assertProgress(ui,12,24);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0012');assert.match(e.status.textContent,/Request failed/);await completePageKey(ui,'PageDown',22);
 }
 const ui=await startUI({frameIndices:indices}),e=ui.elements;await showSaved(ui,12,{total:24});pressBookmarkKey(ui,'PageDown');await flush();ui.respond('/api/sessions/session-a/frames/22/replay',{...replayResponse('session-a',22),total_session_frames:24});await flush();e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();for(const key of ['PageUp','PageDown'])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);await finishFrames(ui,'session-b');await switched;await ui.decodeFrame('session-a',22);assert.equal(e.result.hidden,true);assert.equal(ui.cloudUpdates.length,1);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>Page Up<\/kbd> \/ <kbd>Page Down<\/kbd><\/dt><dd data-i="shortcutHelpPages">/);assert.match(sessionsSource,/shortcutHelpPages:"Pause and jump back \/ forward 10/);assert.match(sessionsSource,/shortcutHelpPages:"暫停並從目前顯示影格/);
});

async function completeIntervalKey(ui,key,index,options={}){return completeFrameKey(ui,key,index,{...options,event:{shiftKey:true,...options.event}})}

test('Shift+A/B jump to existing bounds with loop on or off and preserve drafts, filters, speed and plain A/B marking',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(2,{note:'saved middle',tags:['crossing']})]}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'saved middle');editBookmark(ui,'synthetic interval jump draft',['occlusion']);e['playback-speed'].value='.5';e['playback-speed'].onchange();e.result.focus();
 await completeIntervalKey(ui,'A',1);assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assertLoopValues(ui,1,3,true);
 await completeIntervalKey(ui,'B',3);assertShownFrame(ui,3);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');assertLoopValues(ui,1,3,true);configureLoop(ui,1,3,false);
 await completeIntervalKey(ui,'a',1);assertLoopValues(ui,1,3,false);await completeFrameKey(ui,'ArrowRight',2);assert.equal(e['bookmark-note'].value,'synthetic interval jump draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'saved middle');assert.match(e['playback-status'].textContent,/Paused.*0\.5×/);
 pressLoopKey(ui,'a');assertLoopValues(ui,2,3,false);await completeIntervalKey(ui,'b',3);assertLoopValues(ui,2,3,false);const calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,'B',{shiftKey:true}).defaultPrevented,true);await flush();assert.equal(replayRequests(ui).length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('interval jumps require a valid pair, support sparse order and can start before the first replay',async()=>{
 const ui=await startUI({frameIndices:[4,9,20]}),e=ui.elements;assert.equal(e.result.hidden,true);configureLoop(ui,2,3,false);await completeIntervalKey(ui,'A',9);assertProgress(ui,2,3);await completeIntervalKey(ui,'B',20);assertProgress(ui,3,3);
 for(const [start,end] of [[2,2],[3,1],[0,3],[-1,3],[1,4],[1.5,3],['x',3]]){configureLoop(ui,start,end,false);const calls=ui.pending.length;for(const key of ['A','B'])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);assert.equal(ui.pending.length,calls);assert.equal(e['frames-list'].value,'20')}
 for(const frameIndices of [[],[7]]){const short=await startUI({frameIndices});for(const key of ['A','B'])assert.equal(pressBookmarkKey(short,key,{shiftKey:true}).defaultPrevented,false);assert.equal(replayRequests(short).length,0)}
});

test('Shift+A/B ignore note/search/native/custom/composed-path editors, IME, other modifiers, repeats, hidden pages, opt-out and modal focus',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);e.result.focus();const calls=ui.pending.length;
 const editors=[e['bookmark-note'],e['bookmark-search'],e['playback-speed'],e['loop-start'],e['loop-end'],e['frames-list'],e['replay-progress'],e.label];for(const role of ['textbox','searchbox','combobox','slider','spinbutton','listbox','grid','tablist']){const editor=new Element('div');editor.setAttribute('role',role);editors.push(editor)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const key of ['a','b','A','B']){
  for(const target of editors){assert.equal(pressBookmarkKey(ui,key,{target,shiftKey:true}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}
  e['bookmark-note'].focus();assert.equal(pressBookmarkKey(ui,key,{target:e.result,shiftKey:true}).defaultPrevented,false);e['bookmark-search'].focus();assert.equal(pressBookmarkKey(ui,key,{target:e.result,shiftKey:true}).defaultPrevented,false);e.result.focus();
  for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);
  ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;
 }
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');for(const key of ['a','b'])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e.result.getAttribute('aria-keyshortcuts'),'Home End PageUp PageDown Shift+A Shift+B');e['shortcut-help-open'].onclick();for(const key of ['A','B'])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target:e['shortcut-help-close']}).defaultPrevented,false);e['shortcut-help-close'].onclick();assertShownFrame(ui,2);assertLoopValues(ui,1,3,true);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('interval jumps pause and cancel pending autoplay fetch/decode, avoid boundary reloads and serialize manual requests',async()=>{
 for(const mode of ['fetch','decode','boundary']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);configureLoop(ui,1,3);e.result.focus();e['playback-play'].onclick();await ui.tick(0);
  if(mode!=='fetch'){ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush()}
  if(mode==='boundary'){const calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,'A',{shiftKey:true}).defaultPrevented,true);await flush();assert.equal(replayRequests(ui).length,calls);assertShownFrame(ui,1);assert.equal(e['playback-play'].disabled,false)}
  assert.equal(pressBookmarkKey(ui,'B',{shiftKey:true}).defaultPrevented,true);await flush();for(const key of ['A','B'])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);
  if(mode==='fetch')ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));else ui.decode('data:image/jpeg;base64,session-a-depth-2');await ui.tick(1000);assertShownFrame(ui,3);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');assert.equal(ui.cloudUpdates.length,2);assert.match(e['playback-status'].textContent,/Paused/);assertLoopValues(ui,1,3,true);
 }
});

test('failed interval jumps keep the complete snapshot and retry, stale Session jumps cannot commit, and help distinguishes mark/jump',async()=>{
 for(const failure of ['fetch','decode']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);const image=e.rgb,depth=e.depth;assert.equal(pressBookmarkKey(ui,'B',{shiftKey:true}).defaultPrevented,true);await flush();
  if(failure==='fetch')ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic failure'},false,404);else{ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();ui.decode('data:image/png;base64,session-a-3',Error('synthetic decode failure'));ui.decode('data:image/jpeg;base64,session-a-depth-3')}await flush();assertShownFrame(ui,2);assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.match(e.status.textContent,/Request failed/);await completeIntervalKey(ui,'B',3);assertShownFrame(ui,3);
 }
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);pressBookmarkKey(ui,'B',{shiftKey:true});await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();for(const key of ['A','B'])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);await finishFrames(ui,'session-b');await switched;await ui.decodeFrame('session-a',3);assert.equal(e.result.hidden,true);assert.equal(ui.cloudUpdates.length,1);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/data-i="shortcutHelpBounds"/);assert.match(html,/<kbd>Shift \+ A<\/kbd> \/ <kbd>Shift \+ B<\/kbd><\/dt><dd data-i="shortcutHelpLoopJump">/);assert.match(sessionsSource,/shortcutHelpLoopJump:"Pause and jump to the configured/);assert.match(sessionsSource,/shortcutHelpLoopJump:"暫停並跳到已設定的/);
});
