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
 showModal(){this.modalFocus=this.ownerDocument.activeElement;this.open=true;this.modalShows=(this.modalShows||0)+1;this.ownerDocument.getElementById(this.id==='bookmark-delete-dialog'?'bookmark-delete-cancel':'shortcut-help-close').focus();this.onModalShown?.()}
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
 const confirmations=[],pending=[],decoding=[],cloudUpdates=[],windowEvents={},documentEvents={},timers=new Map();let time=0,nextTimer=0,cloudError=null;
 let confirmAction=()=>true;
 elements['bookmark-delete-dialog'].onModalShown=()=>{const text=elements['bookmark-delete-prompt'].textContent;confirmations.push(text);const answer=confirmAction(text);if(answer===true)elements['bookmark-delete-confirm'].onclick();else if(answer===false)elements['bookmark-delete-cancel'].onclick()};
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
 return {elements,pending,decoding,cloudUpdates,respond,decode,decodeFrame,tick,document,dispatch,windowEvents,confirmations,setConfirm:action=>{confirmAction=action},failCloud:error=>{cloudError=error},
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
 assert.equal(e['bookmark-delete'].disabled,true);assert.equal(e['bookmark-note'].value,'x'.repeat(1001));assert.equal(bookmarkJumpButtons(ui).length,1);
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

test('bookmark shortcuts ignore unsupported modifiers, repeated, composing, prevented and unrelated key events',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]});await showFirst(ui);
 const calls=replayRequests(ui).length;
 for(const properties of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true,ctrlKey:true},{repeat:true},{isComposing:true},{keyCode:229}]){
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
 assert.equal(e['bookmark-mark'].getAttribute('aria-keyshortcuts'),'m Shift+m Shift+1 Shift+2 Shift+3 Shift+4');assert.equal(e['bookmark-shortcuts-enabled'].checked,true);
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
  for(const properties of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true,ctrlKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,properties).defaultPrevented,false,key+' '+JSON.stringify(properties));
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
 assert.equal(e['bookmark-mark'].getAttribute('aria-keyshortcuts'),'m Shift+m Shift+1 Shift+2 Shift+3 Shift+4');e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();
 assert.equal(e['bookmark-mark'].getAttribute('aria-keyshortcuts')||'','');for(const key of ['m','M'])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);
 assert.equal(ui.document.activeElement,null);e['bookmark-mark'].onclick();assert.equal(ui.document.activeElement,e['bookmark-note']);
 ui.document.activeElement=null;e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-mark'].getAttribute('aria-keyshortcuts'),'m Shift+m Shift+1 Shift+2 Shift+3 Shift+4');pressMarkKey(ui);
 assert.equal(ui.pending.length,requests);const fresh=await startUI();assert.equal(fresh.elements['bookmark-shortcuts-enabled'].checked,true);assert.equal(fresh.elements['bookmark-mark'].getAttribute('aria-keyshortcuts'),'m Shift+m Shift+1 Shift+2 Shift+3 Shift+4');
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
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');for(const key of ['Home','End','PageUp','PageDown'])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.ok(['Home','End','PageUp','PageDown','Shift+A','Shift+B'].every(key=>e.result.getAttribute('aria-keyshortcuts').split(' ').includes(key)));e['shortcut-help-open'].onclick();for(const key of ['Home','End','PageUp','PageDown'])assert.equal(pressBookmarkKey(ui,key,{target:e['shortcut-help-close']}).defaultPrevented,false);e['shortcut-help-close'].onclick();assertShownFrame(ui,2);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
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
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');for(const key of ['a','b'])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.ok(['Home','End','PageUp','PageDown','Shift+A','Shift+B'].every(key=>e.result.getAttribute('aria-keyshortcuts').split(' ').includes(key)));e['shortcut-help-open'].onclick();for(const key of ['A','B'])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target:e['shortcut-help-close']}).defaultPrevented,false);e['shortcut-help-close'].onclick();assertShownFrame(ui,2);assertLoopValues(ui,1,3,true);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
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

test('O toggles the existing overlay checkbox and exact-frame IDs while preserving paused review state without requests or writes',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(2,{note:'saved review',tags:['crossing']})]}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'saved review');editBookmark(ui,'synthetic overlay draft',['occlusion']);e['playback-speed'].value='.5';e['playback-speed'].onchange();e.result.focus();const image=e.rgb,depth=e.depth,calls=ui.pending.length,clouds=ui.cloudUpdates.length;
 assert.equal(e['overlay-enabled'].getAttribute('aria-keyshortcuts'),'o');assert.equal(pressBookmarkKey(ui,'o',{target:e.result}).defaultPrevented,true);assert.equal(e['overlay-enabled'].checked,false);assert.equal(e['tracking-overlay'].children.length,0);assert.match(e['overlay-status'].textContent,/hidden/);
 assert.equal(pressBookmarkKey(ui,'O',{target:e.result}).defaultPrevented,true);assert.equal(e['overlay-enabled'].checked,true);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.match(e['overlay-status'].textContent,/Tracked detections: 1.*#2/);
 assertShownFrame(ui,2);assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(ui.cloudUpdates.length,clouds);assert.match(e['playback-status'].textContent,/Paused.*0\.5×/);assertLoopValues(ui,1,3,true);assert.equal(e['bookmark-note'].value,'synthetic overlay draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'saved review');assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('O during autoplay or manual decode neither cancels nor duplicates loading and the new frame respects the display preference',async()=>{
 for(const mode of ['autoplay','manual']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);e.result.focus();let pending;
  if(mode==='autoplay'){e['playback-play'].onclick();await ui.tick(0)}else{e['frames-list'].value='2';pending=e.replay.onclick();await flush()}
  ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();const calls=replayRequests(ui).length;
  assert.equal(pressBookmarkKey(ui,'o',{target:e.result}).defaultPrevented,true);assert.equal(e['overlay-enabled'].checked,false);assert.equal(e['tracking-overlay'].children.length,0);assert.match(e['playback-status'].textContent,mode==='autoplay'?/Playing/:/Paused/);assert.equal(replayRequests(ui).length,calls);
  ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();if(pending)await pending;assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children.length,0);assert.match(e['overlay-status'].textContent,/hidden/);
  pressBookmarkKey(ui,'O',{target:e.result});assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(replayRequests(ui).length,calls);
  if(mode==='autoplay'){await ui.tick(199);assert.equal(replayRequests(ui).length,calls);await ui.tick(1);await completeReplay(ui,3);assertShownFrame(ui,3);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');e['playback-pause'].onclick()}
 }
});

test('O ignores editors, IME, modified/repeated/handled/hidden keys, shortcut opt-out, disabled checkbox and modal focus',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);e.result.focus();const calls=ui.pending.length;
 const editors=[e['bookmark-note'],e['bookmark-search'],e['overlay-enabled'],e['playback-speed'],e['loop-start'],e['frames-list'],e['replay-progress'],e.label];for(const role of ['textbox','searchbox','combobox','slider','spinbutton','listbox','grid','tablist']){const editor=new Element('div');editor.setAttribute('role',role);editors.push(editor)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const key of ['o','O']){
  for(const target of editors){assert.equal(pressBookmarkKey(ui,key,{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,key,{composedPath:()=>[child,target]}).defaultPrevented,false)}
  e['bookmark-note'].focus();assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);e['bookmark-search'].focus();assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);e.result.focus();
  for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,key,{defaultPrevented:true}).defaultPrevented,true);
  ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);ui.document.hidden=false;
 }
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['overlay-enabled'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'o').defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['overlay-enabled'].getAttribute('aria-keyshortcuts'),'o');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'o',{target:e['shortcut-help-close']}).defaultPrevented,false);e['shortcut-help-close'].onclick();e['overlay-enabled'].disabled=true;assert.equal(pressBookmarkKey(ui,'o',{target:e.result}).defaultPrevented,false);e['overlay-enabled'].disabled=false;
 assert.equal(e['overlay-enabled'].checked,true);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('enabling O never invents boxes for missing, unanalysed, mismatched or empty tracking reports',async()=>{
 const cases=[{delayTracking:true}, {trackingReport:report({frames:[]})}, {trackingReport:report({frames:[{...report().frames[0],snapshot_sha256:otherHash}]})}, {trackingReport:report({frames:[{...report().frames[0],objects:[]}]})}];
 for(const options of cases){
  const ui=await startUI(options),e=ui.elements;await showFirst(ui);e.result.focus();const calls=ui.pending.length;assert.equal(e['tracking-overlay'].children.length,0);const status=e['overlay-status'].textContent;
  assert.equal(pressBookmarkKey(ui,'o').defaultPrevented,true);assert.equal(e['tracking-overlay'].children.length,0);assert.match(e['overlay-status'].textContent,/hidden/);assert.equal(pressBookmarkKey(ui,'O').defaultPrevented,true);assert.equal(e['tracking-overlay'].children.length,0);assert.equal(e['overlay-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
 }
});

test('O can preselect overlays before replay, uses native checkbox behavior and updates bilingual status/help',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;assert.equal(e.result.hidden,true);const calls=ui.pending.length;assert.equal(pressBookmarkKey(ui,'o').defaultPrevented,true);assert.equal(e['overlay-enabled'].checked,false);assert.equal(ui.pending.length,calls);await showFirst(ui);assert.equal(e['tracking-overlay'].children.length,0);assert.match(e['overlay-status'].textContent,/hidden/);
 e.lang.value='zh-TW';e.lang.onchange();assert.match(e['overlay-status'].textContent,/已隱藏/);e['overlay-enabled'].checked=true;e['overlay-enabled'].onchange();assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.equal(pressBookmarkKey(ui,'o',{target:e['overlay-enabled']}).defaultPrevented,false);assert.equal(e['overlay-enabled'].checked,true);assert.equal(bookmarkWrites(ui).length,0);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>O<\/kbd><\/dt><dd data-i="shortcutHelpOverlay">/);assert.match(sessionsSource,/shortcutHelpOverlay:"Toggle tracking boxes and Object IDs/);assert.match(sessionsSource,/shortcutHelpOverlay:"切換追蹤框與 Object ID/);
});

test('F focuses and scrolls bookmark search while retaining the query and paused review state without requests or writes',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(2,{note:'saved review',tags:['crossing']})]}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'saved review');editBookmark(ui,'synthetic focus draft',['occlusion']);e['playback-speed'].value='.5';e['playback-speed'].onchange();e.result.focus();const image=e.rgb,depth=e.depth,calls=ui.pending.length,clouds=ui.cloudUpdates.length,filterStatus=e['bookmark-filter-status'].textContent;
 assert.equal(e['bookmark-search'].getAttribute('aria-keyshortcuts'),'f Escape 6');assert.equal(pressBookmarkKey(ui,'f',{target:e.result}).defaultPrevented,true);assert.equal(ui.document.activeElement,e['bookmark-search']);assert.equal(e['bookmark-search'].focusCalls.at(-1).preventScroll,true);assert.equal(e['bookmark-search'].scrollCalls.at(-1).block,'center');assert.equal(e['bookmark-search'].scrollCalls.at(-1).behavior,'auto');
 assert.equal(e['bookmark-search'].value,'saved review');assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-filter-status'].textContent,filterStatus);assert.equal(e['bookmark-note'].value,'synthetic focus draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assertLoopValues(ui,1,3,true);assertShownFrame(ui,2);assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(e['overlay-enabled'].checked,true);assert.match(e['playback-status'].textContent,/Paused.*0\.5×/);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
 e.result.focus();assert.equal(pressBookmarkKey(ui,'F',{target:e.result}).defaultPrevented,true);assert.equal(ui.document.activeElement,e['bookmark-search']);
});

test('F during autoplay or manual decode preserves loading and playback with focus staying in search',async()=>{
 for(const mode of ['autoplay','manual']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);e.result.focus();let pending;if(mode==='autoplay'){e['playback-play'].onclick();await ui.tick(0)}else{e['frames-list'].value='2';pending=e.replay.onclick();await flush()}
  ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();const calls=replayRequests(ui).length;
  assert.equal(pressBookmarkKey(ui,'f',{target:e.result}).defaultPrevented,true);assert.equal(ui.document.activeElement,e['bookmark-search']);assert.match(e['playback-status'].textContent,mode==='autoplay'?/Playing/:/Paused/);assert.equal(replayRequests(ui).length,calls);ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();if(pending)await pending;
  assertShownFrame(ui,2);assert.equal(ui.document.activeElement,e['bookmark-search']);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(replayRequests(ui).length,calls);
  if(mode==='autoplay'){await ui.tick(199);assert.equal(replayRequests(ui).length,calls);await ui.tick(1);await completeReplay(ui,3);assertShownFrame(ui,3);assert.equal(ui.document.activeElement,e['bookmark-search']);e['playback-pause'].onclick()}
 }
});

test('F ignores editors, IME, browser Find/modifiers, repeated/handled/hidden events, opt-out and modal focus',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e.result.focus();const calls=ui.pending.length,search=e['bookmark-search'];
 const editors=[e['bookmark-note'],search,e['playback-speed'],e['loop-start'],e['frames-list'],e['replay-progress'],e.label];for(const role of ['textbox','searchbox','combobox','slider','spinbutton','listbox','grid','tablist']){const editor=new Element('div');editor.setAttribute('role',role);editors.push(editor)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const key of ['f','F']){
  for(const target of editors){assert.equal(pressBookmarkKey(ui,key,{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,key,{composedPath:()=>[child,target]}).defaultPrevented,false)}
  e['bookmark-note'].focus();assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);search.focus();const focused=search.focusCalls.length;assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);assert.equal(search.focusCalls.length,focused);e.result.focus();
  for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,key,{defaultPrevented:true}).defaultPrevented,true);
  ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);ui.document.hidden=false;
 }
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(search.getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'f').defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(search.getAttribute('aria-keyshortcuts'),'f Escape 6');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'f',{target:e['shortcut-help-close']}).defaultPrevented,false);assert.equal(ui.document.activeElement,e['shortcut-help-close']);e['shortcut-help-close'].onclick();assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('F waits for enabled bookmark search, works without a replay, and is documented in both languages',async()=>{
 const waiting=await startUI({delayBookmarks:true}),w=waiting.elements;assert.equal(w['bookmark-search'].disabled,true);const calls=waiting.pending.length;assert.equal(pressBookmarkKey(waiting,'f').defaultPrevented,false);assert.equal(w['bookmark-search'].focusCalls,undefined);assert.equal(waiting.pending.length,calls);
 waiting.respond('/api/sessions/session-a/bookmarks',{detail:'synthetic unavailable'},false,404);await flush();assert.equal(w['bookmark-search'].disabled,true);assert.equal(pressBookmarkKey(waiting,'F').defaultPrevented,false);
 const ui=await startUI(),e=ui.elements;assert.equal(e.result.hidden,true);const readyCalls=ui.pending.length;assert.equal(pressBookmarkKey(ui,'F').defaultPrevented,true);assert.equal(ui.document.activeElement,e['bookmark-search']);assert.equal(e['bookmark-search'].value,'');assert.equal(e.result.hidden,true);assert.equal(ui.pending.length,readyCalls);assert.equal(bookmarkWrites(ui).length,0);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>F<\/kbd><\/dt><dd data-i="shortcutHelpSearch">/);assert.match(sessionsSource,/shortcutHelpSearch:"Focus and scroll to bookmark search/);assert.match(sessionsSource,/shortcutHelpSearch:"將焦點移到書籤搜尋欄/);
});

test('focusing bookmark search leaves pending seek, bookmark jump and explicit save intact',async()=>{
 for(const mode of ['seek','bookmark','write']){
  const ui=await startUI({bookmarks:[bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);e.result.focus();let pending;
  if(mode==='seek')pending=scrub(ui,2);else if(mode==='bookmark')pending=e['bookmark-next'].onclick();else{editBookmark(ui,'synthetic pending search-focus save');pending=e['bookmark-save'].onclick()}await flush();e.result.focus();const calls=ui.pending.length;
  assert.equal(pressBookmarkKey(ui,'f',{target:e.result}).defaultPrevented,true);assert.equal(ui.document.activeElement,e['bookmark-search']);assert.equal(ui.pending.length,calls);
  if(mode==='write'){ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{note:'synthetic pending search-focus save'})]));await pending;assert.equal(bookmarkWrites(ui).length,1);assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/)}else{await completeReplay(ui,mode==='seek'?2:3);await pending;assertShownFrame(ui,mode==='seek'?2:3)}
  assert.equal(ui.document.activeElement,e['bookmark-search']);assert.equal(e['bookmark-search'].value,'');
 }
});

function pressSearchEscape(ui,properties={}){const search=ui.elements['bookmark-search'];const event={key:'Escape',target:search,defaultPrevented:false,...properties,preventDefault(){this.defaultPrevented=true}};search.onkeydown?.(event);return event}

test('search Esc returns F focus to replay, preserving raw query, tag filter, matching bookmarks, drafts, exact images and settings',async()=>{
 const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(3,{note:'synthetic saved match',tags:['crossing']})]}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'  saved match  ');editBookmark(ui,'synthetic search exit draft',['occlusion']);e['playback-speed'].value='.5';e['playback-speed'].onchange();e.result.focus();pressBookmarkKey(ui,'f',{target:e.result});const calls=ui.pending.length,image=e.rgb,depth=e.depth,status=e['bookmark-filter-status'].textContent,list=e['bookmarks-list'].textContent;
 assert.equal(pressSearchEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);assert.equal(e['bookmark-search'].value,'  saved match  ');assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-filter-status'].textContent,status);assert.equal(e['bookmarks-list'].textContent,list);assert.equal(e['bookmark-note'].value,'synthetic search exit draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assertShownFrame(ui,2);assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.match(e['playback-status'].textContent,/Paused.*0\.5×/);assertLoopValues(ui,1,3,true);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
 await completeBookmarkKey(ui,']',3,{target:e.result});assertShownFrame(ui,3);assert.equal(pressBookmarkKey(ui,'f',{target:e.result}).defaultPrevented,true);assert.equal(ui.document.activeElement,e['bookmark-search']);assert.equal(e['bookmark-search'].value,'  saved match  ');pressSearchEscape(ui);await completeFrameKey(ui,'ArrowLeft',2);assert.equal(e['bookmark-note'].value,'synthetic search exit draft');
});

test('search Esc pauses pending autoplay and cancels seek/bookmark decode while keeping the previous complete frame and query',async()=>{
 for(const mode of ['autoplay','seek','bookmark']){
  const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);let pending;const index=mode==='autoplay'?2:3;
  if(mode==='autoplay'){e['playback-play'].onclick();await ui.tick(0)}else if(mode==='seek')pending=scrub(ui,index);else pending=e['bookmark-next'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/'+index+'/replay',replayResponse('session-a',index));await flush();ui.decode('data:image/png;base64,session-a-'+index);await flush();
  e.result.focus();assert.equal(pressBookmarkKey(ui,'f',{target:e.result}).defaultPrevented,true);const calls=ui.pending.length;assert.equal(pressSearchEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);ui.decode('data:image/jpeg;base64,session-a-depth-'+index);await flush();if(pending)await pending;await ui.tick(1000);
  assertShownFrame(ui,1);assert.equal(ui.cloudUpdates.length,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.equal(e['bookmark-search'].value,'');assert.equal(ui.pending.length,calls);assert.equal(e['playback-play'].disabled,false);assert.equal(bookmarkWrites(ui).length,0);
 }
});

test('search Esc does not steal Chinese IME cancellation, modifiers, repeated/handled/hidden events, other inputs, opt-out or dialog Esc',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);searchBookmarkNotes(ui,'中文選字條件');e['bookmark-search'].focus();const calls=ui.pending.length;
 for(const props of [{isComposing:true},{keyCode:229},{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true}])assert.equal(pressSearchEscape(ui,props).defaultPrevented,false);assert.equal(pressSearchEscape(ui,{defaultPrevented:true}).defaultPrevented,true);
 for(const key of ['Enter','f','EscapeOther'])assert.equal(pressSearchEscape(ui,{key}).defaultPrevented,false);assert.equal(pressSearchEscape(ui,{target:e['bookmark-note']}).defaultPrevented,false);e['bookmark-note'].focus();assert.equal(pressSearchEscape(ui).defaultPrevented,false);e['bookmark-search'].focus();
 ui.dispatch('compositionstart');assert.equal(pressSearchEscape(ui,{isComposing:false,keyCode:27}).defaultPrevented,false);assert.equal(ui.document.activeElement,e['bookmark-search']);ui.dispatch('compositionend');ui.hide();assert.equal(pressSearchEscape(ui).defaultPrevented,false);ui.document.hidden=false;
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-search'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressSearchEscape(ui).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-search'].getAttribute('aria-keyshortcuts'),'f Escape 6');e['bookmark-search'].disabled=true;assert.equal(pressSearchEscape(ui).defaultPrevented,false);e['bookmark-search'].disabled=false;
 e['shortcut-help-open'].onclick();ui.document.activeElement=e['bookmark-search'];assert.equal(pressSearchEscape(ui).defaultPrevented,false);ui.document.activeElement=e['shortcut-help-close'];assert.equal(pressBookmarkKey(ui,'Escape',{target:e['shortcut-help-close']}).defaultPrevented,false);e['shortcut-help-close'].onclick();
 assert.equal(e['bookmark-search'].value,'中文選字條件');assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);e['bookmark-search'].focus();ui.dispatch('compositionstart');ui.windowEvents.blur();assert.equal(pressSearchEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);
});

test('search Esc preserves conditions/focus without a valid displayed replay and does not cancel a cleared manual load',async()=>{
 const ui=await startUI(),e=ui.elements;searchBookmarkNotes(ui,'synthetic no-frame query');e['bookmark-search'].focus();let calls=ui.pending.length;assert.equal(pressSearchEscape(ui).defaultPrevented,true);assert.equal(ui.document.activeElement,e['bookmark-search']);assert.equal(e['bookmark-search'].value,'synthetic no-frame query');assert.equal(e.result.focusCalls,undefined);assert.equal(ui.pending.length,calls);
 const showing=e.replay.onclick();await flush();e['bookmark-search'].focus();calls=ui.pending.length;assert.equal(pressSearchEscape(ui).defaultPrevented,true);assert.equal(ui.pending.length,calls);await completeReplay(ui,1);await showing;assert.equal(ui.document.activeElement,e['bookmark-search']);assert.equal(pressSearchEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);
 const stale=await startUI(),s=stale.elements;const bad=s.replay.onclick();await flush();stale.respond('/api/sessions/session-a/frames/1/replay',{...replayResponse('session-a',1),snapshot_sha256:otherHash});await flush();await stale.decodeFrame('session-a',1);await bad;searchBookmarkNotes(stale,'synthetic stale query');s['bookmark-search'].focus();assert.equal(pressSearchEscape(stale).defaultPrevented,true);assert.equal(stale.document.activeElement,s['bookmark-search']);assert.equal(s['bookmark-search'].value,'synthetic stale query');assert.equal(s.result.focusCalls,undefined);
});

test('search Esc leaves an explicit save intact and returns only to the current Session snapshot',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);editBookmark(ui,'synthetic save while leaving search',['crossing']);const saving=e['bookmark-save'].onclick();await flush();searchBookmarkNotes(ui,'saved keyword');e['bookmark-search'].focus();const writes=bookmarkWrites(ui).length,calls=ui.pending.length;
 assert.equal(pressSearchEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);assert.equal(bookmarkWrites(ui).length,writes);assert.equal(ui.pending.length,calls);await finishNoteSave(ui,2,'synthetic save while leaving search',['crossing']);await saving;assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-search'].value,'saved keyword');assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/);
 e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();ui.document.activeElement=e['bookmark-search'];assert.equal(pressSearchEscape(ui).defaultPrevented,false);await finishFrames(ui,'session-b');await switched;searchBookmarkNotes(ui,'new Session query');e['bookmark-search'].focus();assert.equal(pressSearchEscape(ui).defaultPrevented,true);assert.equal(ui.document.activeElement,e['bookmark-search']);await showSaved(ui,1,{sid:'session-b'});e['bookmark-search'].focus();assert.equal(pressSearchEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);assert.equal(e.rgb.src,'data:image/png;base64,session-b-1');assert.equal(e['bookmark-search'].value,'new Session query');
});

test('search Esc cancels an uncommitted drag preview, preserves empty queries and has bilingual inline/panel help',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);e['replay-progress'].value='3';e['replay-progress'].oninput();e['bookmark-search'].focus();const calls=ui.pending.length;assert.equal(pressSearchEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);assertShownFrame(ui,2);assert.equal(e['bookmark-search'].value,'');assert.equal(ui.pending.length,calls);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<input id="bookmark-search"[^>]*aria-describedby="[^"]*bookmark-search-shortcut-help/);assert.match(html,/id="bookmark-search-shortcut-help"[^>]*data-i="bookmarkSearchShortcutHelp"/);assert.match(html,/data-i="shortcutHelpSearchEscape"/);assert.match(sessionsSource,/shortcutHelpSearchEscape:"Leave bookmark search/);assert.match(sessionsSource,/shortcutHelpSearchEscape:"離開書籤搜尋/);assert.match(sessionsSource,/bookmarkSearchShortcutHelp:"快捷鍵開啟時，Esc/);
});

test('C restores all bookmarks and navigation, focuses search and preserves paused snapshot, notes, drafts and settings',async()=>{
 const rows=[bookmarkRecord(1,{note:'alpha',tags:['crossing']}),bookmarkRecord(2,{note:'beta',tags:['occlusion']}),bookmarkRecord(3,{note:'gamma',tags:['crossing']})],ui=await startUI({trackingReport:trackedSequence(),bookmarks:rows}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);e['playback-speed'].value='.5';e['playback-speed'].onchange();editBookmark(ui,'synthetic clear-filter draft',['id-switch']);const image=e.rgb,depth=e.depth,calls=ui.pending.length,clouds=ui.cloudUpdates.length;
 assert.equal(e['bookmark-filter-clear'].getAttribute('aria-keyshortcuts'),'c');
 for(const [tag,query,key] of [['occlusion','beta','c'],['crossing','','C'],['all','  ','c'],['all','alpha','C'],['general','missing','c']]){
  filterBookmarkTag(ui,tag);searchBookmarkNotes(ui,query);e.result.focus();assert.equal(e['bookmark-filter-clear'].disabled,false);assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,true);assert.equal(e['bookmark-search'].value,'');assert.equal(e['bookmark-filter-tag'].value,'all');assert.deepEqual(visibleBookmarkIndices(ui),[1,2,3]);assertBookmarkCount(ui,3,3);assertBookmarkNav(ui,1,3);assert.equal(ui.document.activeElement,e['bookmark-search']);assert.equal(e['bookmark-filter-clear'].disabled,true);
 }
 assert.equal(e['bookmarks-list'].textContent.includes('alpha'),true);assert.equal(e['bookmarks-list'].textContent.includes('beta'),true);assert.equal(e['bookmark-note'].value,'synthetic clear-filter draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assertLoopValues(ui,1,3,true);assertShownFrame(ui,2);assert.equal(e.rgb,image);assert.equal(e.depth,depth);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.match(e['playback-status'].textContent,/Paused.*0\.5×/);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
 assert.equal(pressSearchEscape(ui).defaultPrevented,true);assertNoteReturnedToReplay(ui);await completeBookmarkKey(ui,']',3,{target:e.result});assertShownFrame(ui,3);
});

test('C leaves autoplay and manual seek/decode running without duplicate requests',async()=>{
 for(const mode of ['autoplay','seek']){
  const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1,{note:'match',tags:['crossing']}),bookmarkRecord(3,{note:'other'})]}),e=ui.elements;await showFirst(ui);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'match');e.result.focus();let pending;if(mode==='autoplay'){e['playback-play'].onclick();await ui.tick(0)}else pending=scrub(ui,2);await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();const calls=replayRequests(ui).length;
  assert.equal(pressBookmarkKey(ui,'c',{target:e.result}).defaultPrevented,true);assert.equal(ui.document.activeElement,e['bookmark-search']);assert.match(e['playback-status'].textContent,mode==='autoplay'?/Playing/:/Paused/);assert.equal(replayRequests(ui).length,calls);assert.deepEqual(visibleBookmarkIndices(ui),[1,3]);ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();if(pending)await pending;assertShownFrame(ui,2);assert.equal(ui.document.activeElement,e['bookmark-search']);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');
  if(mode==='autoplay'){await ui.tick(199);assert.equal(replayRequests(ui).length,calls);await ui.tick(1);await completeReplay(ui,3);assertShownFrame(ui,3);e['playback-pause'].onclick()}assert.equal(bookmarkWrites(ui).length,0);
 }
});

test('C shares the clear button pending-bookmark cancellation and leaves explicit saves intact',async()=>{
 for(const mode of ['bookmark','write']){
  const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1,{note:'match',tags:['crossing']}),bookmarkRecord(3,{note:'match',tags:['crossing']})]}),e=ui.elements;await showFirst(ui);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'match');let pending;
  if(mode==='bookmark'){pending=e['bookmark-next'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();ui.decode('data:image/png;base64,session-a-3');await flush()}else{editBookmark(ui,'synthetic clear during save',['occlusion']);pending=e['bookmark-save'].onclick();await flush()}
  e.result.focus();const calls=ui.pending.length;assert.equal(pressBookmarkKey(ui,'c',{target:e.result}).defaultPrevented,true);assert.equal(e['bookmark-search'].value,'');assert.equal(e['bookmark-filter-tag'].value,'all');assert.equal(ui.pending.length,calls);
  if(mode==='bookmark'){ui.decode('data:image/jpeg;base64,session-a-depth-3');await pending;assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.equal(bookmarkWrites(ui).length,0)}else{await finishNoteSave(ui,1,'synthetic clear during save',['occlusion']);await pending;assert.equal(bookmarkWrites(ui).length,1);assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/);assert.equal(e['bookmark-note'].value,'synthetic clear during save')}
  assert.equal(ui.document.activeElement,e['bookmark-search']);
 }
});

test('C ignores note/search/native/custom editors, IME, modified/repeated/handled/hidden keys, opt-out and the help modal',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(2,{note:'synthetic match',tags:['crossing']})]}),e=ui.elements;await showSaved(ui,2);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'match');e.result.focus();const calls=ui.pending.length;
 const editors=[e['bookmark-note'],e['bookmark-search'],e['playback-speed'],e['loop-start'],e['bookmark-filter-tag'],e['frames-list'],e['replay-progress'],e.label];for(const role of ['textbox','searchbox','combobox','slider','spinbutton','listbox','grid','tablist']){const editor=new Element('div');editor.setAttribute('role',role);editors.push(editor)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const key of ['c','C']){
  for(const target of editors){assert.equal(pressBookmarkKey(ui,key,{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,key,{composedPath:()=>[child,target]}).defaultPrevented,false)}
  e['bookmark-note'].focus();assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);e['bookmark-search'].focus();assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,key,{defaultPrevented:true}).defaultPrevented,true);
  ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);ui.document.hidden=false;
 }
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-filter-clear'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'c').defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-filter-clear'].getAttribute('aria-keyshortcuts'),'c');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'c',{target:e['shortcut-help-close']}).defaultPrevented,false);e['shortcut-help-close'].onclick();assert.equal(e['bookmark-search'].value,'match');assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('C only acts when Clear filters is enabled, supports no-replay/empty-bookmark pages and has bilingual help',async()=>{
 const waiting=await startUI({delayBookmarks:true}),w=waiting.elements;assert.equal(w['bookmark-filter-clear'].disabled,true);assert.equal(pressBookmarkKey(waiting,'c').defaultPrevented,false);waiting.respond('/api/sessions/session-a/bookmarks',{detail:'synthetic unavailable'},false,404);await flush();assert.equal(pressBookmarkKey(waiting,'c').defaultPrevented,false);
 const ui=await startUI(),e=ui.elements;assert.equal(e.result.hidden,true);assert.equal(pressBookmarkKey(ui,'c').defaultPrevented,false);searchBookmarkNotes(ui,'missing');assert.equal(e['bookmark-filter-clear'].disabled,false);const calls=ui.pending.length;assert.equal(pressBookmarkKey(ui,'C').defaultPrevented,true);assert.equal(e['bookmark-search'].value,'');assert.equal(e['bookmark-filter-tag'].value,'all');assertBookmarkCount(ui,0,0);assert.equal(ui.document.activeElement,e['bookmark-search']);e.result.focus();assert.equal(pressBookmarkKey(ui,'c').defaultPrevented,false);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>C<\/kbd><\/dt><dd data-i="shortcutHelpClearFilters">/);assert.match(sessionsSource,/shortcutHelpClearFilters:"Clear search and tag filters/);assert.match(sessionsSource,/shortcutHelpClearFilters:"清除搜尋文字與標籤篩選/);
});

test('1/2/3 select exact tag filters with retained literal query, focus, draft, snapshot and review state',async()=>{
 const rows=[bookmarkRecord(1,{note:'match',tags:['id-switch','occlusion']}),bookmarkRecord(2,{note:'other',tags:['occlusion']}),bookmarkRecord(3,{note:'match',tags:['crossing']})],ui=await startUI({bookmarks:rows,trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);editBookmark(ui,'synthetic numeric-filter draft',['crossing']);searchBookmarkNotes(ui,'  MATCH  ');e.result.focus();const calls=ui.pending.length,image=e.rgb,clouds=ui.cloudUpdates.length;
 for(const [key,tag,indices] of [['1','id-switch',[1]],['2','occlusion',[1]],['3','crossing',[3]]]){
  assert.equal(pressBookmarkKey(ui,key,{target:e.result,code:'Numpad'+key}).defaultPrevented,true);assert.equal(e['bookmark-filter-tag'].value,tag);assert.equal(e['bookmark-search'].value,'  MATCH  ');assert.deepEqual(visibleBookmarkIndices(ui),indices);assertBookmarkCount(ui,1,3);assert.equal(ui.document.activeElement,e.result);
 }
 assertBookmarkNav(ui,null,3);searchBookmarkNotes(ui,'absent');assert.equal(pressBookmarkKey(ui,'1',{target:e.result}).defaultPrevented,true);assert.deepEqual(visibleBookmarkIndices(ui),[]);assertBookmarkNav(ui,null,null);assert.equal(e['bookmark-note'].value,'synthetic numeric-filter draft');assert.equal(e['bookmark-tag-crossing'].checked,true);assertShownFrame(ui,2);assert.equal(e.rgb,image);assert.equal(ui.cloudUpdates.length,clouds);assertLoopValues(ui,1,3,true);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('tag digits ignore native/custom editors, active/composed inputs, IME, modifiers, repeats, opt-out and help',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1)]}),e=ui.elements;await showFirst(ui);e.result.focus();const calls=ui.pending.length,editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['playback-speed'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','spinbutton','slider','grid','listbox']){const node=new Element('div');node.setAttribute('role',role);editors.push(node)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const key of ['1','2','3','4','5','6']){
  for(const target of editors){assert.equal(pressBookmarkKey(ui,key,{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,key,{target:e.result,composedPath:()=>[child,target]}).defaultPrevented,false)}
  for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true,ctrlKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,{target:e.result,...props}).defaultPrevented,false);const handled=pressBookmarkKey(ui,key,{target:e.result,defaultPrevented:true});assert.equal(handled.defaultPrevented,true);
  ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);ui.document.hidden=false;
  e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-filter-tag'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,false);e['shortcut-help-close'].onclick();e.result.focus();assert.equal(e['bookmark-filter-tag'].value,'all');
 }
 assert.equal(e['bookmark-filter-tag'].getAttribute('aria-keyshortcuts'),'1 2 3 4 5');assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
});

test('tag digits retain autoplay and in-flight manual frame presentation without duplicate fetches',async()=>{
 for(const mode of ['autoplay','seek']){
  const ui=await startUI({bookmarks:[bookmarkRecord(1,{tags:['crossing']})],trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);e.result.focus();let pending;if(mode==='autoplay'){e['playback-play'].onclick();await ui.tick(0)}else pending=scrub(ui,2);await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();const calls=replayRequests(ui).length;
  for(const key of ['1','2','3','4','5','6'])assert.equal(pressBookmarkKey(ui,key,{target:e.result}).defaultPrevented,true);assert.equal(replayRequests(ui).length,calls);assert.equal(ui.document.activeElement,e.result);assert.match(e['playback-status'].textContent,mode==='autoplay'?/Playing/:/Paused/);ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();if(pending)await pending;assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');if(mode==='autoplay'){await ui.tick(200);await completeReplay(ui,3);assertShownFrame(ui,3);e['playback-pause'].onclick()}assert.equal(bookmarkWrites(ui).length,0);
 }
});

test('changed tag cancels pending bookmark jump, same tag retains it, and explicit save completes',async()=>{
 for(const mode of ['changed','same','save']){
  const ui=await startUI({bookmarks:[bookmarkRecord(1,{tags:['crossing']}),bookmarkRecord(3,{tags:['crossing']})]}),e=ui.elements;await showFirst(ui);filterBookmarkTag(ui,'crossing');let pending;
  if(mode==='save'){editBookmark(ui,'synthetic numeric save',['occlusion']);pending=e['bookmark-save'].onclick();await flush()}else{pending=e['bookmark-next'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();ui.decode('data:image/png;base64,session-a-3');await flush()}
  e.result.focus();const calls=ui.pending.length;assert.equal(pressBookmarkKey(ui,mode==='same'?'3':'5',{target:e.result}).defaultPrevented,true);assert.equal(ui.pending.length,calls);assert.equal(ui.document.activeElement,e.result);
  if(mode==='save'){await finishNoteSave(ui,1,'synthetic numeric save',['occlusion']);await pending;assert.equal(bookmarkWrites(ui).length,1);assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/)}else{ui.decode('data:image/jpeg;base64,session-a-depth-3');await pending;assertShownFrame(ui,mode==='same'?3:1);assert.equal(bookmarkWrites(ui).length,0)}
 }
});

test('tag digits require loaded bookmarks but support empty/no-replay pages, with bilingual help and metadata',async()=>{
 const waiting=await startUI({delayBookmarks:true}),w=waiting.elements;for(const key of ['1','2','3','4','5','6'])assert.equal(pressBookmarkKey(waiting,key).defaultPrevented,false);waiting.respond('/api/sessions/session-a/bookmarks',{detail:'synthetic unavailable'},false,404);await flush();assert.equal(w['bookmark-filter-tag'].disabled,true);assert.equal(pressBookmarkKey(waiting,'5').defaultPrevented,false);
 const ui=await startUI(),e=ui.elements;assert.equal(e.result.hidden,true);const calls=ui.pending.length;for(const key of ['1','2','3','4','5','6']){assert.equal(pressBookmarkKey(ui,key).defaultPrevented,true);assertBookmarkCount(ui,0,0)}assert.equal(e['bookmark-filter-tag'].value,'all');assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>1<\/kbd> \/ <kbd>2<\/kbd> \/ <kbd>3<\/kbd> \/ <kbd>4<\/kbd><\/dt><dd data-i="shortcutHelpTagFilters">/);assert.match(sessionsSource,/shortcutHelpTagFilters:"1: suspected ID switch · 2: occlusion · 3: object crossing · 4: general bookmark/);assert.match(sessionsSource,/shortcutHelpTagFilters:"1：疑似換 ID · 2：遮擋 · 3：物件交會 · 4：一般書籤/);
});

test('4 filters only untagged bookmarks with retained query and navigates the matching frames',async()=>{
 const rows=[bookmarkRecord(1,{note:'match',tags:[]}),bookmarkRecord(2,{note:'match',tags:['id-switch','occlusion','crossing']}),bookmarkRecord(3,{note:'MATCH',tags:[]})],ui=await startUI({bookmarks:rows,trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);editBookmark(ui,'synthetic general-filter draft',['crossing']);searchBookmarkNotes(ui,'  match  ');filterBookmarkTag(ui,'occlusion');e.result.focus();const calls=ui.pending.length;
 assert.equal(pressBookmarkKey(ui,'4',{target:e.result,code:'Digit4'}).defaultPrevented,true);assert.equal(e['bookmark-filter-tag'].value,'general');assert.equal(e['bookmark-search'].value,'  match  ');assert.deepEqual(visibleBookmarkIndices(ui),[1,3]);assertBookmarkCount(ui,2,3);assertBookmarkNav(ui,1,3);assert.equal(ui.document.activeElement,e.result);assertShownFrame(ui,2);assert.equal(e['bookmark-note'].value,'synthetic general-filter draft');assertLoopValues(ui,1,3,true);assert.equal(ui.pending.length,calls);
 await completeBookmarkKey(ui,']',3,{target:e.result});assertShownFrame(ui,3);assertBookmarkNav(ui,1,null);assert.equal(pressBookmarkKey(ui,'4',{target:e.result,code:'Numpad4'}).defaultPrevented,true);assert.deepEqual(visibleBookmarkIndices(ui),[1,3]);await completeBookmarkKey(ui,'[',1,{target:e.result});assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');searchBookmarkNotes(ui,'no match');assert.equal(pressBookmarkKey(ui,'4',{target:e.result}).defaultPrevented,true);assert.deepEqual(visibleBookmarkIndices(ui),[]);assertBookmarkCount(ui,0,3);assertBookmarkNav(ui,null,null);assert.equal(bookmarkWrites(ui).length,0);
});

test('5 returns to all tags while retaining the raw query, matching navigation, draft and replay state',async()=>{
 const rows=[bookmarkRecord(1,{note:'match',tags:[]}),bookmarkRecord(2,{note:'MATCH',tags:['occlusion']}),bookmarkRecord(3,{note:'other',tags:['crossing']})],ui=await startUI({bookmarks:rows,trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);editBookmark(ui,'synthetic all-tags draft',['crossing']);searchBookmarkNotes(ui,'  match  ');filterBookmarkTag(ui,'general');e.result.focus();const calls=ui.pending.length;
 assert.deepEqual(visibleBookmarkIndices(ui),[1]);assert.equal(pressBookmarkKey(ui,'5',{target:e.result,code:'Digit5'}).defaultPrevented,true);assert.equal(e['bookmark-filter-tag'].value,'all');assert.equal(e['bookmark-search'].value,'  match  ');assert.deepEqual(visibleBookmarkIndices(ui),[1,2]);assertBookmarkCount(ui,2,3);assertBookmarkNav(ui,1,null);assert.equal(ui.document.activeElement,e.result);assertShownFrame(ui,2);assert.equal(e['bookmark-note'].value,'synthetic all-tags draft');assertLoopValues(ui,1,3,true);assert.equal(ui.pending.length,calls);assert.match(e['playback-status'].textContent,/Paused/);
 await completeBookmarkKey(ui,'[',1,{target:e.result});assertShownFrame(ui,1);assertBookmarkNav(ui,null,2);const jump=e['bookmark-next'].onclick();await flush();const pending=ui.pending.length;assert.equal(pressBookmarkKey(ui,'5',{target:e.result,code:'Numpad5'}).defaultPrevented,true);assert.equal(ui.pending.length,pending);await completeReplay(ui,2);await jump;assertShownFrame(ui,2);assert.equal(e['bookmark-search'].value,'  match  ');assert.equal(e['bookmark-note'].value,'synthetic all-tags draft');assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');
 searchBookmarkNotes(ui,'no match');filterBookmarkTag(ui,'occlusion');assert.equal(pressBookmarkKey(ui,'5',{target:e.result}).defaultPrevented,true);assert.equal(e['bookmark-search'].value,'no match');assert.deepEqual(visibleBookmarkIndices(ui),[]);searchBookmarkNotes(ui,'');filterBookmarkTag(ui,'general');assert.equal(pressBookmarkKey(ui,'5',{target:e.result}).defaultPrevented,true);assert.deepEqual(visibleBookmarkIndices(ui),[1,2,3]);assert.equal(bookmarkWrites(ui).length,0);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>5<\/kbd><\/dt><dd data-i="shortcutHelpAllTags">/);assert.match(sessionsSource,/shortcutHelpAllTags:"Show all tags, keeping search text/);assert.match(sessionsSource,/shortcutHelpAllTags:"切回全部標籤，保留搜尋文字/);
});

test('6 clears only the raw search query across tags while retaining focus, drafts and replay settings',async()=>{
 const rows=[bookmarkRecord(1,{note:'match',tags:['crossing']}),bookmarkRecord(2,{note:'other',tags:['crossing','occlusion']}),bookmarkRecord(3,{note:'match',tags:[]})],ui=await startUI({bookmarks:rows,trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);editBookmark(ui,'synthetic clear-query draft',['id-switch']);e.result.focus();const calls=ui.pending.length;
 for(const [tag,indices] of [['crossing',[1,2]],['occlusion',[2]],['general',[3]],['id-switch',[]],['all',[1,2,3]]]){
  filterBookmarkTag(ui,tag);searchBookmarkNotes(ui,'  no match  ');assert.equal(pressBookmarkKey(ui,'6',{target:e.result,code:'Digit6'}).defaultPrevented,true);assert.equal(e['bookmark-filter-tag'].value,tag);assert.equal(e['bookmark-search'].value,'');assert.deepEqual(visibleBookmarkIndices(ui),indices);assertBookmarkCount(ui,indices.length,3);assert.equal(ui.document.activeElement,e.result);assert.equal(pressBookmarkKey(ui,'6',{target:e.result,code:'Numpad6'}).defaultPrevented,true);
 }
 filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'   ');assert.equal(pressBookmarkKey(ui,'6',{target:e.result}).defaultPrevented,true);assert.equal(e['bookmark-search'].value,'');assert.equal(e['bookmark-filter-tag'].value,'crossing');assertBookmarkNav(ui,1,null);assertShownFrame(ui,2);assertLoopValues(ui,1,3,true);assert.equal(e['bookmark-note'].value,'synthetic clear-query draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.pending.length,calls);assert.equal(bookmarkWrites(ui).length,0);await completeBookmarkKey(ui,'[',1,{target:e.result});assertShownFrame(ui,1);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>6<\/kbd><\/dt><dd data-i="shortcutHelpClearQuery">/);assert.match(sessionsSource,/shortcutHelpClearQuery:"Clear bookmark search text, keeping the tag filter/);assert.match(sessionsSource,/shortcutHelpClearQuery:"只清除書籤搜尋文字，保留標籤篩選/);
});

test('6 preserves pending autoplay/manual decode, shown IDs and playback cadence',async()=>{
 for(const mode of ['autoplay','seek']){
  const ui=await startUI({trackingReport:trackedSequence(),bookmarks:[bookmarkRecord(1,{note:'match',tags:['crossing']})]}),e=ui.elements;await showFirst(ui);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'match');e.result.focus();let pending;if(mode==='autoplay'){e['playback-play'].onclick();await ui.tick(0)}else pending=scrub(ui,2);await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();const calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,'6',{target:e.result}).defaultPrevented,true);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'');assert.equal(ui.document.activeElement,e.result);assert.match(e['playback-status'].textContent,mode==='autoplay'?/Playing/:/Paused/);assert.equal(replayRequests(ui).length,calls);ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();if(pending)await pending;assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');if(mode==='autoplay'){await ui.tick(200);await completeReplay(ui,3);assertShownFrame(ui,3);e['playback-pause'].onclick()}assert.equal(bookmarkWrites(ui).length,0);
 }
});

test('6 cancels a pending bookmark jump only for a changed query and preserves explicit saves',async()=>{
 for(const mode of ['changed','empty','save']){
  const ui=await startUI({bookmarks:[bookmarkRecord(1,{note:'match',tags:['crossing']}),bookmarkRecord(3,{note:'match',tags:['crossing']})]}),e=ui.elements;await showFirst(ui);filterBookmarkTag(ui,'crossing');if(mode!=='empty')searchBookmarkNotes(ui,'match');let pending;
  if(mode==='save'){editBookmark(ui,'synthetic clear-query save',['occlusion']);pending=e['bookmark-save'].onclick();await flush()}else{pending=e['bookmark-next'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();ui.decode('data:image/png;base64,session-a-3');await flush()}
  e.result.focus();const calls=ui.pending.length;assert.equal(pressBookmarkKey(ui,'6',{target:e.result}).defaultPrevented,true);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'');assert.equal(ui.document.activeElement,e.result);assert.equal(ui.pending.length,calls);
  if(mode==='save'){await finishNoteSave(ui,1,'synthetic clear-query save',['occlusion']);await pending;assert.equal(bookmarkWrites(ui).length,1);assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/)}else{ui.decode('data:image/jpeg;base64,session-a-depth-3');await pending;assertShownFrame(ui,mode==='empty'?3:1);assert.equal(bookmarkWrites(ui).length,0)}
 }
});

test('Shift bracket endpoints use combined filters, retaining drafts/settings and exact displayed IDs',async()=>{
 const rows=[bookmarkRecord(1,{note:'review',tags:['crossing']}),bookmarkRecord(2,{note:'review',tags:['occlusion']}),bookmarkRecord(3,{note:'ＲＥＶＩＥＷ',tags:['crossing']})],ui=await startUI({bookmarks:rows,trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,2);editBookmark(ui,'synthetic endpoint draft',['id-switch']);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'  review  ');e.result.focus();
 for(const [key,index] of [['}',3],['{',1],[']',3],['[',1]]){await completeBookmarkKey(ui,key,index,{shiftKey:true,target:e.result});assertShownFrame(ui,index);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-000'+index);assert.equal(e['bookmark-search'].value,'  review  ');assert.equal(e['bookmark-filter-tag'].value,'crossing');assertLoopValues(ui,1,2,true);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result)}
 filterBookmarkTag(ui,'occlusion');await completeBookmarkKey(ui,']',2,{shiftKey:true,target:e.result});assert.equal(e['bookmark-note'].value,'synthetic endpoint draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(bookmarkWrites(ui).length,0);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>Shift\+\[<\/kbd> \/ <kbd>Shift\+\]<\/kbd><\/dt><dd data-i="shortcutHelpBookmarkEdges">/);assert.match(sessionsSource,/shortcutHelpBookmarkEdges:"Pause and jump to the first \/ last bookmark/);assert.match(sessionsSource,/shortcutHelpBookmarkEdges:"暫停並跳到目前標籤與搜尋篩選/);
});

test('Shift bracket endpoints support sparse order, no prior replay and single matches but ignore empty/unavailable results',async()=>{
 const ui=await startUI({frameIndices:[10,30,90],bookmarks:[bookmarkRecord(90),bookmarkRecord(10)]}),e=ui.elements;assert.equal(e.result.hidden,true);await completeFrameKey(ui,'}',90,{event:{shiftKey:true},total:3});assert.equal(e['frames-list'].value,'90');assertProgress(ui,3,3);await completeFrameKey(ui,'{',10,{event:{shiftKey:true},total:3});assertProgress(ui,1,3);searchBookmarkNotes(ui,'missing');const calls=ui.pending.length;for(const key of ['{','}'])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);assert.equal(ui.pending.length,calls);
 const one=await startUI({bookmarks:[bookmarkRecord(2)]});for(const key of ['{','}']){await completeBookmarkKey(one,key,2,{shiftKey:true});assertShownFrame(one,2)}const empty=await startUI();for(const key of ['{','}'])assert.equal(pressBookmarkKey(empty,key,{shiftKey:true}).defaultPrevented,false);
 const waiting=await startUI({delayBookmarks:true});for(const key of ['{','}'])assert.equal(pressBookmarkKey(waiting,key,{shiftKey:true}).defaultPrevented,false);waiting.respond('/api/sessions/session-a/bookmarks',{detail:'synthetic unavailable'},false,404);await flush();assert.equal(pressBookmarkKey(waiting,'}',{shiftKey:true}).defaultPrevented,false);
});

test('Shift bracket endpoints ignore note/search/custom editors, IME, modifiers, opt-out and help',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showSaved(ui,2);e.result.focus();const calls=ui.pending.length,editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['playback-speed'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','spinbutton','slider','grid','listbox']){const n=new Element('div');n.setAttribute('role',role);editors.push(n)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const key of ['[',']','{','}']){
  for(const target of editors){assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target:e.result,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target:e.result,...props}).defaultPrevented,false);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target:e.result}).defaultPrevented,false);e['shortcut-help-close'].onclick();e.result.focus();
 }assert.equal(ui.pending.length,calls);assertShownFrame(ui,2);assert.equal(bookmarkWrites(ui).length,0);
});

test('Shift bracket endpoints cancel pending autoplay and seek decoding before exact bookmark presentation',async()=>{
 for(const mode of ['autoplay','seek']){
  const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)],trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);let pending;if(mode==='autoplay'){e['playback-play'].onclick();await ui.tick(0)}else pending=scrub(ui,2);await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();await completeBookmarkKey(ui,'}',3,{shiftKey:true});ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();if(pending)await pending;assertShownFrame(ui,3);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0003');assert.match(e['playback-status'].textContent,/Paused/);assert.equal(bookmarkWrites(ui).length,0);
 }
});

test('Shift bracket endpoints serialize pending bookmark jumps and preserve explicit saves',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);assert.equal(pressBookmarkKey(ui,'}',{shiftKey:true}).defaultPrevented,true);await flush();const calls=ui.pending.length;for(const key of ['{','}'])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);assert.equal(ui.pending.length,calls);await completeReplay(ui,3);await flush();assertShownFrame(ui,3);editBookmark(ui,'synthetic endpoint save',['crossing']);const saving=e['bookmark-save'].onclick();await flush();for(const key of ['{','}'])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);await finishNoteSave(ui,3,'synthetic endpoint save',['crossing']);await saving;assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/);assertShownFrame(ui,3);assert.equal(bookmarkWrites(ui).length,1);
});

test('Shift bracket endpoint failure retains snapshot and Session switch invalidates stale decoding',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)],trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);assert.equal(pressBookmarkKey(ui,'}',{shiftKey:true}).defaultPrevented,true);await flush();ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);await flush();assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.equal(pressBookmarkKey(ui,'}',{shiftKey:true}).defaultPrevented,true);await flush();ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();assert.equal(pressBookmarkKey(ui,'{',{shiftKey:true}).defaultPrevented,false);await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2)]);await switched;await ui.decodeFrame('session-a',3);await flush();assert.equal(e.result.hidden,true);assert.equal(pressBookmarkKey(ui,'}',{shiftKey:true}).defaultPrevented,true);await flush();await completeReplay(ui,2,{sid:'session-b'});await flush();assert.equal(e.rgb.src,'data:image/png;base64,session-b-2');assert.equal(bookmarkWrites(ui).length,0);
});

async function finishQuickSave(ui,index,note='',tags=[]){
 const write=bookmarkWrites(ui).at(-1);assert.equal(write.url,'/api/sessions/session-a/frames/'+index+'/bookmark');assert.equal(write.opt.method,'PUT');assert.deepEqual(JSON.parse(write.opt.body),{snapshot_sha256:hash,note:'',tags:[],create_only:true});ui.respond(write.url,bookmarkResponse('session-a',[bookmarkRecord(index,{note,tags})]));await flush();return write;
}

test('Shift M creates an empty general bookmark for the shown snapshot without focusing the editor',async()=>{
 const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'retained query');e.result.focus();const calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();const writes=bookmarkWrites(ui);assert.equal(writes.length,1);assert.deepEqual(JSON.parse(writes[0].opt.body),{snapshot_sha256:hash,note:'',tags:[],create_only:true});assert.match(writes[0].url,/frames\/2\/bookmark$/);await finishQuickSave(ui,2,'',[]);assert.equal(ui.document.activeElement,e.result);assertShownFrame(ui,2);assert.equal(e['bookmark-note'].value,'');assert.equal(e['bookmark-tag-crossing'].checked,false);assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/);assertLoopValues(ui,1,3,true);assert.equal(e['bookmark-search'].value,'retained query');assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(replayRequests(ui).length,calls);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.match(e['playback-status'].textContent,/Paused/);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/data-i="shortcutHelpQuickMark"/);assert.match(sessionsSource,/shortcutHelpQuickMark:"Pause and save a general bookmark/);assert.match(sessionsSource,/shortcutHelpQuickMark:"暫停並將目前顯示影格存成一般書籤/);assert.equal(e['bookmark-mark'].getAttribute('aria-keyshortcuts'),'m Shift+m Shift+1 Shift+2 Shift+3 Shift+4');
});

test('Shift M preserves server-side saved notes/tags and leaves unsaved or invalid drafts separate',async()=>{
 for(const draft of [null,'synthetic retained draft','x'.repeat(1001)]){
  const ui=await startUI({bookmarks:[bookmarkRecord(2,{note:'old visible note',tags:['occlusion']})]}),e=ui.elements;await showSaved(ui,2);if(draft!==null)editBookmark(ui,draft,['crossing']);e.result.focus();assert.equal(pressBookmarkKey(ui,'m',{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();assert.equal(JSON.parse(bookmarkWrites(ui)[0].opt.body).create_only,true);await finishQuickSave(ui,2,'synthetic other-page update',['id-switch']);assert.equal(e['bookmark-note'].value,draft??'synthetic other-page update');assert.equal(e['bookmark-tag-crossing'].checked,draft!==null);assert.equal(e['bookmark-tag-id-switch'].checked,draft===null);assert.equal(ui.document.activeElement,e.result);if(draft!==null)assert.match(e['bookmark-editor-status'].textContent,draft.length>1000?/1000/:/Unsaved/);assert.equal(bookmarkWrites(ui).length,1);
 }
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);editBookmark(ui,'new-frame draft',['crossing']);e.result.focus();pressBookmarkKey(ui,'M',{shiftKey:true,target:e.result});await flush();await finishQuickSave(ui,2,'',[]);assert.equal(e['bookmark-note'].value,'new-frame draft');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.match(e['bookmark-editor-status'].textContent,/Unsaved/);
});

test('Shift M cancels pending playback/seek and saves the last complete displayed snapshot',async()=>{
 for(const mode of ['autoplay','seek']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);let pending;if(mode==='autoplay'){e['playback-play'].onclick();await ui.tick(0)}else pending=scrub(ui,2);await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();assert.match(bookmarkWrites(ui)[0].url,/frames\/1\/bookmark$/);ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();if(pending)await pending;await finishQuickSave(ui,1,'',[]);assertShownFrame(ui,1);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');
 }
});

test('Shift M ignores editors, IME, modifiers, opt-out/modal and unavailable or busy bookmarks',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showSaved(ui,2);e.result.focus();const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','slider','grid']){const n=new Element('div');n.setAttribute('role',role);editors.push(n)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true,...props}).defaultPrevented,false);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true,target:e.result}).defaultPrevented,false);e['shortcut-help-close'].onclick();assert.equal(bookmarkWrites(ui).length,0);
 assert.equal(pressBookmarkKey(ui,'}',{shiftKey:true}).defaultPrevented,true);await flush();assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);await flush();e.result.focus();assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true}).defaultPrevented,true);await flush();assert.equal(pressBookmarkKey(ui,'M',{shiftKey:true}).defaultPrevented,false);await finishQuickSave(ui,3,'',[]);assert.equal(bookmarkWrites(ui).length,1);const empty=await startUI();assert.equal(pressBookmarkKey(empty,'M',{shiftKey:true}).defaultPrevented,false);const waiting=await startUI({delayBookmarks:true});await showFirst(waiting);assert.equal(pressBookmarkKey(waiting,'M',{shiftKey:true}).defaultPrevented,false);
});

test('Shift M failure keeps drafts and stale Session replies cannot overwrite the new editor',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);editBookmark(ui,'synthetic retry draft',['crossing']);e.result.focus();pressBookmarkKey(ui,'M',{shiftKey:true});await flush();ui.respond('/api/sessions/session-a/frames/2/bookmark',{detail:'synthetic unavailable'},false,409);await flush();assert.equal(e['bookmark-note'].value,'synthetic retry draft');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.match(e['bookmarks-status'].textContent,/failed/i);pressBookmarkKey(ui,'M',{shiftKey:true});await flush();e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b');await switched;ui.respond('/api/sessions/session-a/frames/2/bookmark',bookmarkResponse('session-a',[bookmarkRecord(2)]));await flush();assert.equal(e.result.hidden,true);await showSaved(ui,1,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'');assert.equal(bookmarkWrites(ui).length,2);
});

async function finishQuickTag(ui,index,tag,{note='',tags=[tag]}={}){
 const write=bookmarkWrites(ui).at(-1);assert.equal(write.url,'/api/sessions/session-a/frames/'+index+'/bookmark');assert.equal(write.opt.method,'PUT');assert.deepEqual(JSON.parse(write.opt.body),{snapshot_sha256:hash,note:'',tags:[],add_tag:tag});ui.respond(write.url,bookmarkResponse('session-a',[bookmarkRecord(index,{note,tags})]));await flush();
}

test('Shift digits and shifted symbols save the shown snapshot with the exact selected tag and retained review state',async()=>{
 for(const [key,tag] of [['1','id-switch'],['!','id-switch'],['2','occlusion'],['@','occlusion'],['3','crossing'],['#','crossing']]){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'retained query');e.result.focus();const calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();await finishQuickTag(ui,2,tag);assert.equal(e['bookmark-note'].value,'');assert.equal(e['bookmark-tag-'+tag].checked,true);assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/);assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-search'].value,'retained query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,3,true);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(replayRequests(ui).length,calls);assert.equal(bookmarkWrites(ui).length,1);
 }
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/data-i="shortcutHelpQuickTags"/);assert.match(sessionsSource,/shortcutHelpQuickTags:"Shift\+1: suspected ID switch/);assert.match(sessionsSource,/shortcutHelpQuickTags:"Shift＋1：疑似換 ID/);
});

test('quick tags accept authoritative merged saved notes/tags while preserving unsaved and invalid drafts',async()=>{
 for(const draft of [null,'synthetic tag draft','x'.repeat(1001)]){
  const ui=await startUI({bookmarks:[bookmarkRecord(2,{note:'old visible note',tags:['occlusion']})]}),e=ui.elements;await showSaved(ui,2);if(draft!==null)editBookmark(ui,draft,['id-switch']);e.result.focus();assert.equal(pressBookmarkKey(ui,'#',{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();await finishQuickTag(ui,2,'crossing',{note:'synthetic external note',tags:['id-switch','occlusion','crossing']});assert.equal(e['bookmark-note'].value,draft??'synthetic external note');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-tag-occlusion'].checked,draft===null);assert.equal(e['bookmark-tag-crossing'].checked,draft===null);assert.equal(ui.document.activeElement,e.result);if(draft!==null)assert.match(e['bookmark-editor-status'].textContent,draft.length>1000?/1000/:/Unsaved/);assert.equal(bookmarkWrites(ui).length,1);
 }
});

test('quick tags cancel autoplay/manual decoding and save only the last fully displayed snapshot',async()=>{
 for(const mode of ['autoplay','seek']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);let pending;if(mode==='autoplay'){e['playback-play'].onclick();await ui.tick(0)}else pending=scrub(ui,2);await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();assert.equal(pressBookmarkKey(ui,'@',{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();if(pending)await pending;await finishQuickTag(ui,1,'occlusion');assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.match(e['playback-status'].textContent,/Paused/);
 }
});

test('quick tags ignore editors, IME, modifiers, opt-out/modal and unavailable/busy snapshots',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showSaved(ui,2);e.result.focus();const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','slider','grid']){const n=new Element('div');n.setAttribute('role',role);editors.push(n)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const key of ['1','2','3','!','@','#']){
  for(const target of editors){assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,...props}).defaultPrevented,false);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target:e.result}).defaultPrevented,false);e['shortcut-help-close'].onclick();e.result.focus();
 }assert.equal(bookmarkWrites(ui).length,0);for(const key of ['!','@','#'])assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'}',{shiftKey:true}).defaultPrevented,true);await flush();assert.equal(pressBookmarkKey(ui,'!',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);await flush();e.result.focus();assert.equal(pressBookmarkKey(ui,'!',{shiftKey:true}).defaultPrevented,true);await flush();assert.equal(pressBookmarkKey(ui,'@',{shiftKey:true}).defaultPrevented,false);await finishQuickTag(ui,3,'id-switch');assert.equal(bookmarkWrites(ui).length,1);const empty=await startUI();assert.equal(pressBookmarkKey(empty,'!',{shiftKey:true}).defaultPrevented,false);const waiting=await startUI({delayBookmarks:true});await showFirst(waiting);assert.equal(pressBookmarkKey(waiting,'#',{shiftKey:true}).defaultPrevented,false);
});

test('quick tag failure retains drafts and stale Session replies cannot replace another editor',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);editBookmark(ui,'synthetic tag retry',['crossing']);e.result.focus();pressBookmarkKey(ui,'!',{shiftKey:true});await flush();ui.respond('/api/sessions/session-a/frames/2/bookmark',{detail:'synthetic unavailable'},false,409);await flush();assert.equal(e['bookmark-note'].value,'synthetic tag retry');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.match(e['bookmarks-status'].textContent,/failed/i);pressBookmarkKey(ui,'!',{shiftKey:true});await flush();e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b');await switched;ui.respond('/api/sessions/session-a/frames/2/bookmark',bookmarkResponse('session-a',[bookmarkRecord(2,{tags:['id-switch']})]));await flush();assert.equal(e.result.hidden,true);await showSaved(ui,1,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'');assert.equal(e['bookmark-tag-id-switch'].checked,false);assert.equal(bookmarkWrites(ui).length,2);
});

async function finishGeneralize(ui,index,{note='synthetic retained note'}={}){
 const write=bookmarkWrites(ui).at(-1);assert.equal(write.url,'/api/sessions/session-a/frames/'+index+'/bookmark');assert.equal(write.opt.method,'PUT');assert.deepEqual(JSON.parse(write.opt.body),{snapshot_sha256:hash,note:'',tags:[],clear_tags:true});ui.respond(write.url,bookmarkResponse('session-a',[bookmarkRecord(index,{note,tags:[]})]));await flush();
}

test('Shift 4 and dollar clear saved tags while retaining the authoritative note and review state',async()=>{
 for(const key of ['4','$']){
  const ui=await startUI({bookmarks:[bookmarkRecord(2,{note:'old visible note',tags:['id-switch','occlusion','crossing']})],trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'retained query');e.result.focus();const calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();await finishGeneralize(ui,2,{note:'synthetic other-page note'});assert.equal(e['bookmark-note'].value,'synthetic other-page note');for(const tag of ['id-switch','occlusion','crossing'])assert.equal(e['bookmark-tag-'+tag].checked,false);assert.match(e['bookmark-editor-status'].textContent,/Bookmark saved/);assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(e['bookmark-search'].value,'retained query');assertLoopValues(ui,1,3,true);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(replayRequests(ui).length,calls);assert.equal(bookmarkWrites(ui).length,1);
 }
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/data-i="shortcutHelpGeneralize"/);assert.match(sessionsSource,/shortcutHelpGeneralize:"Pause and save the shown frame as a general bookmark/);assert.match(sessionsSource,/shortcutHelpGeneralize:"暫停並將目前影格存成一般書籤/);
});

test('Shift 4 creates missing general bookmarks and retains separate unsaved or invalid drafts',async()=>{
 for(const draft of [null,'synthetic generalize draft','x'.repeat(1001)]){
  const ui=await startUI(),e=ui.elements;await showSaved(ui,2);if(draft!==null)editBookmark(ui,draft,['crossing']);e.result.focus();assert.equal(pressBookmarkKey(ui,'$',{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();await finishGeneralize(ui,2,{note:''});assert.equal(e['bookmark-note'].value,draft??'');assert.equal(e['bookmark-tag-crossing'].checked,draft!==null);assert.equal(ui.document.activeElement,e.result);if(draft!==null)assert.match(e['bookmark-editor-status'].textContent,draft.length>1000?/1000/:/Unsaved/);assert.equal(bookmarkWrites(ui).length,1);
 }
});

test('Shift 4 cancels autoplay/manual decode and saves only the last complete snapshot',async()=>{
 for(const mode of ['autoplay','seek']){
  const ui=await startUI({trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);let pending;if(mode==='autoplay'){e['playback-play'].onclick();await ui.tick(0)}else pending=scrub(ui,2);await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();assert.equal(pressBookmarkKey(ui,'$',{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();if(pending)await pending;await finishGeneralize(ui,1);assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.match(e['playback-status'].textContent,/Paused/);
 }
});

test('Shift 4 ignores editors, IME, modifiers, opt-out/modal and unavailable/busy snapshots',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showSaved(ui,2);e.result.focus();const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','slider','grid']){const n=new Element('div');n.setAttribute('role',role);editors.push(n)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const key of ['4','$']){
  for(const target of editors){assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,...props}).defaultPrevented,false);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true,target:e.result}).defaultPrevented,false);e['shortcut-help-close'].onclick();e.result.focus();
 }assert.equal(bookmarkWrites(ui).length,0);assert.equal(pressBookmarkKey(ui,'$').defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'}',{shiftKey:true}).defaultPrevented,true);await flush();assert.equal(pressBookmarkKey(ui,'$',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);await flush();e.result.focus();assert.equal(pressBookmarkKey(ui,'$',{shiftKey:true}).defaultPrevented,true);await flush();assert.equal(pressBookmarkKey(ui,'$',{shiftKey:true}).defaultPrevented,false);await finishGeneralize(ui,3);assert.equal(bookmarkWrites(ui).length,1);const empty=await startUI();assert.equal(pressBookmarkKey(empty,'$',{shiftKey:true}).defaultPrevented,false);const waiting=await startUI({delayBookmarks:true});await showFirst(waiting);assert.equal(pressBookmarkKey(waiting,'$',{shiftKey:true}).defaultPrevented,false);
});

test('Shift 4 failure retains drafts and stale Session replies cannot clear another editor',async()=>{
 const ui=await startUI(),e=ui.elements;await showSaved(ui,2);editBookmark(ui,'synthetic generalize retry',['crossing']);e.result.focus();pressBookmarkKey(ui,'$',{shiftKey:true});await flush();ui.respond('/api/sessions/session-a/frames/2/bookmark',{detail:'synthetic unavailable'},false,409);await flush();assert.equal(e['bookmark-note'].value,'synthetic generalize retry');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.match(e['bookmarks-status'].textContent,/failed/i);pressBookmarkKey(ui,'$',{shiftKey:true});await flush();e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(1,{note:'another Session',tags:['occlusion']})]);await switched;ui.respond('/api/sessions/session-a/frames/2/bookmark',bookmarkResponse('session-a',[bookmarkRecord(2)]));await flush();assert.equal(e.result.hidden,true);await showSaved(ui,1,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'another Session');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(bookmarkWrites(ui).length,2);
});

async function finishShortcutDelete(ui,index,rows=[]){
 const write=bookmarkWrites(ui).at(-1);assert.equal(write.url,'/api/sessions/session-a/frames/'+index+'/bookmark');assert.equal(write.opt.method,'DELETE');assert.deepEqual(JSON.parse(write.opt.body),{snapshot_sha256:hash});ui.respond(write.url,bookmarkResponse('session-a',rows));await flush();
}

for(const deleteKey of ['Delete','D','d']){
test(deleteKey+' — '+ "Shift Delete cancellation confirms the displayed ordinal and keeps saved content, drafts and settings",async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(2,{note:'synthetic saved note',tags:['crossing']})],trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);configureLoop(ui,1,3);editBookmark(ui,'synthetic unsaved delete draft',['occlusion']);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'saved');e.result.focus();ui.setConfirm(()=>false);const calls=ui.pending.length;assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();assert.equal(ui.confirmations.length,1);assert.match(ui.confirmations[0],/displayed frame 2 \/ 3/);assert.match(ui.confirmations[0],/saved note and tags/);assert.equal(ui.confirmations[0].includes('synthetic saved note'),false);assert.equal(bookmarkWrites(ui).length,0);assert.equal(ui.pending.length,calls);assert.equal(e['bookmark-note'].value,'synthetic unsaved delete draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.deepEqual(visibleBookmarkIndices(ui),[2]);assertShownFrame(ui,2);assertLoopValues(ui,1,3,true);assert.equal(e['bookmark-search'].value,'saved');assert.equal(e['bookmark-filter-tag'].value,'crossing');assert.equal(ui.document.activeElement,e.result);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(e['bookmark-delete'].getAttribute('aria-keyshortcuts'),'Shift+d Shift+Delete');
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/data-i="shortcutHelpDeleteBookmark"/);assert.match(sessionsSource,/bookmarkDeleteConfirm:"Remove the saved bookmark for displayed frame/);assert.match(sessionsSource,/bookmarkDeleteConfirm:"要移除目前顯示第/);
});

test(deleteKey+' — '+ "Shift Delete acceptance sends one exact DELETE, retains separate invalid drafts and serializes repeat actions",async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(2,{note:'synthetic saved note',tags:['crossing']})],trackingReport:trackedSequence()}),e=ui.elements;await showSaved(ui,2);editBookmark(ui,'x'.repeat(1001),['occlusion']);e.result.focus();ui.setConfirm(()=>{assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,target:e.result}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'?',{target:e.result}).defaultPrevented,false);return true});assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();assert.equal(ui.confirmations.length,1);assert.equal(bookmarkWrites(ui).length,1);assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,target:e.result}).defaultPrevented,false);await finishShortcutDelete(ui,2,[bookmarkRecord(1)]);assert.deepEqual(visibleBookmarkIndices(ui),[1]);assert.equal(e['bookmark-delete'].disabled,true);assert.equal(e['bookmark-note'].value,'x'.repeat(1001));assert.equal(e['bookmark-tag-occlusion'].checked,true);assertShownFrame(ui,2);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0002');assert.equal(ui.document.activeElement,e.result);assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true}).defaultPrevented,false);assert.equal(ui.confirmations.length,1);
});

test(deleteKey+' — '+ "Shift Delete ignores editor/composed/active inputs, IME, modifiers, opt-out, modal and missing bookmarks",async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(2)]}),e=ui.elements;await showSaved(ui,2);e.result.focus();ui.setConfirm(()=>true);const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','slider','grid']){const n=new Element('div');n.setAttribute('role',role);editors.push(n)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{shiftKey:false},{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-delete'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,target:e.result}).defaultPrevented,false);e['shortcut-help-close'].onclick();assert.equal(ui.confirmations.length,0);assert.equal(bookmarkWrites(ui).length,0);
 const empty=await startUI();await showFirst(empty);assert.equal(pressBookmarkKey(empty,deleteKey,{shiftKey:true}).defaultPrevented,false);const waiting=await startUI({delayBookmarks:true});await showFirst(waiting);assert.equal(pressBookmarkKey(waiting,deleteKey,{shiftKey:true}).defaultPrevented,false);const unseen=await startUI({bookmarks:[bookmarkRecord(1)]});assert.equal(pressBookmarkKey(unseen,deleteKey,{shiftKey:true}).defaultPrevented,false);
});

test(deleteKey+' — '+ "Shift Delete freezes pending autoplay/manual decode and removes only the last complete shown frame",async()=>{
 for(const mode of ['autoplay','seek']){
  const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(2)],trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);ui.setConfirm(()=>true);let pending;if(mode==='autoplay'){e['playback-play'].onclick();await ui.tick(0)}else pending=scrub(ui,2);await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();ui.decode('data:image/png;base64,session-a-2');await flush();assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();ui.decode('data:image/jpeg;base64,session-a-depth-2');await flush();if(pending)await pending;await finishShortcutDelete(ui,1,[bookmarkRecord(2)]);assert.match(ui.confirmations[0],/displayed frame 1 \/ 3/);assertShownFrame(ui,1);assert.equal(e['tracking-overlay'].children[0].getAttribute('data-object-id'),'obj-0001');assert.match(e['playback-status'].textContent,/Paused/);
 }
});

test(deleteKey+' — '+ "confirmation rechecks snapshot, Session, hidden state and shortcut preference before deleting",async()=>{
 for(const mode of ['snapshot','session','hidden','optout']){
  const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(2)]}),e=ui.elements;await showFirst(ui);let pending;ui.setConfirm(()=>{if(mode==='snapshot'){e['frames-list'].value='2';pending=e.replay.onclick()}else if(mode==='session'){e['sessions-list'].value='session-b';pending=e['sessions-list'].onchange()}else if(mode==='hidden')ui.hide();else e['bookmark-shortcuts-enabled'].checked=false;return true});assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();assert.equal(ui.confirmations.length,1);assert.equal(bookmarkWrites(ui).length,0);if(mode==='snapshot'){await completeReplay(ui,2);await pending;assertShownFrame(ui,2)}if(mode==='session'){await finishFrames(ui,'session-b');await pending;assert.equal(e.result.hidden,true)}
 }
});

test(deleteKey+' — '+ "Shift Delete failures keep saved content/drafts, while pending jumps/writes and stale Session replies stay isolated",async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1),bookmarkRecord(3)]}),e=ui.elements;await showFirst(ui);ui.setConfirm(()=>true);assert.equal(pressBookmarkKey(ui,'}',{shiftKey:true}).defaultPrevented,true);await flush();assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);await flush();editBookmark(ui,'synthetic retained deletion draft',['occlusion']);e.result.focus();pressBookmarkKey(ui,deleteKey,{shiftKey:true});await flush();ui.respond('/api/sessions/session-a/frames/3/bookmark',{detail:'synthetic unavailable'},false,409);await flush();assert.equal(e['bookmark-note'].value,'synthetic retained deletion draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-delete'].disabled,false);assert.match(e['bookmarks-status'].textContent,/failed/i);pressBookmarkKey(ui,deleteKey,{shiftKey:true});await flush();assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true}).defaultPrevented,false);e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(1,{note:'another Session',tags:['crossing']})]);await switched;ui.respond('/api/sessions/session-a/frames/3/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1)]));await flush();await showSaved(ui,1,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'another Session');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.equal(bookmarkWrites(ui).length,2);
});

test(deleteKey+' — '+ "delete dialog focuses Cancel, blocks background keys and closes without a DELETE until explicitly confirmed",async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(2)]}),e=ui.elements;await showSaved(ui,2);e.result.focus();ui.setConfirm(()=>undefined);assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();assert.equal(e['bookmark-delete-dialog'].open,true);assert.equal(ui.document.activeElement,e['bookmark-delete-cancel']);assert.equal(ui.confirmations.length,1);for(const [key,props] of [[' ',{}],['?',{}],['Delete',{shiftKey:true}],['M',{}]])assert.equal(pressBookmarkKey(ui,key,{target:e['bookmark-delete-cancel'],...props}).defaultPrevented,false);assert.equal(bookmarkWrites(ui).length,0);e['bookmark-delete-dialog'].close();await flush();assert.equal(e['bookmark-delete-dialog'].open,false);assert.equal(bookmarkWrites(ui).length,0);assert.equal(ui.document.activeElement,e.result);assert.equal(pressBookmarkKey(ui,deleteKey,{shiftKey:true,target:e.result}).defaultPrevented,true);await flush();assert.equal(e['bookmark-delete-dialog'].open,true);e['bookmark-delete-confirm'].onclick();await flush();assert.equal(e['bookmark-delete-dialog'].open,false);assert.equal(bookmarkWrites(ui).length,1);await finishShortcutDelete(ui,2);assert.equal(e['bookmark-delete'].disabled,true);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<dialog id="bookmark-delete-dialog" aria-labelledby="bookmark-delete-title" aria-describedby="bookmark-delete-prompt">/);assert.match(html,/<button id="bookmark-delete-cancel"[^>]*autofocus/);
});

}

async function deleteForUndo(ui,index,remaining=[]){
 ui.elements.result.focus();ui.setConfirm(()=>true);pressBookmarkKey(ui,'D',{shiftKey:true});await flush();await finishShortcutDelete(ui,index,remaining);
}
function pressUndo(ui,properties={}){return pressBookmarkKey(ui,'z',{ctrlKey:true,...properties})}

test('Ctrl Z restores the last deleted saved fields once, retaining drafts, filters and displayed frame',async()=>{
 const original=bookmarkRecord(2,{note:'synthetic original note',tags:['id-switch','occlusion','crossing']}),ui=await startUI({bookmarks:[original]}),e=ui.elements;
 await showSaved(ui,2);editBookmark(ui,'x'.repeat(1001),['crossing']);await deleteForUndo(ui,2);
 filterBookmarkTag(ui,'occlusion');searchBookmarkNotes(ui,'original');e.result.focus();
 assert.equal(pressUndo(ui).defaultPrevented,true);await flush();const write=bookmarkWrites(ui).at(-1);
 assert.equal(write.opt.method,'PUT');assert.deepEqual(JSON.parse(write.opt.body),{snapshot_sha256:hash,note:original.note,tags:original.tags,create_only:true});
 assert.equal(pressUndo(ui).defaultPrevented,false);ui.respond(write.url,bookmarkResponse('session-a',[original]));await flush();
 assert.deepEqual(visibleBookmarkIndices(ui),[2]);assert.equal(e['bookmark-note'].value,'x'.repeat(1001));assert.equal(e['bookmark-tag-crossing'].checked,true);
 assert.equal(e['bookmark-search'].value,'original');assert.equal(e['bookmark-filter-tag'].value,'occlusion');assertShownFrame(ui,2);assert.match(e['playback-status'].textContent,/Paused/);assert.match(e['bookmarks-status'].textContent,/restored/i);assert.equal(pressUndo(ui).defaultPrevented,false);
});

test('Ctrl Z restores the deleted frame even after navigating, and newer deletion replaces the single undo slot',async()=>{
 const first=bookmarkRecord(1,{note:'first',tags:['occlusion']}),second=bookmarkRecord(2,{note:'second',tags:['crossing']}),ui=await startUI({bookmarks:[first,second]}),e=ui.elements;
 await showSaved(ui,1);await deleteForUndo(ui,1,[second]);await showSaved(ui,2);await deleteForUndo(ui,2);await showSaved(ui,3);e.result.focus();
 assert.equal(pressBookmarkKey(ui,'Z',{ctrlKey:true}).defaultPrevented,true);await flush();const write=bookmarkWrites(ui).at(-1);assert.match(write.url,/frames\/2\/bookmark$/);assert.equal(JSON.parse(write.opt.body).note,'second');ui.respond(write.url,bookmarkResponse('session-a',[second]));await flush();assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'');assert.equal(pressUndo(ui).defaultPrevented,false);
});

test('Ctrl Z preserves native text undo, IME and shortcut guards',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1)]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);
 const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','grid']){const n=new Element('div');n.setAttribute('role',role);editors.push(n)}
 const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){e.result.focus();assert.equal(pressUndo(ui,{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressUndo(ui,{composedPath:()=>[child,target]}).defaultPrevented,false)}
 for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressUndo(ui,{target:e.result}).defaultPrevented,false)}e.result.focus();
 for(const props of [{ctrlKey:false},{shiftKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressUndo(ui,props).defaultPrevented,false);
 assert.equal(pressUndo(ui,{defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressUndo(ui).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressUndo(ui).defaultPrevented,false);ui.document.hidden=false;
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressUndo(ui).defaultPrevented,false);assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.match(e.result.getAttribute('aria-keyshortcuts'),/Control\+z/);
 e['shortcut-help-open'].onclick();assert.equal(pressUndo(ui).defaultPrevented,false);e['shortcut-help-close'].onclick();assert.equal(bookmarkWrites(ui).length,1);
 const empty=await startUI();assert.equal(pressUndo(empty).defaultPrevented,false);
});

test('Ctrl Z failure retains undo for retry and a concurrent newer bookmark is kept',async()=>{
 const old=bookmarkRecord(1,{note:'deleted',tags:['occlusion']}),newer=bookmarkRecord(1,{note:'newer',tags:['crossing']}),ui=await startUI({bookmarks:[old]}),e=ui.elements;
 await showFirst(ui);await deleteForUndo(ui,1);pressUndo(ui);await flush();ui.respond('/api/sessions/session-a/frames/1/bookmark',{detail:'synthetic unavailable'},false,409);await flush();assert.match(e['bookmarks-status'].textContent,/failed/i);assert.equal(pressUndo(ui).defaultPrevented,true);await flush();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[newer]));await flush();assert.equal(e['bookmark-note'].value,'newer');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.match(e['bookmarks-status'].textContent,/Existing bookmark kept/);assert.equal(pressUndo(ui).defaultPrevented,false);
});

test('cancelled and failed deletions do not replace a prior successful undo',async()=>{
 const first=bookmarkRecord(1,{note:'first'}),second=bookmarkRecord(2,{note:'second'}),ui=await startUI({bookmarks:[first,second]});await showFirst(ui);await deleteForUndo(ui,1,[second]);await showSaved(ui,2);ui.elements.result.focus();ui.setConfirm(()=>false);pressBookmarkKey(ui,'D',{shiftKey:true});await flush();ui.setConfirm(()=>true);pressBookmarkKey(ui,'D',{shiftKey:true});await flush();ui.respond('/api/sessions/session-a/frames/2/bookmark',{detail:'synthetic unavailable'},false,409);await flush();assert.equal(pressUndo(ui).defaultPrevented,true);await flush();assert.match(bookmarkWrites(ui).at(-1).url,/frames\/1\/bookmark$/);
});

test('saving a new same-frame bookmark invalidates undo and stale restore replies cannot affect another Session',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1)]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);editBookmark(ui,'new saved content',['crossing']);e['bookmark-save'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{note:'new saved content',tags:['crossing']})]));await flush();e.result.focus();assert.equal(pressUndo(ui).defaultPrevented,false);
 await deleteForUndo(ui,1);assert.equal(pressUndo(ui).defaultPrevented,true);await flush();e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(1,{note:'other Session'})]);await switched;ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1)]));await flush();await showSaved(ui,1,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');e.result.focus();assert.equal(pressUndo(ui).defaultPrevented,false);
});

async function restoredForRedo(ui,index,rows){
 await deleteForUndo(ui,index,rows.filter(r=>r.index!==index));ui.elements.result.focus();pressUndo(ui);await flush();
 ui.respond('/api/sessions/session-a/frames/'+index+'/bookmark',bookmarkResponse('session-a',rows));await flush();
}
for(const redoCase of [{key:'Z',shiftKey:true,label:'Ctrl Shift Z'},{key:'y',shiftKey:false,label:'Ctrl y'},{key:'Y',shiftKey:false,label:'Ctrl Y'}]){
function pressRedo(ui,properties={}){return pressBookmarkKey(ui,redoCase.key,{ctrlKey:true,shiftKey:redoCase.shiftKey,...properties})}

test(redoCase.label+' — '+ 'redo confirms the restored bookmark, cancellation keeps redo, acceptance preserves drafts and enables undo again',async()=>{
 const row=bookmarkRecord(2,{note:'synthetic restored note',tags:['id-switch','crossing']}),ui=await startUI({bookmarks:[row]}),e=ui.elements;await showSaved(ui,2);editBookmark(ui,'x'.repeat(1001),['occlusion']);await restoredForRedo(ui,2,[row]);e.result.focus();
 ui.setConfirm(()=>false);assert.equal(pressRedo(ui).defaultPrevented,true);await flush();assert.match(ui.confirmations.at(-1),/restored bookmark for frame 2 \/ 3/);assert.equal(bookmarkWrites(ui).length,2);
 ui.setConfirm(()=>true);assert.equal(pressRedo(ui).defaultPrevented,true);await flush();const write=bookmarkWrites(ui).at(-1);assert.equal(write.opt.method,'DELETE');assert.deepEqual(JSON.parse(write.opt.body),{snapshot_sha256:hash,expected_updated_at:row.updated_at});assert.equal(pressRedo(ui).defaultPrevented,false);
 ui.respond(write.url,bookmarkResponse('session-a',[]));await flush();assert.deepEqual(visibleBookmarkIndices(ui),[]);assert.equal(e['bookmark-note'].value,'x'.repeat(1001));assert.equal(e['bookmark-tag-occlusion'].checked,true);assertShownFrame(ui,2);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(pressRedo(ui).defaultPrevented,false);
 assert.equal(pressUndo(ui).defaultPrevented,true);await flush();assert.deepEqual(JSON.parse(bookmarkWrites(ui).at(-1).opt.body),{snapshot_sha256:hash,note:row.note,tags:row.tags,create_only:true});
});

test(redoCase.label+' — '+ 'redo after frame navigation names and deletes only the restored frame, leaving current editor and filters intact',async()=>{
 const row=bookmarkRecord(1,{note:'restored target',tags:['occlusion']}),other=bookmarkRecord(3,{note:'other frame'}),ui=await startUI({bookmarks:[row,other]}),e=ui.elements;await showFirst(ui);await restoredForRedo(ui,1,[row,other]);await showSaved(ui,3);editBookmark(ui,'other draft',['crossing']);filterBookmarkTag(ui,'occlusion');searchBookmarkNotes(ui,'target');e.result.focus();ui.setConfirm(()=>true);
 assert.equal(pressRedo(ui).defaultPrevented,true);await flush();assert.match(ui.confirmations.at(-1),/restored bookmark for frame 1 \/ 3/);const write=bookmarkWrites(ui).at(-1);assert.match(write.url,/frames\/1\/bookmark$/);ui.respond(write.url,bookmarkResponse('session-a',[other]));await flush();assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'other draft');assert.equal(e['bookmark-search'].value,'target');assert.equal(e['bookmark-filter-tag'].value,'occlusion');
});

test(redoCase.label+' — '+ 'redo is unavailable before successful restore and respects input, IME, modifier, opt-out and modal guards',async()=>{
 const row=bookmarkRecord(1),ui=await startUI({bookmarks:[row]}),e=ui.elements;await showFirst(ui);assert.equal(pressRedo(ui).defaultPrevented,false);await restoredForRedo(ui,1,[row]);e.result.focus();
 const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);const role=new Element('div');role.setAttribute('role','textbox');editors.push(role);
 for(const target of editors){assert.equal(pressRedo(ui,{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressRedo(ui,{composedPath:()=>[child,target]}).defaultPrevented,false)}
 for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressRedo(ui,{target:e.result}).defaultPrevented,false)}e.result.focus();
 for(const props of [{ctrlKey:false},{shiftKey:!redoCase.shiftKey},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressRedo(ui,props).defaultPrevented,false);
 assert.equal(pressRedo(ui,{defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressRedo(ui).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressRedo(ui).defaultPrevented,false);ui.document.hidden=false;
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressRedo(ui).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.match(e.result.getAttribute('aria-keyshortcuts'),/Control\+Shift\+z/);e['shortcut-help-open'].onclick();assert.equal(pressRedo(ui).defaultPrevented,false);e['shortcut-help-close'].onclick();assert.equal(bookmarkWrites(ui).length,2);
 ui.setConfirm(()=>undefined);assert.equal(pressRedo(ui).defaultPrevented,true);await flush();assert.equal(e['bookmark-delete-dialog'].open,true);assert.equal(ui.document.activeElement,e['bookmark-delete-cancel']);assert.equal(pressRedo(ui).defaultPrevented,false);e['bookmark-delete-dialog'].close();await flush();assert.equal(bookmarkWrites(ui).length,2);
});

test(redoCase.label+' — '+ 'redo rechecks Session, snapshot generation, visibility and shortcut preference after confirmation',async()=>{
 for(const mode of ['session','refresh','hidden','disabled']){
  const row=bookmarkRecord(1),ui=await startUI({bookmarks:[row]}),e=ui.elements;await showFirst(ui);await restoredForRedo(ui,1,[row]);e.result.focus();let pending;
  ui.setConfirm(()=>{if(mode==='session'){e['sessions-list'].value='session-b';pending=e['sessions-list'].onchange()}else if(mode==='refresh')pending=e['sessions-list'].onchange();else if(mode==='hidden')ui.hide();else e['bookmark-shortcuts-enabled'].checked=false;return true});assert.equal(pressRedo(ui).defaultPrevented,true);await flush();assert.equal(bookmarkWrites(ui).length,2);
 }
});

test(redoCase.label+' — '+ 'failed redo retains the saved record and retry opportunity; stale deletion replies cannot affect another Session',async()=>{
 const row=bookmarkRecord(1,{note:'retry me'}),ui=await startUI({bookmarks:[row]}),e=ui.elements;await showFirst(ui);await restoredForRedo(ui,1,[row]);e.result.focus();ui.setConfirm(()=>true);pressRedo(ui);await flush();ui.respond('/api/sessions/session-a/frames/1/bookmark',{detail:'synthetic conflict'},false,409);await flush();assert.equal(e['bookmark-note'].value,'retry me');assert.match(e['bookmarks-status'].textContent,/failed/i);assert.equal(pressRedo(ui).defaultPrevented,true);await flush();e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(1,{note:'other Session'})]);await switched;ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[]));await flush();await showSaved(ui,1,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');e.result.focus();assert.equal(pressRedo(ui).defaultPrevented,false);
});

test(redoCase.label+' — '+ 'successful saved edits or a conflicting restore clear redo; draft edits alone do not',async()=>{
 const row=bookmarkRecord(1,{note:'original'}),ui=await startUI({bookmarks:[row]}),e=ui.elements;await showFirst(ui);await restoredForRedo(ui,1,[row]);editBookmark(ui,'newer note',['occlusion']);e['bookmark-save'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{note:'newer note',tags:['occlusion'],updated_at:row.updated_at+1})]));await flush();e.result.focus();assert.equal(pressRedo(ui).defaultPrevented,false);
 await deleteForUndo(ui,1);pressUndo(ui);await flush();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{note:'concurrent newer note'})]));await flush();assert.equal(pressRedo(ui).defaultPrevented,false);
});

}

test('history buttons follow successful delete, undo and confirmed redo, preserving drafts',async()=>{
 const row=bookmarkRecord(2,{note:'saved button note',tags:['id-switch','crossing']}),ui=await startUI({bookmarks:[row]}),e=ui.elements;
 assert.equal(e['bookmark-undo-delete'].disabled,true);assert.equal(e['bookmark-redo-delete'].disabled,true);await showSaved(ui,2);editBookmark(ui,'synthetic button draft',['occlusion']);await deleteForUndo(ui,2);
 assert.equal(e['bookmark-undo-delete'].disabled,false);assert.equal(e['bookmark-redo-delete'].disabled,true);e['bookmark-undo-delete'].onclick();await flush();assert.equal(e['bookmark-undo-delete'].disabled,true);assert.equal(e['bookmark-redo-delete'].disabled,true);e['bookmark-undo-delete'].onclick();assert.equal(bookmarkWrites(ui).length,2);
 ui.respond('/api/sessions/session-a/frames/2/bookmark',bookmarkResponse('session-a',[row]));await flush();assert.equal(e['bookmark-undo-delete'].disabled,true);assert.equal(e['bookmark-redo-delete'].disabled,false);assert.equal(e['bookmark-note'].value,'synthetic button draft');
 ui.setConfirm(()=>undefined);e['bookmark-redo-delete'].onclick();await flush();assert.equal(e['bookmark-delete-dialog'].open,true);assert.equal(ui.document.activeElement,e['bookmark-delete-cancel']);assert.equal(e['bookmark-redo-delete'].disabled,true);e['bookmark-delete-cancel'].onclick();await flush();assert.equal(e['bookmark-redo-delete'].disabled,false);assert.equal(bookmarkWrites(ui).length,2);
 e['bookmark-redo-delete'].onclick();await flush();e['bookmark-delete-confirm'].onclick();await flush();assert.equal(e['bookmark-redo-delete'].disabled,true);const write=bookmarkWrites(ui).at(-1);assert.equal(write.opt.method,'DELETE');assert.deepEqual(JSON.parse(write.opt.body),{snapshot_sha256:hash,expected_updated_at:row.updated_at});ui.respond(write.url,bookmarkResponse('session-a',[]));await flush();assert.equal(e['bookmark-undo-delete'].disabled,false);assert.equal(e['bookmark-redo-delete'].disabled,true);assert.equal(e['bookmark-note'].value,'synthetic button draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);
});

test('history buttons and explicit removal work with shortcuts off, including cross-frame redo confirmation',async()=>{
 const row=bookmarkRecord(1,{note:'saved original',tags:['occlusion']}),ui=await startUI({bookmarks:[row]}),e=ui.elements;await showFirst(ui);e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-undo-delete'].getAttribute('aria-keyshortcuts'),'');ui.setConfirm(()=>true);e['bookmark-delete'].onclick();await flush();await finishShortcutDelete(ui,1);assert.equal(e['bookmark-undo-delete'].disabled,false);e['bookmark-undo-delete'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[row]));await flush();await showSaved(ui,3);assert.equal(e['bookmark-redo-delete'].disabled,false);e['bookmark-redo-delete'].onclick();await flush();assert.match(ui.confirmations.at(-1),/restored bookmark for frame 1 \/ 3/);const write=bookmarkWrites(ui).at(-1);assert.match(write.url,/frames\/1\/bookmark$/);ui.respond(write.url,bookmarkResponse('session-a',[]));await flush();assertShownFrame(ui,3);assert.equal(e['bookmark-undo-delete'].disabled,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-undo-delete'].getAttribute('aria-keyshortcuts'),'Control+z');assert.equal(e['bookmark-redo-delete'].getAttribute('aria-keyshortcuts'),'Control+y Control+Shift+z');
});

test('history button failures retain retry availability and successful saved edits invalidate redo',async()=>{
 const row=bookmarkRecord(1,{note:'retry original'}),ui=await startUI({bookmarks:[row]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);e['bookmark-undo-delete'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/bookmark',{detail:'synthetic unavailable'},false,409);await flush();assert.equal(e['bookmark-undo-delete'].disabled,false);assert.equal(e['bookmark-redo-delete'].disabled,true);e['bookmark-undo-delete'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[row]));await flush();ui.setConfirm(()=>true);e['bookmark-redo-delete'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/bookmark',{detail:'synthetic newer version'},false,409);await flush();assert.equal(e['bookmark-redo-delete'].disabled,false);assert.equal(e['bookmark-note'].value,'retry original');editBookmark(ui,'new saved',['crossing']);assert.equal(e['bookmark-redo-delete'].disabled,false);e['bookmark-save'].onclick();await flush();assert.equal(e['bookmark-redo-delete'].disabled,true);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{note:'new saved',tags:['crossing']})]));await flush();assert.equal(e['bookmark-undo-delete'].disabled,true);assert.equal(e['bookmark-redo-delete'].disabled,true);
});

test('history buttons disable during help, bookmark jumps and seek previews, then recover',async()=>{
 const row=bookmarkRecord(1),other=bookmarkRecord(3),ui=await startUI({bookmarks:[row,other]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1,[other]);assert.equal(e['bookmark-undo-delete'].disabled,false);e['shortcut-help-open'].onclick();assert.equal(e['bookmark-undo-delete'].disabled,true);e['bookmark-undo-delete'].onclick();assert.equal(bookmarkWrites(ui).length,1);e['shortcut-help-close'].onclick();assert.equal(e['bookmark-undo-delete'].disabled,false);
 e['bookmark-list-next'].onclick();await flush();assert.equal(e['bookmark-undo-delete'].disabled,true);await completeReplay(ui,3);await flush();assert.equal(e['bookmark-undo-delete'].disabled,false);
 e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(e['bookmark-undo-delete'].disabled,true);e['bookmark-undo-delete'].onclick();assert.equal(bookmarkWrites(ui).length,1);const seek=e['replay-progress'].onchange();await flush();await completeReplay(ui,2);await seek;assert.equal(e['bookmark-undo-delete'].disabled,false);ui.hide();assert.equal(e['bookmark-undo-delete'].disabled,true);ui.document.hidden=false;ui.dispatch('visibilitychange');assert.equal(e['bookmark-undo-delete'].disabled,false);
});

test('Session reset disables history buttons and stale restore cannot enable another Session history',async()=>{
 const row=bookmarkRecord(1),ui=await startUI({bookmarks:[row]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);e['bookmark-undo-delete'].onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();assert.equal(e['bookmark-undo-delete'].disabled,true);assert.equal(e['bookmark-redo-delete'].disabled,true);await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(1,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[row]));await flush();assert.equal(e['bookmark-undo-delete'].disabled,true);assert.equal(e['bookmark-redo-delete'].disabled,true);e['bookmark-redo-delete'].onclick();assert.equal(ui.confirmations.length,1);
});

test('history target summaries use the deleted saved tags, not draft tags, through undo and redo',async()=>{
 const row=bookmarkRecord(2,{note:'synthetic private note must stay hidden',tags:['id-switch','crossing']}),ui=await startUI({bookmarks:[row]}),e=ui.elements;
 assert.equal(e['bookmark-undo-delete-target'].textContent,'No available target');assert.equal(e['bookmark-redo-delete-target'].textContent,'No available target');await showSaved(ui,2);editBookmark(ui,'draft note',['occlusion']);await deleteForUndo(ui,2);
 const expected='Target: Frame 2 / 3 · #2 · Suspected ID switch · Object crossing';assert.equal(e['bookmark-undo-delete-target'].textContent,expected);assert.equal(e['bookmark-redo-delete-target'].textContent,'No available target');assert.equal(e['bookmark-undo-delete-target'].textContent.includes('note'),false);assert.equal(e['bookmark-undo-delete-target'].textContent.includes('Occlusion'),false);
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(e['bookmark-undo-delete-target'].textContent,'No available target');ui.respond('/api/sessions/session-a/frames/2/bookmark',bookmarkResponse('session-a',[row]));await flush();assert.equal(e['bookmark-undo-delete-target'].textContent,'No available target');assert.equal(e['bookmark-redo-delete-target'].textContent,expected);assert.equal(e['bookmark-note'].value,'draft note');
 ui.setConfirm(()=>undefined);e['bookmark-redo-delete'].onclick();await flush();assert.equal(e['bookmark-redo-delete-target'].textContent,expected+' · Temporarily unavailable');e['bookmark-delete-cancel'].onclick();await flush();assert.equal(e['bookmark-redo-delete-target'].textContent,expected);
 ui.setConfirm(()=>true);e['bookmark-redo-delete'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/2/bookmark',bookmarkResponse('session-a',[]));await flush();assert.equal(e['bookmark-undo-delete-target'].textContent,expected);assert.equal(e['bookmark-redo-delete-target'].textContent,'No available target');
});

test('history summaries retain the original target across navigation and filters, distinguish sparse indexes, and replace older history',async()=>{
 const one=bookmarkRecord(1,{tags:['crossing']}),nine=bookmarkRecord(9,{tags:['occlusion']}),ui=await startUI({frameIndices:[1,9,15],bookmarks:[one,nine]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1,[nine]);await showSaved(ui,9);assert.match(e['bookmark-undo-delete-target'].textContent,/Frame 1 \/ 3 · #1/);await deleteForUndo(ui,9);assert.equal(e['bookmark-undo-delete-target'].textContent,'Target: Frame 2 / 3 · #9 · Occlusion');await showSaved(ui,15);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'no match');assert.equal(e['bookmark-undo-delete-target'].textContent,'Target: Frame 2 / 3 · #9 · Occlusion');assert.equal(e['frames-list'].value,'15');assert.equal(e['replay-progress'].value,'3');
});

test('general target summaries translate and reflect temporary blocking without exposing note text',async()=>{
 const row=bookmarkRecord(1,{note:'synthetic hidden general note'}),ui=await startUI({bookmarks:[row]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);assert.equal(e['bookmark-undo-delete-target'].textContent,'Target: Frame 1 / 3 · #1 · General bookmark');e.lang.value='zh-TW';e.lang.onchange();assert.equal(e['bookmark-undo-delete-target'].textContent,'目標: 影格 1 / 3 · #1 · 一般書籤');assert.equal(e['bookmark-redo-delete-target'].textContent,'目前無可操作目標');e['shortcut-help-open'].onclick();assert.match(e['bookmark-undo-delete-target'].textContent,/暫不可操作$/);e['shortcut-help-close'].onclick();assert.doesNotMatch(e['bookmark-undo-delete-target'].textContent,/暫不可操作/);ui.hide();assert.match(e['bookmark-undo-delete-target'].textContent,/暫不可操作$/);ui.document.hidden=false;ui.dispatch('visibilitychange');assert.doesNotMatch(e['bookmark-undo-delete-target'].textContent,/暫不可操作/);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');for(const id of ['bookmark-undo-delete','bookmark-redo-delete']){assert.match(html,new RegExp('id="'+id+'"[^>]*aria-describedby="'+id+'-target bookmark-history-help"'));assert.match(html,new RegExp('id="'+id+'-target"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"'))}
});

test('failed history operations recover the target and Session reset clears summaries before stale replies',async()=>{
 const row=bookmarkRecord(1,{tags:['crossing']}),ui=await startUI({bookmarks:[row]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);const expected=e['bookmark-undo-delete-target'].textContent;e['bookmark-undo-delete'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/bookmark',{detail:'synthetic unavailable'},false,409);await flush();assert.equal(e['bookmark-undo-delete-target'].textContent,expected);e['bookmark-undo-delete'].onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();assert.equal(e['bookmark-undo-delete-target'].textContent,'No available target');assert.equal(e['bookmark-redo-delete-target'].textContent,'No available target');await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(1)]);await changed;ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[row]));await flush();assert.equal(e['bookmark-undo-delete-target'].textContent,'No available target');assert.equal(e['bookmark-redo-delete-target'].textContent,'No available target');
});

test('clicking an Undo target replays its deleted bookmark frame, pauses and preserves both frame drafts and review settings',async()=>{
 const row=bookmarkRecord(1,{tags:['occlusion']}),ui=await startUI({bookmarks:[row],trackingReport:trackedSequence()}),e=ui.elements;await showFirst(ui);editBookmark(ui,'first unsaved draft',['crossing']);await deleteForUndo(ui,1);await showSaved(ui,3);editBookmark(ui,'third unsaved draft',['id-switch']);filterBookmarkTag(ui,'crossing');searchBookmarkNotes(ui,'not matched');configureLoop(ui,2,3);e['playback-speed'].value='2';e['playback-speed'].onchange();e['playback-play'].onclick();
 assert.equal(e['bookmark-undo-delete-jump'].disabled,false);const jumping=e['bookmark-undo-delete-jump'].onclick();await flush();assert.match(e['playback-status'].textContent,/Paused/);assert.equal(e['bookmark-undo-delete-jump'].disabled,true);assert.equal(e['bookmark-undo-delete'].disabled,true);await completeReplay(ui,1);await jumping;assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'first unsaved draft');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.equal(e['bookmark-search'].value,'not matched');assert.equal(e['bookmark-filter-tag'].value,'crossing');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(ui.document.activeElement,e.result);assert.equal(bookmarkWrites(ui).length,1);assert.equal(e['bookmark-undo-delete-jump'].disabled,false);assert.equal(e['bookmark-undo-delete'].disabled,false);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'third unsaved draft');
});

test('Redo target jump works with shortcuts off, ignores filters even during load and never asks for deletion',async()=>{
 const row=bookmarkRecord(2,{note:'restored',tags:['crossing']}),ui=await startUI({bookmarks:[row]}),e=ui.elements;await showSaved(ui,2);await restoredForRedo(ui,2,[row]);await showSaved(ui,1);e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();const count=ui.confirmations.length,writes=bookmarkWrites(ui).length,calls=replayRequests(ui).length;
 assert.equal(e['bookmark-redo-delete-jump'].disabled,false);const jumping=e['bookmark-redo-delete-jump'].onclick();await flush();e['bookmark-redo-delete-jump'].onclick();await flush();assert.equal(replayRequests(ui).length,calls+1);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no match');await completeReplay(ui,2);await jumping;assertShownFrame(ui,2);assert.equal(e['bookmark-note'].value,'restored');assert.equal(ui.confirmations.length,count);assert.equal(bookmarkWrites(ui).length,writes);assert.equal(e['bookmark-redo-delete'].disabled,false);assert.equal(e['bookmark-redo-delete-jump'].disabled,false);assert.equal(e['bookmark-search'].value,'no match');
});

test('history target replay failure or mismatched snapshot keeps the shown frame and permits retry',async()=>{
 for(const mode of ['http','snapshot']){
  const ui=await startUI({bookmarks:[bookmarkRecord(1)]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);await showSaved(ui,3);editBookmark(ui,'retained after failure',['crossing']);const jumping=e['bookmark-undo-delete-jump'].onclick();await flush();
  if(mode==='http')ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);else ui.respond('/api/sessions/session-a/frames/1/replay',{...replayResponse('session-a',1),snapshot_sha256:otherHash});await jumping;assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'retained after failure');assert.equal(e['bookmark-undo-delete-jump'].disabled,false);assert.match(e.status.textContent,/failed/i);const retry=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await retry;assertShownFrame(ui,1);assert.equal(bookmarkWrites(ui).length,1);
 }
});

test('stale history-target replay cannot replace another Session or retain its history controls',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1)]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);await showSaved(ui,3);const jumping=e['bookmark-undo-delete-jump'].onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await jumping;assert.equal(e.result.hidden,true);assert.equal(e['bookmark-undo-delete-jump'].disabled,true);assert.equal(e['bookmark-redo-delete-jump'].disabled,true);assert.equal(e['bookmark-undo-delete-target'].textContent,'No available target');await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
});

test('target jumps are disabled without history, during dialogs, hidden pages, write requests and seek previews',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1)]}),e=ui.elements;assert.equal(e['bookmark-undo-delete-jump'].disabled,true);assert.equal(e['bookmark-redo-delete-jump'].disabled,true);await showFirst(ui);const before=replayRequests(ui).length;e['bookmark-undo-delete-jump'].onclick();e['bookmark-redo-delete-jump'].onclick();assert.equal(replayRequests(ui).length,before);await deleteForUndo(ui,1);e['shortcut-help-open'].onclick();assert.equal(e['bookmark-undo-delete-jump'].disabled,true);e['bookmark-undo-delete-jump'].onclick();assert.equal(replayRequests(ui).length,before);e['shortcut-help-close'].onclick();ui.hide();assert.equal(e['bookmark-undo-delete-jump'].disabled,true);ui.document.hidden=false;ui.dispatch('visibilitychange');assert.equal(e['bookmark-undo-delete-jump'].disabled,false);
 e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(e['bookmark-undo-delete-jump'].disabled,true);e['bookmark-undo-delete-jump'].onclick();assert.equal(replayRequests(ui).length,before);e['playback-pause'].onclick();assert.equal(e['bookmark-undo-delete-jump'].disabled,false);e['bookmark-undo-delete'].onclick();await flush();assert.equal(e['bookmark-undo-delete-jump'].disabled,true);e['bookmark-undo-delete-jump'].onclick();assert.equal(replayRequests(ui).length,before);
});

for(const kind of ['undo','redo']){
test(kind+' target return pauses and restores the source frame with both drafts and settings intact, consuming the return position',async()=>{
 const row=bookmarkRecord(1,{tags:['crossing']}),ui=await startUI({bookmarks:[row]}),e=ui.elements;assert.equal(e['bookmark-history-return'].disabled,true);await showFirst(ui);editBookmark(ui,'first draft',['occlusion']);if(kind==='redo')await restoredForRedo(ui,1,[row]);else await deleteForUndo(ui,1);await showSaved(ui,3);editBookmark(ui,'third draft',['id-switch']);configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'missing');e['playback-speed'].value='2';e['playback-speed'].onchange();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();
 const jumping=e['bookmark-'+kind+'-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jumping;assert.equal(e['bookmark-history-return'].disabled,false);assert.equal(e['bookmark-history-return-target'].textContent,'Target: Frame 3 / 3 · #3');assert.equal(e['bookmark-note'].value,'first draft');const count=bookmarkWrites(ui).length;const returning=e['bookmark-history-return'].onclick();await flush();assert.equal(e['bookmark-history-return'].disabled,true);assert.equal(e['bookmark-'+kind+'-delete-jump'].disabled,true);e['bookmark-history-return'].onclick();await completeReplay(ui,3);await returning;assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'third draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-history-return'].disabled,true);assert.equal(e['bookmark-history-return-target'].textContent,'No available target');assert.equal(e['bookmark-search'].value,'missing');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result);assert.equal(bookmarkWrites(ui).length,count);
});
}

test('latest successful different-target jump replaces return, while same-frame and failed jumps retain it',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1)]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);await showSaved(ui,3);let jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.match(e['bookmark-history-return-target'].textContent,/#3$/);jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.match(e['bookmark-history-return-target'].textContent,/#3$/);await showSaved(ui,2);jump=e['bookmark-undo-delete-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await jump;assert.match(e['bookmark-history-return-target'].textContent,/#3$/);jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.match(e['bookmark-history-return-target'].textContent,/#2$/);e.lang.value='zh-TW';e.lang.onchange();assert.equal(e['bookmark-history-return-target'].textContent,'目標: 影格 2 / 3 · #2');
});

test('return replay failures preserve the current frame, drafts and position for retry',async()=>{
 for(const mode of ['http','snapshot']){
  const ui=await startUI({bookmarks:[bookmarkRecord(1)]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);await showSaved(ui,3);let jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;editBookmark(ui,'target draft kept',['crossing']);const returning=e['bookmark-history-return'].onclick();await flush();if(mode==='http')ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);else ui.respond('/api/sessions/session-a/frames/3/replay',{...replayResponse('session-a',3),snapshot_sha256:otherHash});await returning;assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft kept');assert.equal(e['bookmark-history-return'].disabled,false);assert.match(e['bookmark-history-return-target'].textContent,/#3$/);const retry=e['bookmark-history-return'].onclick();await flush();await completeReplay(ui,3);await retry;assertShownFrame(ui,3);assert.equal(e['bookmark-history-return'].disabled,true);
 }
});

test('return controls disable in dialogs, hidden pages and writes, and Session reset rejects stale return replies',async()=>{
 const row=bookmarkRecord(1),ui=await startUI({bookmarks:[row]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);await showSaved(ui,3);const jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;e['shortcut-help-open'].onclick();assert.equal(e['bookmark-history-return'].disabled,true);const count=replayRequests(ui).length;e['bookmark-history-return'].onclick();assert.equal(replayRequests(ui).length,count);e['shortcut-help-close'].onclick();assert.equal(e['bookmark-history-return'].disabled,false);ui.hide();assert.equal(e['bookmark-history-return'].disabled,true);ui.document.hidden=false;ui.dispatch('visibilitychange');assert.equal(e['bookmark-history-return'].disabled,false);e['bookmark-undo-delete'].onclick();await flush();assert.equal(e['bookmark-history-return'].disabled,true);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[row]));await flush();assert.equal(e['bookmark-history-return'].disabled,false);const returning=e['bookmark-history-return'].onclick();await flush();e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();assert.equal(e['bookmark-history-return'].disabled,true);await finishFrames(ui,'session-b');await switched;ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await returning;assert.equal(e.result.hidden,true);assert.equal(e['bookmark-history-return'].disabled,true);assert.equal(e['bookmark-history-return-target'].textContent,'No available target');
});

test('a target jump without a completed origin creates no return location',async()=>{
 const ui=await startUI({bookmarks:[bookmarkRecord(1)]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);e['frames-list'].value='2';const manual=e.replay.onclick();await flush();assert.equal(e.result.hidden,true);const jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await manual;assertShownFrame(ui,1);assert.equal(e['bookmark-history-return'].disabled,true);assert.equal(e['bookmark-history-return-target'].textContent,'No available target');
});

async function returnKeyFixture(){
 const ui=await startUI({bookmarks:[bookmarkRecord(1,{tags:['crossing']})]}),e=ui.elements;await showFirst(ui);editBookmark(ui,'target draft',['occlusion']);await deleteForUndo(ui,1);await showSaved(ui,3);editBookmark(ui,'origin draft',['id-switch']);const jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;e.result.focus();return ui;
}
for(const key of ['r','R']){
test(key+' returns using existing history, retaining drafts/settings and consuming the position without bookmark writes',async()=>{
 const ui=await returnKeyFixture(),e=ui.elements;configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no match');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();const writes=bookmarkWrites(ui).length;e['playback-play'].onclick();assert.match(e['playback-status'].textContent,/Playing/);assert.equal(e['bookmark-history-return'].getAttribute('aria-keyshortcuts'),'r');assert.equal(pressBookmarkKey(ui,key).defaultPrevented,true);await flush();assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);await completeReplay(ui,3);await flush();assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-history-return'].disabled,true);assert.equal(e['bookmark-search'].value,'no match');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result);assert.equal(bookmarkWrites(ui).length,writes);assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');
});
}

test('R return leaves note/search/editor typing, IME, modifiers and native reload combinations alone',async()=>{
 const ui=await returnKeyFixture(),e=ui.elements,calls=replayRequests(ui).length;const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'r',{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'r',{composedPath:()=>[child,target]}).defaultPrevented,false)}
 for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'r',{target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'r',props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'r',{defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'r').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'r').defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'r').defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-history-return'].getAttribute('aria-keyshortcuts'),'');assert.equal(e['bookmark-history-return'].disabled,false);assert.equal(pressBookmarkKey(ui,'r').defaultPrevented,false);assert.equal(replayRequests(ui).length,calls);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-history-return'].getAttribute('aria-keyshortcuts'),'r');
});

test('R return ignores missing history, pending seek and bookmark writes without preventing the key',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'r').defaultPrevented,false);const ui=await returnKeyFixture(),e=ui.elements,count=replayRequests(ui).length;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'r').defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'r').defaultPrevented,false);assert.equal(replayRequests(ui).length,count);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(pressBookmarkKey(ui,'r').defaultPrevented,true);await flush();await completeReplay(ui,3);await flush();assertShownFrame(ui,3);
});

test('R return failure can retry and stale Session results cannot replace another replay',async()=>{
 const ui=await returnKeyFixture(),e=ui.elements;pressBookmarkKey(ui,'r');await flush();ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);await flush();assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-history-return'].disabled,false);assert.equal(pressBookmarkKey(ui,'r').defaultPrevented,true);await flush();e['sessions-list'].value='session-b';const switched=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await switched;ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();assert.equal(e.result.hidden,true);assert.equal(e['bookmark-history-return'].disabled,true);assert.equal(pressBookmarkKey(ui,'r').defaultPrevented,false);await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
});

for(const key of ['r','R']){
test('Shift '+key+' clears only the return position, keeping image/drafts/settings and playback state',async()=>{
 for(const playing of [false,true]){
  const ui=await returnKeyFixture(),e=ui.elements;configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'query kept');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const requests=ui.pending.length,clouds=ui.cloudUpdates.length,confirmations=ui.confirmations.length,active=ui.document.activeElement,status=e['playback-status'].textContent,note=e['bookmark-note'].value;assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);await flush();assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,note);assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'query kept');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,requests);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(ui.confirmations.length,confirmations);assert.equal(e['bookmark-history-return'].disabled,true);assert.equal(e['bookmark-history-return-target'].textContent,'Return position cleared');assert.equal(e['bookmark-undo-delete'].disabled,false);assert.equal(e['bookmark-undo-delete-jump'].disabled,false);assert.equal(pressBookmarkKey(ui,'r').defaultPrevented,false);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);
 }
});
}

test('Shift R clearing respects note/search focus, composed editors, IME, modifiers, opt-out and modal guards',async()=>{
 const ui=await returnKeyFixture(),e=ui.elements,calls=ui.pending.length;const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true}).defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-history-clear-return'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-history-clear-return'].getAttribute('aria-keyshortcuts'),'Shift+r');assert.equal(e['bookmark-history-return'].disabled,false);assert.equal(ui.pending.length,calls);
});

test('Shift R does nothing for missing or busy return state, but clears after writes finish',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'R',{shiftKey:true}).defaultPrevented,false);const ui=await returnKeyFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true}).defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true}).defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e['bookmark-redo-delete'].disabled,false);assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true}).defaultPrevented,true);assert.equal(e['bookmark-history-return'].disabled,true);assert.equal(e['bookmark-redo-delete'].disabled,false);const jump=e['bookmark-redo-delete-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'R',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,1);await jump;assert.equal(e['bookmark-history-return'].disabled,true);
});

test('clearing return keeps per-frame drafts and allows a later target jump to create a new position',async()=>{
 const ui=await returnKeyFixture(),e=ui.elements;pressBookmarkKey(ui,'R',{shiftKey:true});assert.equal(e['bookmark-history-return'].disabled,true);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');const jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-history-return'].disabled,false);assert.match(e['bookmark-history-return-target'].textContent,/#3$/);const returning=e['bookmark-history-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-history-return'].disabled,true);
});

test('clear-return button works with shortcuts off and preserves replay, drafts, settings and history',async()=>{
 for(const enabled of [false,true])for(const playing of [false,true]){
  const ui=await returnKeyFixture(),e=ui.elements;
  e['bookmark-shortcuts-enabled'].checked=enabled;e['bookmark-shortcuts-enabled'].onchange();
  configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');
  e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();
  const calls=ui.pending.length,clouds=ui.cloudUpdates.length,status=e['playback-status'].textContent,image=e.rgb.src,note=e['bookmark-note'].value;
  assert.equal(e['bookmark-history-clear-return'].disabled,false);
  e['bookmark-history-clear-return'].onclick();await flush();
  assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,note);assert.equal(e['bookmark-tag-occlusion'].checked,true);
  assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);
  assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(e['bookmark-history-return'].disabled,true);assert.equal(e['bookmark-history-clear-return'].disabled,true);assert.equal(e['bookmark-history-return-target'].textContent,'Return position cleared');assert.equal(e['bookmark-undo-delete'].disabled,false);
  e['bookmark-history-clear-return'].onclick();assert.equal(ui.pending.length,calls);
  e['playback-pause'].onclick();await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');
  const jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;
  assert.equal(e['bookmark-history-clear-return'].disabled,false);assert.equal(e['bookmark-note'].value,note);
 }
});

test('clear-return button disables without a position, during blocked operations and after Session reset',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-history-clear-return'].disabled,true);
 const ui=await returnKeyFixture(),e=ui.elements;
 for(const block of ['help','hidden','seek']){
  if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
  assert.equal(e['bookmark-history-clear-return'].disabled,true);e['bookmark-history-clear-return'].onclick();
  if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();
  assert.equal(e['bookmark-history-clear-return'].disabled,false);assert.equal(e['bookmark-history-return'].disabled,false);
 }
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(e['bookmark-history-clear-return'].disabled,true);e['bookmark-history-clear-return'].onclick();
 ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e['bookmark-history-clear-return'].disabled,false);
 ui.setConfirm(()=>null);e['bookmark-redo-delete'].onclick();await flush();assert.equal(e['bookmark-history-clear-return'].disabled,true);e['bookmark-history-clear-return'].onclick();e['bookmark-delete-cancel'].onclick();await flush();assert.equal(e['bookmark-history-clear-return'].disabled,false);
 const jump=e['bookmark-redo-delete-jump'].onclick();await flush();assert.equal(e['bookmark-history-clear-return'].disabled,true);e['bookmark-history-clear-return'].onclick();await completeReplay(ui,1);await jump;assert.equal(e['bookmark-history-clear-return'].disabled,false);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(e['bookmark-history-clear-return'].disabled,true);assert.equal(e['bookmark-history-return'].disabled,true);
});

for(const action of ['button','shortcut']){
test(action+' clear notice is truthful, bilingual, draft-safe and resets for a new return or Session',async()=>{
 const empty=await startUI(),ee=empty.elements;ee['bookmark-history-clear-return'].onclick();pressBookmarkKey(empty,'R',{shiftKey:true});assert.equal(ee['bookmark-history-return-target'].textContent,'No available target');
 const ui=await returnKeyFixture(),e=ui.elements,summary=()=>e['bookmark-history-return-target'].textContent;
 const clear=()=>action==='button'?e['bookmark-history-clear-return'].onclick():pressBookmarkKey(ui,'R',{shiftKey:true});
 const original=summary();e['shortcut-help-open'].onclick();clear();assert.notEqual(summary(),'Return position cleared');e['shortcut-help-close'].onclick();assert.equal(summary(),original);
 if(action==='button'){e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange()}else{e['bookmark-note'].focus();clear();assert.equal(summary(),original);e.result.focus()}
 const requests=ui.pending.length,note=e['bookmark-note'].value;clear();assert.equal(summary(),'Return position cleared');assert.equal(ui.pending.length,requests);assert.equal(e['bookmark-note'].value,note);assertShownFrame(ui,1);
 e.lang.value='zh-TW';e.lang.onchange();assert.equal(summary(),'已清除返回位置');assert.equal(e['bookmark-note'].value,note);
 await showSaved(ui,3);assert.equal(summary(),'已清除返回位置');assert.equal(e['bookmark-note'].value,'origin draft');
 const jumping=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jumping;assert.match(summary(),/#3$/);assert.equal(e['bookmark-note'].value,note);
 e.lang.value='en';e.lang.onchange();clear();assert.equal(summary(),'Return position cleared');
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(summary(),'No available target');assert.equal(e['bookmark-history-return'].disabled,true);assert.equal(e['bookmark-history-clear-return'].disabled,true);
});
}

test('Undo clear restores either clear action without replay, preserving drafts, playback and review settings',async()=>{
 for(const action of ['button','shortcut'])for(const playing of [false,true]){
  const ui=await returnKeyFixture(),e=ui.elements,target=e['bookmark-history-return-target'].textContent;
  configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'query retained');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();
  if(action==='button')e['bookmark-history-clear-return'].onclick();else pressBookmarkKey(ui,'R',{shiftKey:true});
  assert.equal(e['bookmark-history-undo-clear'].hidden,false);assert.equal(e['bookmark-history-undo-clear'].disabled,false);e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();
  const calls=ui.pending.length,clouds=ui.cloudUpdates.length,note=e['bookmark-note'].value,status=e['playback-status'].textContent,image=e.rgb.src;
  e['bookmark-history-undo-clear'].onclick();await flush();assert.equal(e['bookmark-history-return-target'].textContent,'Return position restored · '+target);assert.equal(e['bookmark-history-return'].disabled,false);assert.equal(e['bookmark-history-clear-return'].disabled,false);assert.equal(e['bookmark-history-undo-clear'].hidden,true);assert.equal(e['bookmark-history-undo-clear'].disabled,true);
  assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,note);assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'query retained');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(e['bookmark-undo-delete'].disabled,false);
  e['bookmark-history-undo-clear'].onclick();assert.equal(ui.pending.length,calls);
  e['bookmark-history-clear-return'].onclick();assert.equal(e['bookmark-history-undo-clear'].disabled,false);e['bookmark-history-undo-clear'].onclick();
  const returning=e['bookmark-history-return'].onclick();await flush();await completeReplay(ui,3);await returning;assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-history-undo-clear'].disabled,true);assert.equal(e['bookmark-history-undo-clear'].hidden,true);
 }
});

test('Undo clear rechecks availability through dialogs, hidden pages, seeks, writes and pending jumps',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-history-undo-clear'].disabled,true);empty.elements['bookmark-history-undo-clear'].onclick();
 const ui=await returnKeyFixture(),e=ui.elements;e['bookmark-history-clear-return'].onclick();
 for(const block of ['help','hidden','seek']){
  if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
  assert.equal(e['bookmark-history-undo-clear'].disabled,true);e['bookmark-history-undo-clear'].onclick();
  if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();
  assert.equal(e['bookmark-history-undo-clear'].disabled,false);assert.equal(e['bookmark-history-return'].disabled,true);
 }
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(e['bookmark-history-undo-clear'].disabled,true);e['bookmark-history-undo-clear'].onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e['bookmark-history-undo-clear'].disabled,false);
 ui.setConfirm(()=>null);e['bookmark-redo-delete'].onclick();await flush();assert.equal(e['bookmark-history-undo-clear'].disabled,true);e['bookmark-history-undo-clear'].onclick();e['bookmark-delete-cancel'].onclick();await flush();assert.equal(e['bookmark-history-undo-clear'].disabled,false);
 const jump=e['bookmark-redo-delete-jump'].onclick();await flush();assert.equal(e['bookmark-history-undo-clear'].disabled,true);e['bookmark-history-undo-clear'].onclick();await completeReplay(ui,1);await jump;
 assert.equal(e['bookmark-history-undo-clear'].disabled,false);e['bookmark-history-undo-clear'].onclick();assert.equal(e['bookmark-history-return'].disabled,false);
});

test('Undo clear keeps ordinary navigation and failed jumps but cannot override a new return position or Session',async()=>{
 const ui=await returnKeyFixture(),e=ui.elements;e['bookmark-history-clear-return'].onclick();await showSaved(ui,2);assert.equal(e['bookmark-history-undo-clear'].disabled,false);
 const failed=e['bookmark-undo-delete-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await failed;assert.equal(e['bookmark-history-undo-clear'].disabled,false);assertShownFrame(ui,2);
 const jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.match(e['bookmark-history-return-target'].textContent,/#2$/);assert.equal(e['bookmark-history-undo-clear'].disabled,true);assert.equal(e['bookmark-history-undo-clear'].hidden,true);e['bookmark-history-undo-clear'].onclick();assert.match(e['bookmark-history-return-target'].textContent,/#2$/);
 e['bookmark-history-clear-return'].onclick();assert.equal(e['bookmark-history-undo-clear'].disabled,false);e.lang.value='zh-TW';e.lang.onchange();assert.equal(e['bookmark-history-undo-clear'].disabled,false);assert.equal(e['bookmark-history-return-target'].textContent,'已清除返回位置');
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(e['bookmark-history-undo-clear'].disabled,true);assert.equal(e['bookmark-history-undo-clear'].hidden,true);e['bookmark-history-undo-clear'].onclick();assert.equal(e['bookmark-history-return'].disabled,true);
});

test('restored-return notice keeps the target, language, drafts and navigation, clearing on new state',async()=>{
 const ui=await returnKeyFixture(),e=ui.elements,summary=()=>e['bookmark-history-return-target'].textContent;
 e['bookmark-history-clear-return'].onclick();e['bookmark-history-undo-clear'].onclick();const calls=ui.pending.length,note=e['bookmark-note'].value;
 assert.match(summary(),/^Return position restored · Target: Frame 3 \/ 3 · #3$/);assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,note);assert.equal(ui.pending.length,calls);
 e.lang.value='zh-TW';e.lang.onchange();assert.match(summary(),/^已恢復返回位置 · 目標: 影格 3 \/ 3 · #3$/);assert.equal(e['bookmark-note'].value,note);
 await showSaved(ui,2);assert.match(summary(),/^已恢復返回位置/);
 const failed=e['bookmark-history-return'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);await failed;assert.match(summary(),/^已恢復返回位置/);assertShownFrame(ui,2);
 const returning=e['bookmark-history-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(summary(),'目前無可操作目標');assert.equal(e['bookmark-note'].value,'origin draft');
 const jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.match(summary(),/#3$/);assert.equal(summary().includes('已恢復返回位置'),false);
 e['bookmark-history-clear-return'].onclick();e['bookmark-history-undo-clear'].onclick();assert.match(summary(),/^已恢復返回位置/);await showSaved(ui,2);
 const newer=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await newer;assert.match(summary(),/#2$/);assert.equal(summary().includes('已恢復返回位置'),false);
 e['bookmark-history-clear-return'].onclick();assert.equal(summary(),'已清除返回位置');e['bookmark-history-undo-clear'].onclick();assert.match(summary(),/^已恢復返回位置/);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(summary(),'目前無可操作目標');assert.equal(e['bookmark-history-return'].disabled,true);
});

test('missing, blocked and busy Undo clear never show a restored success notice',async()=>{
 const empty=await startUI();empty.elements['bookmark-history-undo-clear'].onclick();assert.equal(empty.elements['bookmark-history-return-target'].textContent,'No available target');
 const ui=await returnKeyFixture(),e=ui.elements,summary=()=>e['bookmark-history-return-target'].textContent;
 e['bookmark-history-undo-clear'].onclick();assert.equal(summary().includes('Return position restored'),false);e['bookmark-history-clear-return'].onclick();
 e['shortcut-help-open'].onclick();e['bookmark-history-undo-clear'].onclick();assert.equal(summary(),'Return position cleared');e['shortcut-help-close'].onclick();
 e['bookmark-undo-delete'].onclick();await flush();e['bookmark-history-undo-clear'].onclick();assert.equal(summary(),'Return position cleared');ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(summary(),'Return position cleared');
 e['bookmark-history-undo-clear'].onclick();assert.match(summary(),/^Return position restored/);e['bookmark-history-clear-return'].onclick();assert.equal(summary(),'Return position cleared');
});

for(const key of ['u','U']){
test(key+' restores button or Shift R clearing without navigation, retaining drafts/settings and playback',async()=>{
 for(const clearAction of ['button','shortcut'])for(const playing of [false,true]){
  const ui=await returnKeyFixture(),e=ui.elements;configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'query retained');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();
  if(clearAction==='button')e['bookmark-history-clear-return'].onclick();else pressBookmarkKey(ui,'R',{shiftKey:true});if(playing)e['playback-play'].onclick();
  const calls=ui.pending.length,clouds=ui.cloudUpdates.length,note=e['bookmark-note'].value,status=e['playback-status'].textContent,image=e.rgb.src,active=ui.document.activeElement;
  assert.equal(pressBookmarkKey(ui,key).defaultPrevented,true);await flush();assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,note);assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'query retained');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);
  assert.match(e['bookmark-history-return-target'].textContent,/^Return position restored.*#3$/);assert.equal(e['bookmark-history-return'].disabled,false);assert.equal(e['bookmark-history-undo-clear'].disabled,true);assert.equal(e['bookmark-undo-delete'].disabled,false);assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);
  const returning=e['bookmark-history-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);
 }
});
}

test('U undo-clear shortcut leaves editors, search, composed focus, IME and native modifier combinations alone',async()=>{
 const ui=await returnKeyFixture(),e=ui.elements;e['bookmark-history-clear-return'].onclick();const calls=ui.pending.length;
 const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'u',{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'u',{composedPath:()=>[child,target]}).defaultPrevented,false)}
 for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'u',{target:e.result}).defaultPrevented,false)}e.result.focus();
 for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'u',props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'u',{defaultPrevented:true}).defaultPrevented,true);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,false);e['shortcut-help-close'].onclick();
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-history-undo-clear'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,false);assert.equal(e['bookmark-history-undo-clear'].disabled,false);assert.equal(e['bookmark-history-return-target'].textContent,'Return position cleared');assert.equal(ui.pending.length,calls);
 e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-history-undo-clear'].getAttribute('aria-keyshortcuts'),'u');assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,true);
});

test('U leaves missing, pending seek/write/jump and stale Session restoration alone',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'u').defaultPrevented,false);
 const ui=await returnKeyFixture(),e=ui.elements;assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,false);e['bookmark-history-clear-return'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,false);e['playback-pause'].onclick();
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();
 const jump=e['bookmark-redo-delete-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,false);await completeReplay(ui,1);await jump;assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,true);
 e['bookmark-history-clear-return'].onclick();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,false);await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,false);assert.equal(e['bookmark-history-return'].disabled,true);
});

for(const key of ['u','U']){
test('Shift '+key+' redoes only restored clearing, preserving drafts/settings/playback and permitting U again',async()=>{
 for(const restore of ['button','shortcut'])for(const playing of [false,true]){
  const ui=await returnKeyFixture(),e=ui.elements;e.result.focus();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);
  e['bookmark-history-clear-return'].onclick();if(restore==='button')e['bookmark-history-undo-clear'].onclick();else pressBookmarkKey(ui,'u');
  configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'query retained');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();
  const calls=ui.pending.length,clouds=ui.cloudUpdates.length,note=e['bookmark-note'].value,status=e['playback-status'].textContent,image=e.rgb.src,active=ui.document.activeElement;
  assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);await flush();assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,note);assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'query retained');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);
  assert.equal(e['bookmark-history-return-target'].textContent,'Return position cleared');assert.equal(e['bookmark-history-return'].disabled,true);assert.equal(e['bookmark-history-undo-clear'].disabled,false);assert.equal(e['bookmark-undo-delete'].disabled,false);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);
  assert.equal(pressBookmarkKey(ui,'u').defaultPrevented,true);assert.match(e['bookmark-history-return-target'].textContent,/^Return position restored.*#3$/);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);e['bookmark-history-undo-clear'].onclick();
  const returning=e['bookmark-history-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);
 }
});
}

test('Shift U redo clearing respects editors/search, IME, modifiers, opt-out, dialogs and busy operations',async()=>{
 const ui=await returnKeyFixture(),e=ui.elements;e['bookmark-history-clear-return'].onclick();e['bookmark-history-undo-clear'].onclick();e.result.focus();const calls=ui.pending.length;
 const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}
 for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-history-clear-return'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-history-clear-return'].getAttribute('aria-keyshortcuts'),'Shift+r');assert.equal(ui.pending.length,calls);
 e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();
 ui.setConfirm(()=>null);e['bookmark-redo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,false);e['bookmark-delete-cancel'].onclick();await flush();const jump=e['bookmark-redo-delete-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,1);await jump;assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,true);
});

test('Shift U cannot clear missing history, new return origins or another Session',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'U',{shiftKey:true}).defaultPrevented,false);
 const ui=await returnKeyFixture(),e=ui.elements;e['bookmark-history-clear-return'].onclick();assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,false);e['bookmark-history-undo-clear'].onclick();await showSaved(ui,2);
 const failed=e['bookmark-undo-delete-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await failed;assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,true);pressBookmarkKey(ui,'u');
 const jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.match(e['bookmark-history-return-target'].textContent,/#2$/);assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,false);assert.equal(e['bookmark-history-return'].disabled,false);
 pressBookmarkKey(ui,'R',{shiftKey:true});pressBookmarkKey(ui,'u');e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,false);await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'U',{shiftKey:true}).defaultPrevented,false);assert.equal(e['bookmark-history-return'].disabled,true);
});

test('Redo clear button works with shortcuts on/off and preserves replay, drafts, settings and deletion history',async()=>{
 for(const enabled of [false,true])for(const playing of [false,true])for(const restore of ['button','shortcut']){
  const ui=await returnKeyFixture(),e=ui.elements;e['bookmark-history-clear-return'].onclick();if(restore==='button')e['bookmark-history-undo-clear'].onclick();else pressBookmarkKey(ui,'u');
  e['bookmark-shortcuts-enabled'].checked=enabled;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-history-redo-clear'].getAttribute('aria-keyshortcuts'),enabled?'Shift+u':'');assert.equal(e['bookmark-history-redo-clear'].disabled,false);
  configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'query retained');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();
  const calls=ui.pending.length,clouds=ui.cloudUpdates.length,note=e['bookmark-note'].value,status=e['playback-status'].textContent,image=e.rgb.src;
  e['bookmark-history-redo-clear'].onclick();await flush();assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,note);assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'query retained');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);
  assert.equal(e['bookmark-history-return-target'].textContent,'Return position cleared');assert.equal(e['bookmark-history-return'].disabled,true);assert.equal(e['bookmark-history-redo-clear'].disabled,true);assert.equal(e['bookmark-history-undo-clear'].disabled,false);assert.equal(e['bookmark-undo-delete'].disabled,false);e['bookmark-history-redo-clear'].onclick();assert.equal(ui.pending.length,calls);
  e['bookmark-history-undo-clear'].onclick();assert.equal(e['bookmark-history-redo-clear'].disabled,false);const returning=e['bookmark-history-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-history-redo-clear'].disabled,true);
 }
});

test('Redo clear button disables and rechecks dialogs, hidden pages, seeks, writes and pending jumps',async()=>{
 const ui=await returnKeyFixture(),e=ui.elements;e['bookmark-history-clear-return'].onclick();e['bookmark-history-undo-clear'].onclick();
 for(const block of ['help','hidden','seek']){
  if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
  assert.equal(e['bookmark-history-redo-clear'].disabled,true);e['bookmark-history-redo-clear'].onclick();
  if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();
  assert.equal(e['bookmark-history-redo-clear'].disabled,false);assert.equal(e['bookmark-history-return'].disabled,false);
 }
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(e['bookmark-history-redo-clear'].disabled,true);e['bookmark-history-redo-clear'].onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e['bookmark-history-redo-clear'].disabled,false);
 ui.setConfirm(()=>null);e['bookmark-redo-delete'].onclick();await flush();assert.equal(e['bookmark-history-redo-clear'].disabled,true);e['bookmark-history-redo-clear'].onclick();e['bookmark-delete-cancel'].onclick();await flush();assert.equal(e['bookmark-history-redo-clear'].disabled,false);
 const jump=e['bookmark-redo-delete-jump'].onclick();await flush();assert.equal(e['bookmark-history-redo-clear'].disabled,true);e['bookmark-history-redo-clear'].onclick();await completeReplay(ui,1);await jump;assert.equal(e['bookmark-history-redo-clear'].disabled,false);e['bookmark-history-redo-clear'].onclick();assert.equal(e['bookmark-history-return-target'].textContent,'Return position cleared');
});

test('Redo clear button rejects missing, normal, replaced and stale Session positions but keeps failed jumps',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-history-redo-clear'].disabled,true);empty.elements['bookmark-history-redo-clear'].onclick();
 const ui=await returnKeyFixture(),e=ui.elements;assert.equal(e['bookmark-history-redo-clear'].disabled,true);e['bookmark-history-redo-clear'].onclick();assert.equal(e['bookmark-history-return'].disabled,false);
 e['bookmark-history-clear-return'].onclick();assert.equal(e['bookmark-history-redo-clear'].disabled,true);e['bookmark-history-undo-clear'].onclick();await showSaved(ui,2);assert.equal(e['bookmark-history-redo-clear'].disabled,false);
 const failed=e['bookmark-undo-delete-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await failed;assert.equal(e['bookmark-history-redo-clear'].disabled,false);
 const jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.match(e['bookmark-history-return-target'].textContent,/#2$/);assert.equal(e['bookmark-history-redo-clear'].disabled,true);e['bookmark-history-redo-clear'].onclick();assert.equal(e['bookmark-history-return'].disabled,false);
 e['bookmark-history-clear-return'].onclick();e['bookmark-history-undo-clear'].onclick();assert.equal(e['bookmark-history-redo-clear'].disabled,false);e.lang.value='zh-TW';e.lang.onchange();assert.equal(e['bookmark-history-redo-clear'].disabled,false);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(e['bookmark-history-redo-clear'].disabled,true);e['bookmark-history-redo-clear'].onclick();assert.equal(e['bookmark-history-return'].disabled,true);
});

test('clear-history target summaries follow undo/redo history rather than the shown frame or filters',async()=>{
 for(const controls of ['buttons','keys']){
  const ui=await returnKeyFixture(),e=ui.elements,undo=e['bookmark-history-undo-clear-target'],redo=e['bookmark-history-redo-clear-target'];assert.equal(undo.textContent,'No available target');assert.equal(redo.textContent,'No available target');assert.equal(e['bookmark-history-undo-clear-action'].hidden,true);
  configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'unmatched query');e['playback-speed'].value='2';e['playback-speed'].onchange();const calls=ui.pending.length,note=e['bookmark-note'].value,image=e.rgb.src;
  if(controls==='buttons')e['bookmark-history-clear-return'].onclick();else pressBookmarkKey(ui,'R',{shiftKey:true});assert.equal(undo.textContent,'Target: Frame 3 / 3 · #3');assert.equal(redo.textContent,'No available target');assert.equal(e['bookmark-history-undo-clear-action'].hidden,false);
  if(controls==='buttons')e['bookmark-history-undo-clear'].onclick();else pressBookmarkKey(ui,'u');assert.equal(undo.textContent,'No available target');assert.equal(redo.textContent,'Target: Frame 3 / 3 · #3');assert.equal(e['bookmark-history-undo-clear-action'].hidden,true);
  e.lang.value='zh-TW';e.lang.onchange();assert.equal(redo.textContent,'目標: 影格 3 / 3 · #3');if(controls==='buttons')e['bookmark-history-redo-clear'].onclick();else pressBookmarkKey(ui,'U',{shiftKey:true});assert.equal(undo.textContent,'目標: 影格 3 / 3 · #3');assert.equal(redo.textContent,'目前無可操作目標');
  assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,note);assert.equal(e['bookmark-search'].value,'unmatched query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(ui.pending.length,calls);assert.equal(undo.textContent.includes(note),false);
 }
});

test('clear-history summaries retain sparse saved indices across navigation and reject replacement or stale Session history',async()=>{
 const ui=await startUI({frameIndices:[1,9,15],bookmarks:[bookmarkRecord(1)]}),e=ui.elements;await showFirst(ui);await deleteForUndo(ui,1);await showSaved(ui,15);editBookmark(ui,'origin draft',['occlusion']);const jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;e['bookmark-history-clear-return'].onclick();assert.equal(e['bookmark-history-undo-clear-target'].textContent,'Target: Frame 3 / 3 · #15');await showSaved(ui,9);editBookmark(ui,'shown draft',['crossing']);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no match');assert.equal(e['bookmark-history-undo-clear-target'].textContent,'Target: Frame 3 / 3 · #15');e['bookmark-history-undo-clear'].onclick();assert.equal(e['bookmark-history-redo-clear-target'].textContent,'Target: Frame 3 / 3 · #15');
 const newer=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await newer;assert.equal(e['bookmark-history-redo-clear-target'].textContent,'No available target');e['bookmark-history-clear-return'].onclick();assert.equal(e['bookmark-history-undo-clear-target'].textContent,'Target: Frame 2 / 3 · #9');
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();assert.equal(e['bookmark-history-undo-clear-target'].textContent,'No available target');assert.equal(e['bookmark-history-redo-clear-target'].textContent,'No available target');assert.equal(e['bookmark-history-undo-clear-action'].hidden,true);await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(e['bookmark-history-redo-clear-target'].textContent,'No available target');
});

test('clear-history summaries mark known busy targets without exposing drafts and restore availability afterwards',async()=>{
 const ui=await returnKeyFixture(),e=ui.elements;e['bookmark-history-clear-return'].onclick();const undo=e['bookmark-history-undo-clear-target'],redo=e['bookmark-history-redo-clear-target'];
 for(const action of ['help','hidden','seek']){
  if(action==='help')e['shortcut-help-open'].onclick();else if(action==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
  assert.equal(undo.textContent,'Target: Frame 3 / 3 · #3 · Temporarily unavailable');assert.equal(e['bookmark-history-undo-clear'].disabled,true);
  if(action==='help')e['shortcut-help-close'].onclick();else if(action==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(undo.textContent,'Target: Frame 3 / 3 · #3');
 }
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(undo.textContent,'Target: Frame 3 / 3 · #3 · Temporarily unavailable');ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(undo.textContent,'Target: Frame 3 / 3 · #3');e['bookmark-history-undo-clear'].onclick();e['shortcut-help-open'].onclick();assert.equal(redo.textContent,'Target: Frame 3 / 3 · #3 · Temporarily unavailable');e.lang.value='zh-TW';e.lang.onchange();assert.equal(redo.textContent,'目標: 影格 3 / 3 · #3 · 暫不可操作');e['shortcut-help-close'].onclick();assert.equal(redo.textContent,'目標: 影格 3 / 3 · #3');assert.equal(e['bookmark-note'].value,'target draft');
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');for(const id of ['bookmark-history-undo-clear','bookmark-history-redo-clear']){assert.match(html,new RegExp('id="'+id+'"[^>]*aria-describedby="'+id+'-target bookmark-history-help"'));assert.match(html,new RegExp('id="'+id+'-target"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"'))}
});

async function clearTargetJumpFixture(kind){
 const ui=await returnKeyFixture();ui.elements['bookmark-history-clear-return'].onclick();if(kind==='redo')ui.elements['bookmark-history-undo-clear'].onclick();return ui;
}
for(const kind of ['undo','redo']){
test(kind+' clear-target jump pauses and preserves per-frame drafts, review settings and clear history with shortcuts off',async()=>{
 const ui=await clearTargetJumpFixture(kind),e=ui.elements,id='bookmark-history-'+kind+'-clear';e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,2,3);e['playback-speed'].value='2';e['playback-speed'].onchange();filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no match');e['playback-play'].onclick();const writes=bookmarkWrites(ui).length,confirmations=ui.confirmations.length,calls=replayRequests(ui).length;
 assert.equal(e[id+'-jump'].disabled,false);const jumping=e[id+'-jump'].onclick();await flush();assert.match(e['playback-status'].textContent,/Paused/);assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();assert.equal(replayRequests(ui).length,calls+1);filterBookmarkTag(ui,'occlusion');searchBookmarkNotes(ui,'still no match');await completeReplay(ui,3);await jumping;
 assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'still no match');assert.equal(e['bookmark-filter-tag'].value,'occlusion');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(ui.document.activeElement,e.result);assert.equal(bookmarkWrites(ui).length,writes);assert.equal(ui.confirmations.length,confirmations);assert.equal(e[id+'-jump'].disabled,false);assert.match(e[id+'-target'].textContent,/#3$/);
 assert.equal(e['bookmark-history-return'].disabled,kind==='undo');assert.equal(e['bookmark-history-undo-clear'].disabled,kind!=='undo');assert.equal(e['bookmark-history-redo-clear'].disabled,kind!=='redo');await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');
});

test(kind+' clear-target jump rejects HTTP/snapshot failures, keeps the shown frame and permits retry',async()=>{
 for(const mode of ['http','snapshot']){
  const ui=await clearTargetJumpFixture(kind),e=ui.elements,id='bookmark-history-'+kind+'-clear';const jumping=e[id+'-jump'].onclick();await flush();
  if(mode==='http')ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);else ui.respond('/api/sessions/session-a/frames/3/replay',{...replayResponse('session-a',3),snapshot_sha256:otherHash});await jumping;assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e[id+'-jump'].disabled,false);assert.match(e.status.textContent,/failed/i);assert.match(e[id+'-target'].textContent,/#3$/);
  const retry=e[id+'-jump'].onclick();await flush();await completeReplay(ui,3);await retry;assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(bookmarkWrites(ui).length,1);
 }
});
}

test('clear-target jumps disable missing history, dialogs, hidden pages, seeks and writes without consuming targets',async()=>{
 const empty=await startUI();for(const kind of ['undo','redo']){const jump=empty.elements['bookmark-history-'+kind+'-clear-jump'];assert.equal(jump.disabled,true);jump.onclick()}assert.equal(replayRequests(empty).length,0);
 for(const kind of ['undo','redo']){
  const ui=await clearTargetJumpFixture(kind),e=ui.elements,id='bookmark-history-'+kind+'-clear',calls=replayRequests(ui).length;
  for(const block of ['help','hidden','seek']){
   if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
   assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();assert.equal(replayRequests(ui).length,calls);
   if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(e[id+'-jump'].disabled,false);
  }
  e['bookmark-undo-delete'].onclick();await flush();assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e[id+'-jump'].disabled,false);
  ui.setConfirm(()=>null);e['bookmark-redo-delete'].onclick();await flush();assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();e['bookmark-delete-cancel'].onclick();await flush();assert.equal(e[id+'-jump'].disabled,false);assert.equal(replayRequests(ui).length,calls);
 }
});

test('stale clear-target jumps cannot present a previous Session snapshot or retain its targets',async()=>{
 for(const kind of ['undo','redo']){
  const ui=await clearTargetJumpFixture(kind),e=ui.elements,id='bookmark-history-'+kind+'-clear';const jumping=e[id+'-jump'].onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await jumping;assert.equal(e.result.hidden,true);for(const action of ['undo','redo']){assert.equal(e['bookmark-history-'+action+'-clear-jump'].disabled,true);assert.equal(e['bookmark-history-'+action+'-clear-target'].textContent,'No available target')}await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
 }
});

for(const kind of ['undo','redo']){
test(kind+' clear-target return restores the origin with drafts/settings and all original clear history intact',async()=>{
 const ui=await clearTargetJumpFixture(kind),e=ui.elements;assert.equal(e['bookmark-clear-target-return'].disabled,true);e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no match');e['playback-speed'].value='2';e['playback-speed'].onchange();
 const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target'].map(id=>e[id].textContent);const original=history(),writes=bookmarkWrites(ui).length,confirmations=ui.confirmations.length;
 const jumping=e['bookmark-history-'+kind+'-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jumping;assert.equal(e['bookmark-clear-target-return'].disabled,false);assert.equal(e['bookmark-clear-target-return-target'].textContent,'Target: Frame 1 / 3 · #1');assert.deepEqual(history(),original);assert.equal(e['bookmark-note'].value,'origin draft');
 e['playback-play'].onclick();const calls=replayRequests(ui).length,returning=e['bookmark-clear-target-return'].onclick();await flush();assert.equal(e['bookmark-clear-target-return'].disabled,true);e['bookmark-clear-target-return'].onclick();assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,1);await returning;
 assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.deepEqual(history(),original);assert.equal(e['bookmark-history-undo-clear'].disabled,kind!=='undo');assert.equal(e['bookmark-history-redo-clear'].disabled,kind!=='redo');assert.equal(e['bookmark-history-return'].disabled,kind==='undo');assert.equal(e['bookmark-undo-delete'].disabled,false);assert.equal(e['bookmark-clear-target-return'].disabled,true);assert.equal(e['bookmark-clear-target-return-target'].textContent,'No available target');assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-search'].value,'no match');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(bookmarkWrites(ui).length,writes);assert.equal(ui.confirmations.length,confirmations);
 await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');
});
}

test('clear-target return keeps the latest complete origin, retaining it for same-frame or failed jumps and clear operations',async()=>{
 const ui=await clearTargetJumpFixture('undo'),e=ui.elements;let jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.match(e['bookmark-clear-target-return-target'].textContent,/#1$/);
 jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.match(e['bookmark-clear-target-return-target'].textContent,/#1$/);await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);await jump;assert.match(e['bookmark-clear-target-return-target'].textContent,/#1$/);
 jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.match(e['bookmark-clear-target-return-target'].textContent,/#2$/);e['bookmark-history-undo-clear'].onclick();e['bookmark-history-redo-clear'].onclick();assert.match(e['bookmark-clear-target-return-target'].textContent,/#2$/);e.lang.value='zh-TW';e.lang.onchange();assert.equal(e['bookmark-clear-target-return-target'].textContent,'目標: 影格 2 / 3 · #2');const returning=e['bookmark-clear-target-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(e['bookmark-note'].value,'second origin draft');assert.equal(e['bookmark-history-return-target'].textContent,'已清除返回位置');assert.match(e['bookmark-history-undo-clear-target'].textContent,/#3$/);
});

test('clear-target return HTTP or snapshot failures preserve the shown frame, draft and original history for retry',async()=>{
 for(const mode of ['http','snapshot']){
  const ui=await clearTargetJumpFixture('redo'),e=ui.elements;const jump=e['bookmark-history-redo-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jump;editBookmark(ui,'target edit kept',['crossing']);const returning=e['bookmark-clear-target-return'].onclick();await flush();if(mode==='http')ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);else ui.respond('/api/sessions/session-a/frames/1/replay',{...replayResponse('session-a',1),snapshot_sha256:otherHash});await returning;assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'target edit kept');assert.equal(e['bookmark-clear-target-return'].disabled,false);assert.match(e['bookmark-clear-target-return-target'].textContent,/#1$/);assert.equal(e['bookmark-history-redo-clear'].disabled,false);
  const retry=e['bookmark-clear-target-return'].onclick();await flush();await completeReplay(ui,1);await retry;assert.equal(e['bookmark-note'].value,'target draft');await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'target edit kept');
 }
});

test('clear-target return disables on missing/busy state and rejects stale Session responses',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-clear-target-return'].disabled,true);empty.elements['bookmark-clear-target-return'].onclick();assert.equal(replayRequests(empty).length,0);
 const ui=await clearTargetJumpFixture('undo'),e=ui.elements;const jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jump;const calls=replayRequests(ui).length;
 for(const block of ['help','hidden','seek']){
  if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
  assert.equal(e['bookmark-clear-target-return'].disabled,true);e['bookmark-clear-target-return'].onclick();assert.equal(replayRequests(ui).length,calls);
  if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(e['bookmark-clear-target-return'].disabled,false);
 }
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(e['bookmark-clear-target-return'].disabled,true);e['bookmark-clear-target-return'].onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e['bookmark-clear-target-return'].disabled,false);
 const returning=e['bookmark-clear-target-return'].onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await returning;assert.equal(e.result.hidden,true);assert.equal(e['bookmark-clear-target-return'].disabled,true);assert.equal(e['bookmark-clear-target-return-target'].textContent,'No available target');await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
});

test('clear-target jump without a complete shown origin does not create a return position',async()=>{
 const ui=await clearTargetJumpFixture('undo'),e=ui.elements;e['frames-list'].value='2';const manual=e.replay.onclick();await flush();assert.equal(e.result.hidden,true);const jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jump;ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await manual;assertShownFrame(ui,3);assert.equal(e['bookmark-clear-target-return'].disabled,true);assert.equal(e['bookmark-clear-target-return-target'].textContent,'No available target');assert.equal(e['bookmark-history-undo-clear'].disabled,false);
});

async function clearReturnKeyFixture(kind='undo'){
 const ui=await clearTargetJumpFixture(kind);const jump=ui.elements['bookmark-history-'+kind+'-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jump;return ui;
}
for(const key of ['t','T']){
test(key+' returns before either clear-target jump with drafts/settings/playback and original clear history preserved',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await clearReturnKeyFixture(kind),e=ui.elements;configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target'].map(id=>e[id].textContent),before=history(),calls=replayRequests(ui).length,writes=bookmarkWrites(ui).length;
  assert.equal(pressBookmarkKey(ui,key).defaultPrevented,true);await flush();assert.match(e['playback-status'].textContent,/Paused/);assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,1);await flush();assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.deepEqual(history(),before);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-clear-target-return'].disabled,true);assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);assert.equal(bookmarkWrites(ui).length,writes);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');
 }
});
}

test('T return ignores note/search/composed editor focus, IME, modifiers, shortcut opt-out and dialogs',async()=>{
 const ui=await clearReturnKeyFixture(),e=ui.elements,calls=replayRequests(ui).length;const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'t',{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'t',{composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'t',{target:e.result}).defaultPrevented,false)}e.result.focus();
 for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'t',props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'t',{defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,false);e['shortcut-help-close'].onclick();
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-clear-target-return'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,false);assert.equal(e['bookmark-clear-target-return'].disabled,false);assert.equal(replayRequests(ui).length,calls);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-clear-target-return'].getAttribute('aria-keyshortcuts'),'t');
});

test('T return leaves missing history, pending seek/write/jump and stale Session state alone',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'t').defaultPrevented,false);const ui=await clearReturnKeyFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,false);await completeReplay(ui,3);await jump;assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,true);await flush();await completeReplay(ui,1);await flush();assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,false);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,false);await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,false);
});

test('T return can retry failure and rejects delayed results after changing Session',async()=>{
 const ui=await clearReturnKeyFixture('redo'),e=ui.elements;pressBookmarkKey(ui,'t');await flush();ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await flush();assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-clear-target-return'].disabled,false);assert.equal(e['bookmark-history-redo-clear'].disabled,false);assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,true);await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();assert.equal(e.result.hidden,true);assert.equal(e['bookmark-clear-target-return'].disabled,true);await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
});

for(const key of ['t','T']){
test('Shift '+key+' clears only the independent return position while preserving image/drafts/playback and original history',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await clearReturnKeyFixture(kind),e=ui.elements;configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'query retained');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target'].map(id=>e[id].textContent),before=history(),requests=ui.pending.length,clouds=ui.cloudUpdates.length,note=e['bookmark-note'].value,status=e['playback-status'].textContent,image=e.rgb.src,active=ui.document.activeElement;
  assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);await flush();assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,note);assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'query retained');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,requests);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);
  assert.equal(e['bookmark-clear-target-return'].disabled,true);assert.equal(e['bookmark-clear-target-return-target'].textContent,'Target-jump return position cleared');assert.equal(e['bookmark-history-undo-clear'].disabled,kind!=='undo');assert.equal(e['bookmark-history-redo-clear'].disabled,kind!=='redo');assert.equal(e['bookmark-history-return'].disabled,kind==='undo');assert.equal(pressBookmarkKey(ui,'t').defaultPrevented,false);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);
 }
});
}

test('Shift T clearing respects note/search/composed editor focus, IME, modifiers, opt-out and modal guards',async()=>{
 const ui=await clearReturnKeyFixture(),e=ui.elements,calls=ui.pending.length;const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('Shift+t'));assert.equal(e['bookmark-clear-target-return'].disabled,false);assert.equal(ui.pending.length,calls);
});

test('Shift T leaves missing history and pending seek/write/jump/return operations alone',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'T',{shiftKey:true}).defaultPrevented,false);const ui=await clearReturnKeyFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();
 const jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);await jump;const returning=e['bookmark-clear-target-return'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,1);await returning;assert.equal(e['bookmark-clear-target-return'].disabled,true);
});

test('Shift T keeps both drafts and allows later clear-target jumps to establish a new independent return',async()=>{
 const ui=await clearReturnKeyFixture('redo'),e=ui.elements;assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,true);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');const jump=e['bookmark-history-redo-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-clear-target-return'].disabled,false);assert.match(e['bookmark-clear-target-return-target'].textContent,/#1$/);assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,true);assert.equal(e['bookmark-history-redo-clear'].disabled,false);assert.match(e['bookmark-history-return-target'].textContent,/^Return position restored.*#3$/);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,false);assert.equal(e['bookmark-clear-target-return'].disabled,true);
});

test('clear target-jump return button works with shortcuts off and preserves both drafts, playback and original history',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await clearReturnKeyFixture(kind),e=ui.elements,button=e['bookmark-clear-target-position'];
  e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();
  const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target'].map(id=>e[id].textContent),before=history(),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent;
  assert.equal(button.disabled,false);button.focus();button.onclick();await flush();assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);assert.equal(button.disabled,true);assert.equal(e['bookmark-clear-target-return'].disabled,true);assert.equal(e['bookmark-clear-target-return-target'].textContent,'Target-jump return position cleared');button.onclick();assert.equal(ui.pending.length,calls);
  await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);const jump=e['bookmark-history-'+kind+'-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.equal(button.disabled,false);assert.equal(e['bookmark-note'].value,'origin draft');assert.deepEqual(history(),before);
 }
});

test('clear target-jump return button is disabled for absent, blocked and stale positions',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-clear-target-position'].disabled,true);empty.elements['bookmark-clear-target-position'].onclick();assert.equal(replayRequests(empty).length,0);
 const ui=await clearReturnKeyFixture(),e=ui.elements,button=e['bookmark-clear-target-position'];
 for(const block of ['help','hidden','seek']){
  if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
  assert.equal(button.disabled,true);button.onclick();
  if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(button.disabled,false);
 }
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(button.disabled,true);button.onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(button.disabled,false);
 const jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();assert.equal(button.disabled,true);button.onclick();await completeReplay(ui,3);await jump;assert.equal(button.disabled,false);
 const returning=e['bookmark-clear-target-return'].onclick();await flush();assert.equal(button.disabled,true);button.onclick();await completeReplay(ui,1);await returning;assert.equal(button.disabled,true);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;button.onclick();assert.equal(button.disabled,true);
});

test('Shift T and the clear target-jump button share availability and accessible shortcut metadata',async()=>{
 const ui=await clearReturnKeyFixture(),e=ui.elements,button=e['bookmark-clear-target-position'];assert.equal(button.getAttribute('aria-keyshortcuts'),'Shift+t');assert.equal(button.disabled,false);assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,true);assert.equal(button.disabled,true);assert.equal(e['bookmark-clear-target-return'].disabled,true);
 e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(button.getAttribute('aria-keyshortcuts'),'');e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(button.getAttribute('aria-keyshortcuts'),'Shift+t');
});

test('button and Shift T clear notices translate, survive review changes and reset for new targets and Sessions',async()=>{
 for(const action of ['button','key']){
  const ui=await clearReturnKeyFixture('redo'),e=ui.elements,summary=e['bookmark-clear-target-return-target'];
  if(action==='button')e['bookmark-clear-target-position'].onclick();else assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,true);
  assert.equal(summary.textContent,'Target-jump return position cleared');e.lang.value='zh-TW';e.lang.onchange();assert.equal(summary.textContent,'已清除目標跳轉返回位置');assert.equal(e['bookmark-clear-target-return'].disabled,true);assert.equal(e['bookmark-clear-target-position'].disabled,true);
  searchBookmarkNotes(ui,'kept query');filterBookmarkTag(ui,'general');await showSaved(ui,1);assert.equal(summary.textContent,'已清除目標跳轉返回位置');assert.equal(e['bookmark-note'].value,'target draft');assert.match(e['bookmark-history-return-target'].textContent,/已恢復返回位置/);assert.equal(e['bookmark-history-redo-clear'].disabled,false);
  const jump=e['bookmark-history-redo-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.match(summary.textContent,/#1$/);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-clear-target-position'].disabled,false);
  const returning=e['bookmark-clear-target-return'].onclick();await flush();await completeReplay(ui,1);await returning;assert.equal(summary.textContent,'目前無可操作目標');
  e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(summary.textContent,'目前無可操作目標');
 }
});

test('unavailable clear actions do not create success notices and Session reset removes an existing notice',async()=>{
 const empty=await startUI(),b=empty.elements;b['bookmark-clear-target-position'].onclick();assert.equal(pressBookmarkKey(empty,'T',{shiftKey:true}).defaultPrevented,false);assert.equal(b['bookmark-clear-target-return-target'].textContent,'No available target');
 const ui=await clearReturnKeyFixture(),e=ui.elements,summary=e['bookmark-clear-target-return-target'];e['shortcut-help-open'].onclick();const blocked=summary.textContent;e['bookmark-clear-target-position'].onclick();assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,false);assert.equal(summary.textContent,blocked);e['shortcut-help-close'].onclick();e['bookmark-clear-target-position'].onclick();assert.equal(summary.textContent,'Target-jump return position cleared');
 e['bookmark-clear-target-position'].onclick();assert.equal(summary.textContent,'Target-jump return position cleared');e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(summary.textContent,'No available target');
});

test('Undo target-return clear restores the exact position after button or Shift T clearing without changing drafts/playback/original history',async()=>{
 for(const kind of ['undo','redo'])for(const action of ['button','key'])for(const playing of [false,true]){
  const ui=await clearReturnKeyFixture(kind),e=ui.elements,undo=e['bookmark-undo-clear-target-position'],summary=e['bookmark-clear-target-return-target'];const target=summary.textContent;
  configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();
  const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target'].map(id=>e[id].textContent),before=history(),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent;assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);
  if(action==='button')e['bookmark-clear-target-position'].onclick();else assert.equal(pressBookmarkKey(ui,'T',{shiftKey:true}).defaultPrevented,true);assert.equal(undo.hidden,false);assert.equal(undo.disabled,false);e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();e['bookmark-clear-target-position'].onclick();undo.onclick();await flush();
  assert.equal(summary.textContent,'Target-jump return position restored · '+target);assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);assert.equal(e['bookmark-clear-target-return'].disabled,false);assert.equal(e['bookmark-clear-target-position'].disabled,false);assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);undo.onclick();assert.equal(ui.pending.length,calls);
  const returning=e['bookmark-clear-target-return'].onclick();await flush();await completeReplay(ui,1);await returning;assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.deepEqual(history(),before);
 }
});

test('Undo target-return clear rejects missing, hidden, modal, seeking and writing states without consuming its backup',async()=>{
 const empty=await startUI();const none=empty.elements['bookmark-undo-clear-target-position'];assert.equal(none.hidden,true);assert.equal(none.disabled,true);none.onclick();assert.equal(replayRequests(empty).length,0);
 const ui=await clearReturnKeyFixture(),e=ui.elements,undo=e['bookmark-undo-clear-target-position'];e['bookmark-clear-target-position'].onclick();
 for(const block of ['help','hidden','seek']){
  if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
  assert.equal(undo.disabled,true);undo.onclick();assert.equal(e['bookmark-clear-target-return'].disabled,true);
  if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(undo.disabled,false);
 }
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(undo.disabled,true);undo.onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(undo.disabled,false);undo.onclick();assert.equal(e['bookmark-clear-target-return'].disabled,false);assert.match(e['bookmark-clear-target-return-target'].textContent,/#1$/);
});

test('Undo target-return backup is replaced by a new target, reset across Sessions, and can be cleared/restored repeatedly',async()=>{
 const ui=await clearReturnKeyFixture('redo'),e=ui.elements,undo=e['bookmark-undo-clear-target-position'];e['bookmark-clear-target-position'].onclick();await showSaved(ui,2);assert.equal(undo.disabled,false);const jump=e['bookmark-history-redo-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);undo.onclick();assert.match(e['bookmark-clear-target-return-target'].textContent,/#2$/);
 for(let i=0;i<2;i++){e['bookmark-clear-target-position'].onclick();assert.equal(undo.disabled,false);undo.onclick();assert.match(e['bookmark-clear-target-return-target'].textContent,/#2$/)}
 e['bookmark-clear-target-position'].onclick();e.lang.value='zh-TW';e.lang.onchange();assert.equal(e['bookmark-clear-target-return-target'].textContent,'已清除目標跳轉返回位置');assert.equal(undo.disabled,false);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);undo.onclick();assert.equal(e['bookmark-clear-target-return-target'].textContent,'目前無可操作目標');assert.equal(e['bookmark-clear-target-return'].disabled,true);
});

test('restored target-return notice translates, survives review changes and resets for new positions and Sessions',async()=>{
 const ui=await clearReturnKeyFixture('redo'),e=ui.elements,summary=e['bookmark-clear-target-return-target'];e['bookmark-clear-target-position'].onclick();e['bookmark-undo-clear-target-position'].onclick();assert.match(summary.textContent,/^Target-jump return position restored.*#1$/);e.lang.value='zh-TW';e.lang.onchange();assert.match(summary.textContent,/^已恢復目標跳轉返回位置.*#1$/);
 searchBookmarkNotes(ui,'kept query');filterBookmarkTag(ui,'general');await showSaved(ui,2);assert.match(summary.textContent,/^已恢復目標跳轉返回位置.*#1$/);const jump=e['bookmark-history-redo-clear-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.match(summary.textContent,/^目標:.*#2$/);e['bookmark-clear-target-position'].onclick();assert.equal(summary.textContent,'已清除目標跳轉返回位置');e['bookmark-undo-clear-target-position'].onclick();assert.match(summary.textContent,/^已恢復目標跳轉返回位置.*#2$/);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(summary.textContent,'目前無可操作目標');e['bookmark-undo-clear-target-position'].onclick();assert.equal(summary.textContent,'目前無可操作目標');
});

test('blocked undo cannot announce restored success; failed target return retains the restored notice until successful retry',async()=>{
 const ui=await clearReturnKeyFixture(),e=ui.elements,summary=e['bookmark-clear-target-return-target'];e['bookmark-clear-target-position'].onclick();e['shortcut-help-open'].onclick();e['bookmark-undo-clear-target-position'].onclick();assert.equal(summary.textContent,'Target-jump return position cleared');e['shortcut-help-close'].onclick();e['bookmark-undo-clear-target-position'].onclick();assert.match(summary.textContent,/^Target-jump return position restored.*#1$/);
 const returning=e['bookmark-clear-target-return'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await returning;assert.match(summary.textContent,/^Target-jump return position restored.*#1$/);assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');const retry=e['bookmark-clear-target-return'].onclick();await flush();await completeReplay(ui,1);await retry;assert.equal(summary.textContent,'No available target');assert.equal(e['bookmark-note'].value,'target draft');
});

for(const key of ['y','Y'])test(key+' restores only the cleared target-jump position with notice, drafts/playback/settings and original history intact',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await clearReturnKeyFixture(kind),e=ui.elements;configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();e['bookmark-clear-target-position'].onclick();e.result.focus();
  const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target'].map(id=>e[id].textContent),before=history(),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;
  assert.equal(pressBookmarkKey(ui,key).defaultPrevented,true);await flush();assert.match(e['bookmark-clear-target-return-target'].textContent,/^Target-jump return position restored.*#1$/);assert.equal(e['bookmark-clear-target-return'].disabled,false);assert.equal(e['bookmark-undo-clear-target-position'].hidden,true);assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);
  const returning=e['bookmark-clear-target-return'].onclick();await flush();await completeReplay(ui,1);await returning;assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);
 }
});

test('Y undo-clear preserves native note/search/composed editing and ignores IME, modifiers, repeats, opt-out and dialogs',async()=>{
 const ui=await clearReturnKeyFixture(),e=ui.elements;e['bookmark-clear-target-position'].onclick();const calls=ui.pending.length;const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'y',{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'y',{composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'y',{target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'y',props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'y',{defaultPrevented:true}).defaultPrevented,true);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-undo-clear-target-position'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-undo-clear-target-position'].getAttribute('aria-keyshortcuts'),'y');assert.equal(e['bookmark-clear-target-return-target'].textContent,'Target-jump return position cleared');assert.equal(ui.pending.length,calls);assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,true);
});

test('Y ignores absent, pending seek/write/jump and reset target-return backups',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'y').defaultPrevented,false);const ui=await clearReturnKeyFixture(),e=ui.elements;e['bookmark-clear-target-position'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();
 const jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,false);await completeReplay(ui,3);await jump;assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,true);e['bookmark-clear-target-position'].onclick();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,false);
});

test('Ctrl Y keeps confirmed bookmark deletion redo instead of restoring a cleared target return',async()=>{
 const ui=await clearReturnKeyFixture(),e=ui.elements;e['bookmark-clear-target-position'].onclick();e['bookmark-undo-delete'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e['bookmark-redo-delete'].disabled,false);ui.setConfirm(()=>null);
 assert.equal(pressBookmarkKey(ui,'y',{ctrlKey:true}).defaultPrevented,true);await flush();assert.equal(e['bookmark-delete-dialog'].open,true);assert.equal(e['bookmark-clear-target-return-target'].textContent,'Target-jump return position cleared');e['bookmark-delete-cancel'].onclick();await flush();assert.equal(e['bookmark-undo-clear-target-position'].disabled,false);assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,true);assert.match(e['bookmark-clear-target-return-target'].textContent,/^Target-jump return position restored/);
});

async function restoredTargetKeyFixture(kind='undo'){
 const ui=await clearReturnKeyFixture(kind);ui.elements['bookmark-clear-target-position'].onclick();ui.elements['bookmark-undo-clear-target-position'].onclick();return ui;
}
for(const key of ['y','Y'])test('Shift '+key+' redoes only restored target-return clearing with notice and drafts/playback/original history preserved',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await restoredTargetKeyFixture(kind),e=ui.elements;configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();e.result.focus();
  const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target'].map(id=>e[id].textContent),before=history(),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;
  assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);await flush();assert.equal(e['bookmark-clear-target-return-target'].textContent,'Target-jump return position cleared');assert.equal(e['bookmark-clear-target-return'].disabled,true);assert.equal(e['bookmark-undo-clear-target-position'].disabled,false);assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);
  assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,true);assert.match(e['bookmark-clear-target-return-target'].textContent,/^Target-jump return position restored.*#1$/);e.lang.value='zh-TW';e.lang.onchange();assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);assert.equal(e['bookmark-clear-target-return-target'].textContent,'已清除目標跳轉返回位置');assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,true);const returning=e['bookmark-clear-target-return'].onclick();await flush();await completeReplay(ui,1);await returning;assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);e.lang.value='en';e.lang.onchange();assert.deepEqual(history(),before);
 }
});

test('Shift Y ignores native/composed/active editors, IME, modifiers, repeated/hidden events, opt-out and help',async()=>{
 const ui=await restoredTargetKeyFixture(),e=ui.elements,calls=ui.pending.length;const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('Shift+y'));assert.match(e['bookmark-clear-target-return-target'].textContent,/^Target-jump return position restored/);assert.equal(ui.pending.length,calls);
});

test('Shift Y requires a valid just-restored position and leaves seeks/writes/jumps/new targets/consumed or reset history alone',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'Y',{shiftKey:true}).defaultPrevented,false);const ui=await clearReturnKeyFixture(),e=ui.elements;assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);e['bookmark-clear-target-position'].onclick();assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);e['bookmark-undo-clear-target-position'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();await showSaved(ui,2);
 const jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);await jump;assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);e['bookmark-clear-target-position'].onclick();e['bookmark-undo-clear-target-position'].onclick();const returning=e['bookmark-clear-target-return'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,2);await returning;assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,false);
});

test('target-return Redo clear button works with shortcuts off and preserves frame/drafts/playback and original history',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await restoredTargetKeyFixture(kind),e=ui.elements,redo=e['bookmark-redo-clear-target-position'];e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();
  const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target'].map(id=>e[id].textContent),before=history(),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent;assert.equal(redo.disabled,false);redo.onclick();await flush();assert.equal(e['bookmark-clear-target-return-target'].textContent,'Target-jump return position cleared');assert.equal(redo.disabled,true);assert.equal(e['bookmark-clear-target-return'].disabled,true);assert.equal(e['bookmark-undo-clear-target-position'].disabled,false);assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);redo.onclick();assert.equal(ui.pending.length,calls);
  e['bookmark-undo-clear-target-position'].onclick();assert.equal(redo.disabled,false);const returning=e['bookmark-clear-target-return'].onclick();await flush();await completeReplay(ui,1);await returning;assert.equal(redo.disabled,true);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.deepEqual(history(),before);
 }
});

test('target-return Redo clear button disables absent/non-restored, hidden/modal/seeking/writing/jumping and stale positions',async()=>{
 const empty=await startUI();empty.elements['bookmark-redo-clear-target-position'].onclick();assert.equal(empty.elements['bookmark-redo-clear-target-position'].disabled,true);assert.equal(replayRequests(empty).length,0);const ui=await clearReturnKeyFixture(),e=ui.elements,redo=e['bookmark-redo-clear-target-position'];assert.equal(redo.disabled,true);redo.onclick();e['bookmark-clear-target-position'].onclick();assert.equal(redo.disabled,true);e['bookmark-undo-clear-target-position'].onclick();
 for(const block of ['help','hidden','seek']){
  if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
  assert.equal(redo.disabled,true);redo.onclick();
  if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(redo.disabled,false);
 }
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(redo.disabled,true);redo.onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(redo.disabled,false);await showSaved(ui,2);const jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();assert.equal(redo.disabled,true);redo.onclick();await completeReplay(ui,3);await jump;assert.equal(redo.disabled,true);redo.onclick();assert.match(e['bookmark-clear-target-return-target'].textContent,/^Target:.*#2$/);
 e['bookmark-clear-target-position'].onclick();e['bookmark-undo-clear-target-position'].onclick();assert.equal(redo.disabled,false);e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(redo.disabled,true);redo.onclick();assert.equal(e['bookmark-clear-target-return-target'].textContent,'No available target');
});

test('target-return redo button and Shift Y share eligibility, clear notice and accessible shortcut metadata',async()=>{
 const ui=await restoredTargetKeyFixture(),e=ui.elements,redo=e['bookmark-redo-clear-target-position'];assert.equal(redo.getAttribute('aria-keyshortcuts'),'Shift+y');assert.equal(redo.disabled,false);assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,true);assert.equal(redo.disabled,true);assert.equal(e['bookmark-clear-target-return-target'].textContent,'Target-jump return position cleared');e['bookmark-undo-clear-target-position'].onclick();assert.equal(redo.disabled,false);e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(redo.getAttribute('aria-keyshortcuts'),'');e.lang.value='zh-TW';e.lang.onchange();redo.onclick();assert.equal(e['bookmark-clear-target-return-target'].textContent,'已清除目標跳轉返回位置');assert.equal(redo.disabled,true);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(redo.getAttribute('aria-keyshortcuts'),'Shift+y');
});

test('independent Undo/Redo clear summaries follow their own target through navigation, filters, restore and redo without exposing drafts',async()=>{
 for(const kind of ['undo','redo']){
  const ui=await clearReturnKeyFixture(kind),e=ui.elements,undo=e['bookmark-undo-clear-target-position-target'],redo=e['bookmark-redo-clear-target-position-target'];const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target'].map(id=>e[id].textContent);const before=history();assert.equal(undo.textContent,'No available target');assert.equal(redo.textContent,'No available target');e['bookmark-clear-target-position'].onclick();assert.equal(undo.textContent,'Target: Frame 1 / 3 · #1');assert.equal(redo.textContent,'No available target');assert.equal(e['bookmark-undo-clear-target-position-action'].hidden,false);
  await showSaved(ui,2);editBookmark(ui,'shown draft stays private',['crossing']);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no match');const calls=ui.pending.length,image=e.rgb.src,note=e['bookmark-note'].value;assert.equal(undo.textContent,'Target: Frame 1 / 3 · #1');assert.equal(pressBookmarkKey(ui,'y').defaultPrevented,true);assert.equal(undo.textContent,'No available target');assert.equal(redo.textContent,'Target: Frame 1 / 3 · #1');assert.equal(e['bookmark-undo-clear-target-position-action'].hidden,true);assert.equal(pressBookmarkKey(ui,'Y',{shiftKey:true}).defaultPrevented,true);assert.equal(undo.textContent,'Target: Frame 1 / 3 · #1');assert.equal(redo.textContent,'No available target');assertShownFrame(ui,2);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,note);assert.equal(ui.pending.length,calls);assert.deepEqual(history(),before);assert.equal(undo.textContent.includes(note),false);assert.equal(redo.textContent.includes(note),false);
  e.lang.value='zh-TW';e.lang.onchange();assert.equal(undo.textContent,'目標: 影格 1 / 3 · #1');e['bookmark-undo-clear-target-position'].onclick();assert.equal(redo.textContent,'目標: 影格 1 / 3 · #1');
 }
});

test('independent clear summaries show sparse saved indices and discard replaced or stale Session targets',async()=>{
 const ui=await startUI({frameIndices:[1,9,15],bookmarks:[bookmarkRecord(1)]}),e=ui.elements,undo=e['bookmark-undo-clear-target-position-target'],redo=e['bookmark-redo-clear-target-position-target'];await showFirst(ui);await deleteForUndo(ui,1);await showSaved(ui,15);let jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;e['bookmark-history-clear-return'].onclick();jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();await completeReplay(ui,15);await jump;e['bookmark-clear-target-position'].onclick();assert.equal(undo.textContent,'Target: Frame 1 / 3 · #1');e['bookmark-undo-clear-target-position'].onclick();assert.equal(redo.textContent,'Target: Frame 1 / 3 · #1');await showSaved(ui,9);jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();await completeReplay(ui,15);await jump;assert.equal(redo.textContent,'No available target');e['bookmark-clear-target-position'].onclick();assert.equal(undo.textContent,'Target: Frame 2 / 3 · #9');e['bookmark-undo-clear-target-position'].onclick();assert.equal(redo.textContent,'Target: Frame 2 / 3 · #9');
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(undo.textContent,'No available target');assert.equal(redo.textContent,'No available target');assert.equal(e['bookmark-undo-clear-target-position-action'].hidden,true);
});

test('independent clear summaries retain known targets with busy markers and recover after modal/hidden/seek/write blocks',async()=>{
 const ui=await clearReturnKeyFixture(),e=ui.elements;e['bookmark-clear-target-position'].onclick();
 for(const kind of ['undo','redo']){
  if(kind==='redo')e['bookmark-undo-clear-target-position'].onclick();const id='bookmark-'+kind+'-clear-target-position',summary=e[id+'-target'];
  for(const block of ['help','hidden','seek']){
   if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
   assert.equal(e[id].disabled,true);assert.equal(summary.textContent,'Target: Frame 1 / 3 · #1 · Temporarily unavailable');e[id].onclick();assert.equal(summary.textContent,'Target: Frame 1 / 3 · #1 · Temporarily unavailable');
   if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(e[id].disabled,false);assert.equal(summary.textContent,'Target: Frame 1 / 3 · #1');
  }
 }
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(e['bookmark-redo-clear-target-position-target'].textContent,'Target: Frame 1 / 3 · #1 · Temporarily unavailable');ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e['bookmark-redo-clear-target-position-target'].textContent,'Target: Frame 1 / 3 · #1');
});

async function independentClearJumpFixture(kind='undo',original='undo'){
 const ui=await clearReturnKeyFixture(original);ui.elements['bookmark-clear-target-position'].onclick();if(kind==='redo')ui.elements['bookmark-undo-clear-target-position'].onclick();return ui;
}
for(const kind of ['undo','redo'])test(kind+' independent clear target jump pauses and preserves both drafts, settings and every original/independent history',async()=>{
 for(const original of ['undo','redo']){
  const ui=await independentClearJumpFixture(kind,original),e=ui.elements,id='bookmark-'+kind+'-clear-target-position';e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no match');e['playback-speed'].value='2';e['playback-speed'].onchange();
  const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target'].map(id=>e[id].textContent),before=history(),writes=bookmarkWrites(ui).length,confirmations=ui.confirmations.length;e['playback-play'].onclick();const calls=replayRequests(ui).length;assert.equal(e[id+'-jump'].disabled,false);assert.match(e[id+'-jump'].getAttribute('aria-label'),/#1/);
  const jumping=e[id+'-jump'].onclick();await flush();assert.match(e['playback-status'].textContent,/Paused/);assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,1);await jumping;
  assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.deepEqual(history(),before);assert.equal(e[id].disabled,false);assert.equal(e[id+'-jump'].disabled,false);assert.equal(e['bookmark-search'].value,'no match');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(ui.document.activeElement,e.result);assert.equal(bookmarkWrites(ui).length,writes);assert.equal(ui.confirmations.length,confirmations);
  await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.deepEqual(history(),before);
 }
});

test('independent clear target jump failures retain shown frame/editor and history, then retry exact snapshot successfully',async()=>{
 for(const kind of ['undo','redo'])for(const mode of ['http','snapshot']){
  const ui=await independentClearJumpFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-target-position',before=e[id+'-target'].textContent,image=e.rgb.src;const jumping=e[id+'-jump'].onclick();await flush();if(mode==='http')ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);else ui.respond('/api/sessions/session-a/frames/1/replay',{...replayResponse('session-a',1),snapshot_sha256:otherHash});await jumping;assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e[id+'-target'].textContent,before);assert.equal(e[id+'-jump'].disabled,false);assert.equal(e[id].disabled,false);
  const retry=e[id+'-jump'].onclick();await flush();await completeReplay(ui,1);await retry;assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e[id+'-target'].textContent,before);assert.equal(bookmarkWrites(ui).length,1);
 }
});

test('independent clear target jumps disable absent, modal, hidden, seeking and writing states without consuming history',async()=>{
 const empty=await startUI();for(const kind of ['undo','redo']){const jump=empty.elements['bookmark-'+kind+'-clear-target-position-jump'];assert.equal(jump.disabled,true);jump.onclick()}assert.equal(replayRequests(empty).length,0);
 for(const kind of ['undo','redo']){
  const ui=await independentClearJumpFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-target-position',calls=replayRequests(ui).length;
  for(const block of ['help','hidden','seek']){
   if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
   assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();assert.equal(replayRequests(ui).length,calls);
   if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(e[id+'-jump'].disabled,false);
  }
  e['bookmark-undo-delete'].onclick();await flush();assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e[id+'-jump'].disabled,false);assert.equal(replayRequests(ui).length,calls);
 }
});

test('late independent clear-target jump replies cannot present old Session frames or restore stale history',async()=>{
 for(const kind of ['undo','redo']){
  const ui=await independentClearJumpFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-target-position';const jumping=e[id+'-jump'].onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await jumping;assert.equal(e.result.hidden,true);assert.equal(e[id+'-jump'].disabled,true);assert.equal(e[id+'-target'].textContent,'No available target');await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');assert.equal(e['bookmark-clear-target-return'].disabled,true);
 }
});

async function targetJumpBackFixture(kind='undo'){
 const ui=await independentClearJumpFixture(kind);const jump=ui.elements['bookmark-'+kind+'-clear-target-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;return ui;
}
for(const kind of ['undo','redo'])test(kind+' target-visit return restores origin with both drafts/settings and all existing histories intact',async()=>{
 for(const playing of [false,true]){
  const ui=await targetJumpBackFixture(kind),e=ui.elements,back=e['bookmark-target-clear-jump-return'];assert.equal(back.disabled,false);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'Target: Frame 3 / 3 · #3');e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no match');e['playback-speed'].value='2';e['playback-speed'].onchange();editBookmark(ui,'edited target draft',['crossing']);
  const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target'].map(id=>e[id].textContent),before=history(),writes=bookmarkWrites(ui).length,confirmations=ui.confirmations.length;if(playing)e['playback-play'].onclick();const calls=replayRequests(ui).length;const returning=back.onclick();await flush();assert.equal(back.disabled,true);back.onclick();assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,3);await returning;
  assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.deepEqual(history(),before);assert.equal(back.disabled,true);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'No available target');assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-search'].value,'no match');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(bookmarkWrites(ui).length,writes);assert.equal(ui.confirmations.length,confirmations);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'edited target draft');assert.equal(e['bookmark-tag-crossing'].checked,true);
 }
});

test('target-visit return retains its position and shown drafts after HTTP/hash failures and retries successfully',async()=>{
 for(const mode of ['http','snapshot']){
  const ui=await targetJumpBackFixture('redo'),e=ui.elements,back=e['bookmark-target-clear-jump-return'],image=e.rgb.src;editBookmark(ui,'kept target draft',['crossing']);const returning=back.onclick();await flush();if(mode==='http')ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);else ui.respond('/api/sessions/session-a/frames/3/replay',{...replayResponse('session-a',3),snapshot_sha256:otherHash});await returning;assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'kept target draft');assert.equal(back.disabled,false);assert.match(e['bookmark-target-clear-jump-return-target'].textContent,/#3$/);assert.equal(e['bookmark-redo-clear-target-position'].disabled,false);const retry=back.onclick();await flush();await completeReplay(ui,3);await retry;assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(back.disabled,true);
 }
});

test('target-visit origin changes only after a successful different-frame target jump and survives clear/undo/redo actions',async()=>{
 const ui=await targetJumpBackFixture('redo'),e=ui.elements,id='bookmark-redo-clear-target-position',summary=e['bookmark-target-clear-jump-return-target'];let jump=e[id+'-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.match(summary.textContent,/#3$/);await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);jump=e[id+'-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.match(summary.textContent,/#2$/);await showSaved(ui,3);jump=e[id+'-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await jump;assert.match(summary.textContent,/#2$/);
 e['bookmark-redo-clear-target-position'].onclick();e['bookmark-undo-clear-target-position'].onclick();e['bookmark-history-redo-clear'].onclick();e['bookmark-history-undo-clear'].onclick();assert.match(summary.textContent,/#2$/);e.lang.value='zh-TW';e.lang.onchange();assert.equal(summary.textContent,'目標: 影格 2 / 3 · #2');const returning=e['bookmark-target-clear-jump-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(e['bookmark-note'].value,'second origin draft');assert.equal(e['bookmark-redo-clear-target-position'].disabled,false);assert.equal(e['bookmark-history-redo-clear'].disabled,false);
});

test('target-visit return disables missing/modal/hidden/seek/write states and rejects delayed replies after Session reset',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-target-clear-jump-return'].disabled,true);empty.elements['bookmark-target-clear-jump-return'].onclick();assert.equal(replayRequests(empty).length,0);const ui=await targetJumpBackFixture(),e=ui.elements,back=e['bookmark-target-clear-jump-return'];
 for(const block of ['help','hidden','seek']){
  if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
  const calls=replayRequests(ui).length;assert.equal(back.disabled,true);back.onclick();assert.equal(replayRequests(ui).length,calls);
  if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(back.disabled,false);
 }
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(back.disabled,true);back.onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(back.disabled,false);const returning=back.onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await returning;assert.equal(e.result.hidden,true);assert.equal(back.disabled,true);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'No available target');await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
});

test('target jump without a complete shown origin does not create a return point or accept its cancelled manual reply',async()=>{
 const ui=await independentClearJumpFixture(),e=ui.elements;e['frames-list'].value='2';const manual=e.replay.onclick();await flush();assert.equal(e.result.hidden,true);const jump=e['bookmark-undo-clear-target-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await manual;assertShownFrame(ui,1);assert.equal(e['bookmark-target-clear-jump-return'].disabled,true);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'No available target');assert.equal(e['bookmark-undo-clear-target-position'].disabled,false);
});

for(const key of ['g','G'])test(key+' returns from either independent clear-target visit with drafts/settings and existing histories preserved',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await targetJumpBackFixture(kind),e=ui.elements;configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();
  const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target'].map(id=>e[id].textContent),before=history(),writes=bookmarkWrites(ui).length,confirmations=ui.confirmations.length;if(playing)e['playback-play'].onclick();const calls=replayRequests(ui).length;
  assert.equal(pressBookmarkKey(ui,key).defaultPrevented,true);await flush();assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);assert.equal(replayRequests(ui).length,calls+1);assert.match(e['playback-status'].textContent,/Paused/);await completeReplay(ui,3);await flush();assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.deepEqual(history(),before);assert.equal(e['bookmark-target-clear-jump-return'].disabled,true);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'No available target');assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(bookmarkWrites(ui).length,writes);assert.equal(ui.confirmations.length,confirmations);assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);
 }
});

test('G preserves native note/search/composed/active editor input and ignores IME, modifiers, repeated/hidden events, opt-out and help',async()=>{
 const ui=await targetJumpBackFixture(),e=ui.elements,calls=ui.pending.length;const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'g',{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'g',{composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'g',{target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'g',props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'g',{defaultPrevented:true}).defaultPrevented,true);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'g').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'g').defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'g').defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-target-clear-jump-return'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'g').defaultPrevented,false);assert.equal(e['bookmark-target-clear-jump-return'].disabled,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-target-clear-jump-return'].getAttribute('aria-keyshortcuts'),'g');assert.equal(ui.pending.length,calls);assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');
});

test('G leaves missing/pending seek/jump/write states alone and rejects old Session replies after keyboard return',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'g').defaultPrevented,false);const ui=await targetJumpBackFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'g').defaultPrevented,false);e['playback-pause'].onclick();const jump=e['bookmark-undo-clear-target-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'g').defaultPrevented,false);await completeReplay(ui,1);await jump;e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'g').defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(pressBookmarkKey(ui,'g').defaultPrevented,true);await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();assert.equal(e.result.hidden,true);assert.equal(pressBookmarkKey(ui,'g').defaultPrevented,false);assert.equal(e['bookmark-target-clear-jump-return'].disabled,true);await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
});

for(const key of ['g','G'])test('Shift '+key+' clears only the visit-return position while preserving image/drafts/playback and all existing histories',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await targetJumpBackFixture(kind),e=ui.elements;configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target'].map(id=>e[id].textContent),before=history(),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;
  assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);await flush();assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);assert.equal(e['bookmark-target-clear-jump-return'].disabled,true);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position cleared');assert.equal(pressBookmarkKey(ui,'g').defaultPrevented,false);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);
 }
});

test('Shift G clearing ignores note/search/composed/active editors, IME, modifiers, repeated/hidden events, opt-out and help',async()=>{
 const ui=await targetJumpBackFixture(),e=ui.elements,calls=ui.pending.length;const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('Shift+g'));assert.equal(e['bookmark-target-clear-jump-return'].disabled,false);assert.equal(ui.pending.length,calls);
});

test('Shift G clearing leaves missing, pending seek/jump/write/return and reset positions alone',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'G',{shiftKey:true}).defaultPrevented,false);const ui=await targetJumpBackFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,false);e['playback-pause'].onclick();const jump=e['bookmark-undo-clear-target-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,1);await jump;e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const returning=e['bookmark-target-clear-jump-return'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);await returning;assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,false);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,false);
});

test('Shift G keeps both drafts, lets later visits create a new return and does not cancel pending autoplay presentation',async()=>{
 const ui=await targetJumpBackFixture('redo'),e=ui.elements;assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,true);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');const jump=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-target-clear-jump-return'].disabled,false);assert.match(e['bookmark-target-clear-jump-return-target'].textContent,/#3$/);configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent;assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,true);assert.equal(e['playback-status'].textContent,status);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-target-clear-jump-return'].disabled,true);assert.equal(e['bookmark-redo-clear-target-position'].disabled,false);
});


test('visit-return clear button works with shortcuts off and preserves drafts, playback and existing histories',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await targetJumpBackFixture(kind),e=ui.elements,clear=e['bookmark-clear-target-jump-position'];assert.equal(clear.disabled,false);e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(clear.getAttribute('aria-keyshortcuts'),'');configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target'].map(id=>e[id].textContent),before=history(),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;
  clear.onclick();await flush();assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);assert.equal(e['bookmark-target-clear-jump-return'].disabled,true);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position cleared');assert.equal(pressBookmarkKey(ui,'g').defaultPrevented,false);assert.equal(clear.disabled,true);clear.onclick();assert.equal(ui.pending.length,calls);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(clear.getAttribute('aria-keyshortcuts'),'Shift+g');assert.ok(fs.readFileSync(path.join(root,'static/sessions.html'),'utf8').includes('id="bookmark-clear-target-jump-position" data-i="bookmarkClearTargetJumpPosition"'));
 }
});

test('visit-return clear button disables for absent, busy, hidden, modal and consumed positions without clearing them',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-clear-target-jump-position'].disabled,true);empty.elements['bookmark-clear-target-jump-position'].onclick();assert.equal(replayRequests(empty).length,0);
 const ui=await targetJumpBackFixture(),e=ui.elements,clear=e['bookmark-clear-target-jump-position'];
 const blocked=()=>{assert.equal(clear.disabled,true);clear.onclick();assert.match(e['bookmark-target-clear-jump-return-target'].textContent,/#3/)};
 e['shortcut-help-open'].onclick();blocked();e['shortcut-help-close'].onclick();assert.equal(clear.disabled,false);
 ui.hide();blocked();ui.document.hidden=false;ui.dispatch('visibilitychange');assert.equal(clear.disabled,false);
 e['replay-progress'].value='2';e['replay-progress'].oninput();blocked();e['playback-pause'].onclick();assert.equal(clear.disabled,false);
 e['bookmark-undo-delete'].onclick();await flush();blocked();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(clear.disabled,false);
 const returning=e['bookmark-target-clear-jump-return'].onclick();await flush();blocked();await completeReplay(ui,3);await returning;assert.equal(clear.disabled,true);clear.onclick();assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'No available target');
});

test('visit-return clear button preserves pending autoplay, both drafts and allows a new return until Session reset',async()=>{
 const ui=await targetJumpBackFixture('redo'),e=ui.elements,clear=e['bookmark-clear-target-jump-position'];e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent;assert.equal(clear.disabled,false);clear.onclick();assert.equal(e['playback-status'].textContent,status);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(clear.disabled,true);e['playback-pause'].onclick();await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');const jump=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();assert.equal(clear.disabled,true);await completeReplay(ui,1);await jump;assert.equal(e['bookmark-note'].value,'target draft');assert.equal(clear.disabled,false);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(clear.disabled,true);clear.onclick();assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'No available target');
});

test('button and Shift G clearing announce the same localized live notice without disturbing drafts or existing histories',async()=>{
 for(const action of ['button','key']){
  const ui=await targetJumpBackFixture('redo'),e=ui.elements,summary=e['bookmark-target-clear-jump-return-target'];
  const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target'].map(id=>e[id].textContent),before=history(),calls=ui.pending.length,image=e.rgb.src;
  if(action==='button'){e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();e['bookmark-clear-target-jump-position'].onclick()}else assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,true);
  assert.equal(summary.textContent,'This target-jump return position cleared');assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.deepEqual(history(),before);assert.equal(ui.pending.length,calls);assert.equal(e['bookmark-clear-target-jump-position'].disabled,true);assert.equal(e['bookmark-target-clear-jump-return'].disabled,true);
  e['bookmark-clear-target-jump-position'].onclick();assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,false);searchBookmarkNotes(ui,'kept filter');filterBookmarkTag(ui,'general');e['shortcut-help-open'].onclick();e['shortcut-help-close'].onclick();assert.equal(summary.textContent,'This target-jump return position cleared');
  e.lang.value='zh-TW';e.lang.onchange();assert.equal(summary.textContent,'已清除本次目標跳轉返回位置');e.lang.value='en';e.lang.onchange();assert.equal(summary.textContent,'This target-jump return position cleared');await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(summary.textContent,'This target-jump return position cleared');await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(summary.textContent,'This target-jump return position cleared');
 }
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/id="bookmark-target-clear-jump-return-target"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);assert.match(html,/Successful button or Shift\+G clearing shows/);
});

test('visit-return cleared notice survives failed target visits and autoplay, and resets for new positions and Session reload',async()=>{
 const ui=await targetJumpBackFixture('redo'),e=ui.elements,summary=e['bookmark-target-clear-jump-return-target'];e['bookmark-clear-target-jump-position'].onclick();configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);await completeReplay(ui,2);assert.equal(summary.textContent,'This target-jump return position cleared');e['playback-pause'].onclick();await showSaved(ui,3);
 let jump=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await jump;assert.equal(summary.textContent,'This target-jump return position cleared');assert.equal(e['bookmark-clear-target-jump-position'].disabled,true);
 jump=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.equal(summary.textContent,'Target: Frame 3 / 3 · #3');const returning=e['bookmark-target-clear-jump-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(summary.textContent,'No available target');
 jump=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;e['bookmark-clear-target-jump-position'].onclick();assert.equal(summary.textContent,'This target-jump return position cleared');const reload=e.refresh.onclick();await flush();ui.respond('/api/sessions/status',{tracking_worker_configured:true});await flush();ui.respond('/api/sessions',{sessions:[{session_id:'session-a',label:'A',frame_count:3}]});await flush();await finishFrames(ui,'session-a',true,null,[1,2,3],[]);await reload;assert.equal(summary.textContent,'No available target');
});

test('unavailable or blocked clear actions never announce visit-return clear success',async()=>{
 const empty=await startUI();empty.elements['bookmark-clear-target-jump-position'].onclick();pressBookmarkKey(empty,'G',{shiftKey:true});assert.equal(empty.elements['bookmark-target-clear-jump-return-target'].textContent,'No available target');
 const ui=await targetJumpBackFixture(),e=ui.elements,summary=e['bookmark-target-clear-jump-return-target'];
 for(const mode of ['help','seek','hidden']){
  if(mode==='help')e['shortcut-help-open'].onclick();else if(mode==='seek'){e['replay-progress'].value='2';e['replay-progress'].oninput()}else ui.hide();
  e['bookmark-clear-target-jump-position'].onclick();assert.equal(pressBookmarkKey(ui,'G',{shiftKey:true}).defaultPrevented,false);assert.match(summary.textContent,/#3/);assert.doesNotMatch(summary.textContent,/cleared/);
  if(mode==='help')e['shortcut-help-close'].onclick();else if(mode==='seek')e['playback-pause'].onclick();else{ui.document.hidden=false;ui.dispatch('visibilitychange')}
 }
 assert.equal(e['bookmark-clear-target-jump-position'].disabled,false);
});

test('undo visit-return clearing restores only its saved position with shortcuts off, keeping all drafts, playback and older histories',async()=>{
 for(const action of ['button','key'])for(const playing of [false,true]){
  const ui=await targetJumpBackFixture('redo'),e=ui.elements,undo=e['bookmark-undo-clear-target-jump-position'];assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);
  if(action==='key')pressBookmarkKey(ui,'G',{shiftKey:true});else e['bookmark-clear-target-jump-position'].onclick();assert.equal(undo.hidden,false);assert.equal(undo.disabled,false);e['bookmark-clear-target-jump-position'].onclick();
  e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();e.result.focus();
  const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target'].map(id=>e[id].textContent),before=history(),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;
  undo.onclick();assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);assert.equal(e['bookmark-target-clear-jump-return'].disabled,false);assert.equal(e['bookmark-clear-target-jump-position'].disabled,false);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position restored · Target: Frame 3 / 3 · #3');undo.onclick();assert.equal(ui.pending.length,calls);
  const returning=e['bookmark-target-clear-jump-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.deepEqual(history(),before);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);
 }
});

test('undo visit-return clear leaves pending automatic presentation running and permits another clear/undo cycle',async()=>{
 const ui=await targetJumpBackFixture(),e=ui.elements,undo=e['bookmark-undo-clear-target-jump-position'];pressBookmarkKey(ui,'G',{shiftKey:true});configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent;assert.equal(undo.disabled,false);undo.onclick();assert.equal(e['playback-status'].textContent,status);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-target-clear-jump-return'].disabled,false);e['playback-pause'].onclick();e['bookmark-clear-target-jump-position'].onclick();assert.equal(undo.hidden,false);assert.equal(undo.disabled,false);undo.onclick();assert.match(e['bookmark-target-clear-jump-return-target'].textContent,/#3$/);
});

test('undo visit-return clear is guarded while busy or hidden and Session reload discards the backup',async()=>{
 const empty=await startUI();empty.elements['bookmark-undo-clear-target-jump-position'].onclick();assert.equal(replayRequests(empty).length,0);const ui=await targetJumpBackFixture(),e=ui.elements,undo=e['bookmark-undo-clear-target-jump-position'];e['bookmark-clear-target-jump-position'].onclick();
 const blocked=()=>{assert.equal(undo.disabled,true);undo.onclick();assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position cleared')};
 e['shortcut-help-open'].onclick();blocked();e['shortcut-help-close'].onclick();ui.hide();blocked();ui.document.hidden=false;ui.dispatch('visibilitychange');e['replay-progress'].value='2';e['replay-progress'].oninput();blocked();e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();blocked();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(undo.disabled,false);
 const reload=e.refresh.onclick();await flush();ui.respond('/api/sessions/status',{tracking_worker_configured:true});await flush();ui.respond('/api/sessions',{sessions:[{session_id:'session-a',label:'A',frame_count:3}]});await flush();await finishFrames(ui,'session-a',true,null,[1,2,3],[]);await reload;assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);undo.onclick();assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'No available target');
});

test('failed or same-frame visits keep the cleared backup, while a new return point discards it',async()=>{
 const ui=await targetJumpBackFixture('redo'),e=ui.elements,undo=e['bookmark-undo-clear-target-jump-position'];e['bookmark-clear-target-jump-position'].onclick();let jump=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.equal(undo.disabled,false);assert.equal(undo.hidden,false);await showSaved(ui,2);jump=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();assert.equal(undo.disabled,true);ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await jump;assert.equal(undo.disabled,false);undo.onclick();assert.match(e['bookmark-target-clear-jump-return-target'].textContent,/#3$/);e['bookmark-clear-target-jump-position'].onclick();
 jump=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);undo.onclick();assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'Target: Frame 2 / 3 · #2');e['bookmark-clear-target-jump-position'].onclick();assert.equal(undo.disabled,false);undo.onclick();const returning=e['bookmark-target-clear-jump-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/id="bookmark-undo-clear-target-jump-position-action"[^>]*><button id="bookmark-undo-clear-target-jump-position"[^>]*data-i="bookmarkHistoryUndoClear"[^>]*aria-describedby="bookmark-undo-clear-target-jump-position-target bookmark-history-help"[^>]*hidden disabled>/);
});

test('restored visit-return notice is localized, survives review/navigation/autoplay and remains independent of older histories',async()=>{
 const ui=await targetJumpBackFixture('redo'),e=ui.elements,summary=e['bookmark-target-clear-jump-return-target'];
 const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target'].map(id=>e[id].textContent),before=history();e['bookmark-clear-target-jump-position'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();e['bookmark-undo-clear-target-jump-position'].onclick();assert.equal(summary.textContent,'This target-jump return position restored · Target: Frame 3 / 3 · #3');assert.deepEqual(history(),before);assert.equal(e['bookmark-note'].value,'target draft');e.lang.value='zh-TW';e.lang.onchange();assert.equal(summary.textContent,'已恢復本次目標跳轉返回位置 · 目標: 影格 3 / 3 · #3');e.lang.value='en';e.lang.onchange();searchBookmarkNotes(ui,'retained query');filterBookmarkTag(ui,'general');e['shortcut-help-open'].onclick();e['shortcut-help-close'].onclick();assert.equal(summary.textContent,'This target-jump return position restored · Target: Frame 3 / 3 · #3');
 configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(summary.textContent,'This target-jump return position restored · Target: Frame 3 / 3 · #3');e['playback-pause'].onclick();await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.match(summary.textContent,/restored/);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.match(summary.textContent,/restored/);assert.deepEqual(history(),before);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/Successful Undo clear shows “This target-jump return position restored”/);assert.match(html,/id="bookmark-target-clear-jump-return-target"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
});

test('restored visit-return notice follows successful undo only and resets for clearing, new positions, consumed return and Session changes',async()=>{
 const ui=await targetJumpBackFixture('redo'),e=ui.elements,summary=e['bookmark-target-clear-jump-return-target'],undo=e['bookmark-undo-clear-target-jump-position'];undo.onclick();assert.doesNotMatch(summary.textContent,/restored/);e['bookmark-clear-target-jump-position'].onclick();e['shortcut-help-open'].onclick();undo.onclick();assert.equal(summary.textContent,'This target-jump return position cleared');e['shortcut-help-close'].onclick();undo.onclick();assert.match(summary.textContent,/restored/);
 let returning=e['bookmark-target-clear-jump-return'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);await returning;assert.match(summary.textContent,/restored/);assert.equal(e['bookmark-note'].value,'target draft');e['bookmark-clear-target-jump-position'].onclick();assert.equal(summary.textContent,'This target-jump return position cleared');undo.onclick();assert.match(summary.textContent,/restored/);await showSaved(ui,2);const jump=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.equal(summary.textContent,'Target: Frame 2 / 3 · #2');
 e['bookmark-clear-target-jump-position'].onclick();undo.onclick();assert.match(summary.textContent,/restored/);returning=e['bookmark-target-clear-jump-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(summary.textContent,'No available target');
 const again=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();await completeReplay(ui,1);await again;e['bookmark-clear-target-jump-position'].onclick();undo.onclick();assert.match(summary.textContent,/restored/);e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(summary.textContent,'No available target');undo.onclick();assert.doesNotMatch(summary.textContent,/restored/);
});


for(const key of ['h','H'])test(key+' restores the cleared visit-return point and notice while preserving drafts, playback and all older histories',async()=>{
 for(const action of ['button','key'])for(const playing of [false,true]){
  const ui=await targetJumpBackFixture('redo'),e=ui.elements,undo=e['bookmark-undo-clear-target-jump-position'];assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);
  if(action==='key')pressBookmarkKey(ui,'G',{shiftKey:true});else e['bookmark-clear-target-jump-position'].onclick();assert.equal(undo.hidden,false);assert.equal(undo.disabled,false);e['bookmark-clear-target-jump-position'].onclick();
  configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();e.result.focus();
  const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target'].map(id=>e[id].textContent),before=history(),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;
  assert.equal(pressBookmarkKey(ui,key).defaultPrevented,true);assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);assert.equal(e['bookmark-target-clear-jump-return'].disabled,false);assert.equal(e['bookmark-clear-target-jump-position'].disabled,false);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position restored · Target: Frame 3 / 3 · #3');assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);assert.equal(ui.pending.length,calls);
  const returning=e['bookmark-target-clear-jump-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.deepEqual(history(),before);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);
 }
});

async function clearedVisitKeyFixture(){const ui=await targetJumpBackFixture('redo');ui.elements['bookmark-clear-target-jump-position'].onclick();return ui}

test('H leaves native, custom, composed-path and active editors alone and guards IME, modifiers, repeat, visibility, dialogs and opt-out',async()=>{
 const ui=await clearedVisitKeyFixture(),e=ui.elements,calls=ui.pending.length,undo=e['bookmark-undo-clear-target-jump-position'];assert.equal(undo.getAttribute('aria-keyshortcuts'),'h');const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'h',{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'h',{composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'h',{target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'h',props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'h',{defaultPrevented:true}).defaultPrevented,true);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'H').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(undo.getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,false);assert.equal(undo.disabled,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(undo.getAttribute('aria-keyshortcuts'),'h');assert.equal(ui.pending.length,calls);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position cleared');assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>H<\/kbd>.*data-i="shortcutHelpUndoClearTargetJumpPosition"/);
});

test('H leaves missing, pending seek/write/jump and reset backups alone',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'h').defaultPrevented,false);const ui=await clearedVisitKeyFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();await showSaved(ui,2);const jump=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await jump;assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,true);e['bookmark-clear-target-jump-position'].onclick();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,false);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'No available target');
});

test('H restores during pending autoplay without cancelling presentation or changing the saved return target',async()=>{
 const ui=await clearedVisitKeyFixture(),e=ui.elements;configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent;assert.equal(pressBookmarkKey(ui,'H').defaultPrevented,true);assert.equal(e['playback-status'].textContent,status);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position restored · Target: Frame 3 / 3 · #3');await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-target-clear-jump-return'].disabled,false);assert.match(e['bookmark-target-clear-jump-return-target'].textContent,/restored.*#3$/);
});


for(const key of ['h','H'])test('Shift '+key+' redoes clearing only the restored visit-return position while preserving image/drafts/playback and all existing histories',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await targetJumpBackFixture(kind),e=ui.elements;e['bookmark-clear-target-jump-position'].onclick();assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,true);configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target'].map(id=>e[id].textContent),before=history(),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;
  assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);await flush();assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);assert.equal(e['bookmark-target-clear-jump-return'].disabled,true);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position cleared');assert.equal(e['bookmark-undo-clear-target-jump-position'].disabled,false);assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,true);assert.equal(e['bookmark-target-clear-jump-return'].disabled,false);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);
 }
});

async function restoredVisitKeyFixture(){const ui=await clearedVisitKeyFixture();assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,true);return ui}

test('Shift H respects native/custom/composed/active editors, IME and modifiers, opt-out and dialog guards',async()=>{
 const ui=await restoredVisitKeyFixture(),e=ui.elements,calls=ui.pending.length;const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('Shift+h'));assert.equal(ui.pending.length,calls);assert.match(e['bookmark-target-clear-jump-return-target'].textContent,/restored.*#3$/);assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>Shift<\/kbd> \+ <kbd>H<\/kbd><\/dt><dd data-i="shortcutHelpRedoClearTargetJumpPosition"/);
});

test('Shift H leaves new, missing, busy, consumed and Session-reset positions without restored eligibility alone',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'H',{shiftKey:true}).defaultPrevented,false);const fresh=await targetJumpBackFixture();assert.equal(pressBookmarkKey(fresh,'H',{shiftKey:true}).defaultPrevented,false);const ui=await restoredVisitKeyFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const returning=e['bookmark-target-clear-jump-return'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);await returning;assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,false);
 const jump=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,1);await jump;assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,false);e['bookmark-clear-target-jump-position'].onclick();pressBookmarkKey(ui,'h');e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,false);
});

test('Shift H leaves pending autoplay running and H restores the same exact position again',async()=>{
 const ui=await restoredVisitKeyFixture(),e=ui.elements;configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent;assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,true);assert.equal(e['playback-status'].textContent,status);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position cleared');await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,true);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position restored · Target: Frame 3 / 3 · #3');assert.equal(e['playback-status'].textContent,status);
});


test('visit-return redo-clear button works with shortcuts off, preserving drafts/playback and all existing histories',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await targetJumpBackFixture(kind),e=ui.elements;e['bookmark-clear-target-jump-position'].onclick();assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,true);const redo=e['bookmark-redo-clear-target-jump-position'];assert.equal(redo.disabled,false);e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(redo.getAttribute('aria-keyshortcuts'),'');configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target'].map(id=>e[id].textContent),before=history(),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;
  redo.onclick();await flush();assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);assert.equal(e['bookmark-target-clear-jump-return'].disabled,true);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position cleared');assert.equal(e['bookmark-undo-clear-target-jump-position'].disabled,false);assert.equal(redo.disabled,true);redo.onclick();e['bookmark-undo-clear-target-jump-position'].onclick();assert.equal(redo.disabled,false);assert.equal(e['bookmark-target-clear-jump-return'].disabled,false);redo.onclick();assert.equal(redo.disabled,true);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position cleared');assert.equal(ui.pending.length,calls);
 }
});

test('visit-return redo-clear button guards missing, fresh, busy, consumed, replaced and Session-reset positions',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-redo-clear-target-jump-position'].disabled,true);empty.elements['bookmark-redo-clear-target-jump-position'].onclick();assert.equal(replayRequests(empty).length,0);const fresh=await targetJumpBackFixture();assert.equal(fresh.elements['bookmark-redo-clear-target-jump-position'].disabled,true);fresh.elements['bookmark-redo-clear-target-jump-position'].onclick();assert.match(fresh.elements['bookmark-target-clear-jump-return-target'].textContent,/#3$/);
 const ui=await restoredVisitKeyFixture(),e=ui.elements,redo=e['bookmark-redo-clear-target-jump-position'];const blocked=()=>{assert.equal(redo.disabled,true);redo.onclick();assert.match(e['bookmark-target-clear-jump-return-target'].textContent,/restored.*#3/)};
 e['shortcut-help-open'].onclick();blocked();e['shortcut-help-close'].onclick();ui.hide();blocked();ui.document.hidden=false;ui.dispatch('visibilitychange');e['replay-progress'].value='2';e['replay-progress'].oninput();blocked();e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();blocked();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(redo.disabled,false);
 const returning=e['bookmark-target-clear-jump-return'].onclick();await flush();blocked();await completeReplay(ui,3);await returning;assert.equal(redo.disabled,true);redo.onclick();const jump=e['bookmark-redo-clear-target-position-jump'].onclick();await flush();assert.equal(redo.disabled,true);await completeReplay(ui,1);await jump;assert.equal(redo.disabled,true);redo.onclick();assert.match(e['bookmark-target-clear-jump-return-target'].textContent,/^Target:.*#3$/);e['bookmark-clear-target-jump-position'].onclick();e['bookmark-undo-clear-target-jump-position'].onclick();assert.equal(redo.disabled,false);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(redo.disabled,true);redo.onclick();assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'No available target');
});

test('visit-return redo-clear button shares Shift H metadata/eligibility and preserves pending autoplay',async()=>{
 const ui=await restoredVisitKeyFixture(),e=ui.elements,redo=e['bookmark-redo-clear-target-jump-position'];assert.equal(redo.getAttribute('aria-keyshortcuts'),'Shift+h');configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent;redo.onclick();assert.equal(e['playback-status'].textContent,status);assert.equal(redo.disabled,true);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'This target-jump return position cleared');await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,true);assert.equal(redo.disabled,false);assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,true);assert.equal(redo.disabled,true);e['bookmark-undo-clear-target-jump-position'].onclick();assert.equal(redo.disabled,false);e.lang.value='zh-TW';e.lang.onchange();redo.onclick();assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'已清除本次目標跳轉返回位置');assert.equal(redo.disabled,true);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/id="bookmark-redo-clear-target-jump-position"[^>]*data-i="bookmarkHistoryRedoClear"[^>]*aria-describedby="bookmark-redo-clear-target-jump-position-target bookmark-history-help"[^>]*type="button" disabled>/);assert.match(html,/The button works with shortcuts off and disables without an eligible restored position or while busy/);
});

test('visit-return Undo/Redo clear summaries follow their own targets through navigation, filters, undo and redo without exposing drafts',async()=>{
 for(const kind of ['undo','redo']){
  const ui=await targetJumpBackFixture(kind),e=ui.elements,undo=e['bookmark-undo-clear-target-jump-position-target'],redo=e['bookmark-redo-clear-target-jump-position-target'];const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target'].map(id=>e[id].textContent),before=history();assert.equal(undo.textContent,'No available target');assert.equal(redo.textContent,'No available target');e['bookmark-clear-target-jump-position'].onclick();assert.equal(undo.textContent,'Target: Frame 3 / 3 · #3');assert.equal(redo.textContent,'No available target');assert.equal(e['bookmark-undo-clear-target-jump-position-action'].hidden,false);
  await showSaved(ui,2);editBookmark(ui,'shown draft stays private',['crossing']);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no match');const calls=ui.pending.length,image=e.rgb.src,note=e['bookmark-note'].value;assert.equal(undo.textContent,'Target: Frame 3 / 3 · #3');assert.equal(pressBookmarkKey(ui,'h').defaultPrevented,true);assert.equal(undo.textContent,'No available target');assert.equal(redo.textContent,'Target: Frame 3 / 3 · #3');assert.equal(e['bookmark-undo-clear-target-jump-position-action'].hidden,true);assert.equal(pressBookmarkKey(ui,'H',{shiftKey:true}).defaultPrevented,true);assert.equal(undo.textContent,'Target: Frame 3 / 3 · #3');assert.equal(redo.textContent,'No available target');assertShownFrame(ui,2);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,note);assert.equal(ui.pending.length,calls);assert.deepEqual(history(),before);assert.equal(undo.textContent.includes(note),false);assert.equal(redo.textContent.includes(note),false);
  e.lang.value='zh-TW';e.lang.onchange();assert.equal(undo.textContent,'目標: 影格 3 / 3 · #3');e['bookmark-undo-clear-target-jump-position'].onclick();assert.equal(redo.textContent,'目標: 影格 3 / 3 · #3');
 }
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');for(const kind of ['undo','redo']){const id='bookmark-'+kind+'-clear-target-jump-position';assert.ok(html.includes('aria-describedby="'+id+'-target bookmark-history-help"'));assert.ok(html.includes('id="'+id+'-target" class="bookmark-history-target" role="status" aria-live="polite" aria-atomic="true"'))}assert.ok(html.includes('data-i="shortcutHelpTargetJumpClearTargets"'));
});

test('visit-return clear summaries show sparse saved indices and replace or reset only their own targets',async()=>{
 const ui=await startUI({frameIndices:[1,9,15],bookmarks:[bookmarkRecord(1)]}),e=ui.elements,undo=e['bookmark-undo-clear-target-jump-position-target'],redo=e['bookmark-redo-clear-target-jump-position-target'];await showFirst(ui);await deleteForUndo(ui,1);await showSaved(ui,15);let jump=e['bookmark-undo-delete-jump'].onclick();await flush();await completeReplay(ui,1);await jump;e['bookmark-history-clear-return'].onclick();jump=e['bookmark-history-undo-clear-jump'].onclick();await flush();await completeReplay(ui,15);await jump;e['bookmark-clear-target-position'].onclick();jump=e['bookmark-undo-clear-target-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;e['bookmark-clear-target-jump-position'].onclick();assert.equal(undo.textContent,'Target: Frame 3 / 3 · #15');e['bookmark-undo-clear-target-jump-position'].onclick();assert.equal(redo.textContent,'Target: Frame 3 / 3 · #15');await showSaved(ui,9);jump=e['bookmark-undo-clear-target-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.equal(redo.textContent,'No available target');e['bookmark-clear-target-jump-position'].onclick();assert.equal(undo.textContent,'Target: Frame 2 / 3 · #9');e['bookmark-undo-clear-target-jump-position'].onclick();assert.equal(redo.textContent,'Target: Frame 2 / 3 · #9');
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(undo.textContent,'No available target');assert.equal(redo.textContent,'No available target');assert.equal(e['bookmark-undo-clear-target-jump-position-action'].hidden,true);
});

test('visit-return clear summaries retain known blocked targets while modal, hidden, seek and write guards disable actions',async()=>{
 const ui=await clearedVisitKeyFixture(),e=ui.elements;
 for(const kind of ['undo','redo']){
  if(kind==='redo')e['bookmark-undo-clear-target-jump-position'].onclick();const id='bookmark-'+kind+'-clear-target-jump-position',summary=e[id+'-target'];
  for(const block of ['help','hidden','seek']){
   if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
   assert.equal(e[id].disabled,true);assert.equal(summary.textContent,'Target: Frame 3 / 3 · #3 · Temporarily unavailable');e[id].onclick();assert.equal(summary.textContent,'Target: Frame 3 / 3 · #3 · Temporarily unavailable');
   if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(e[id].disabled,false);assert.equal(summary.textContent,'Target: Frame 3 / 3 · #3');
  }
 }
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(e['bookmark-redo-clear-target-jump-position-target'].textContent,'Target: Frame 3 / 3 · #3 · Temporarily unavailable');ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e['bookmark-redo-clear-target-jump-position-target'].textContent,'Target: Frame 3 / 3 · #3');
});

async function visitClearJumpFixture(kind='undo'){
 const ui=await targetJumpBackFixture();ui.elements['bookmark-clear-target-jump-position'].onclick();if(kind==='redo')ui.elements['bookmark-undo-clear-target-jump-position'].onclick();return ui;
}
for(const kind of ['undo','redo'])test(kind+' visit-return clear target jump pauses with both drafts/settings and all existing histories intact',async()=>{
 for(const playing of [false,true]){
  const ui=await visitClearJumpFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-target-jump-position';e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no match');e['playback-speed'].value='2';e['playback-speed'].onchange();editBookmark(ui,'edited displayed draft',['crossing']);
  const history=()=>['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target','bookmark-target-clear-jump-return-target','bookmark-undo-clear-target-jump-position-target','bookmark-redo-clear-target-jump-position-target'].map(id=>e[id].textContent),before=history(),writes=bookmarkWrites(ui).length,confirmations=ui.confirmations.length;if(playing)e['playback-play'].onclick();const calls=replayRequests(ui).length;assert.equal(e[id+'-jump'].disabled,false);assert.match(e[id+'-jump'].getAttribute('aria-label'),/#3/);
  const jumping=e[id+'-jump'].onclick();await flush();assert.match(e['playback-status'].textContent,/Paused/);assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,3);await jumping;
  assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.deepEqual(history(),before);assert.equal(e[id].disabled,false);assert.equal(e[id+'-jump'].disabled,false);assert.equal(e['bookmark-search'].value,'no match');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(ui.document.activeElement,e.result);assert.equal(bookmarkWrites(ui).length,writes);assert.equal(ui.confirmations.length,confirmations);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'edited displayed draft');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.deepEqual(history(),before);
 }
});

test('visit-return clear target HTTP/hash/decode failures keep the shown frame/editor and allow exact retry',async()=>{
 for(const kind of ['undo','redo'])for(const failure of ['http','snapshot','decode']){
  const ui=await visitClearJumpFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-target-jump-position',summary=e[id+'-target'].textContent,visit=e['bookmark-target-clear-jump-return-target'].textContent,image=e.rgb.src;const jumping=e[id+'-jump'].onclick();await flush();
  if(failure==='http')ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);else if(failure==='snapshot')ui.respond('/api/sessions/session-a/frames/3/replay',{...replayResponse('session-a',3),snapshot_sha256:otherHash});else{ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();ui.decode('data:image/png;base64,session-a-3',Error('synthetic decode failure'));ui.decode('data:image/jpeg;base64,session-a-depth-3')}
  await jumping;assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e[id+'-target'].textContent,summary);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,visit);assert.equal(e[id+'-jump'].disabled,false);assert.equal(e[id].disabled,false);const retry=e[id+'-jump'].onclick();await flush();await completeReplay(ui,3);await retry;assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e[id+'-target'].textContent,summary);assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,visit);
 }
});

test('visit-return clear target jumps disable absent/modal/hidden/seek/write states without changing history',async()=>{
 const empty=await startUI();for(const kind of ['undo','redo']){const jump=empty.elements['bookmark-'+kind+'-clear-target-jump-position-jump'];assert.equal(jump.disabled,true);jump.onclick()}assert.equal(replayRequests(empty).length,0);
 for(const kind of ['undo','redo']){
  const ui=await visitClearJumpFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-target-jump-position',calls=replayRequests(ui).length;
  for(const block of ['help','hidden','seek']){
   if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}
   assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();assert.equal(replayRequests(ui).length,calls);
   if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(e[id+'-jump'].disabled,false);
  }
  e['bookmark-undo-delete'].onclick();await flush();assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e[id+'-jump'].disabled,false);assert.equal(replayRequests(ui).length,calls);
 }
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');for(const kind of ['undo','redo'])assert.ok(html.includes('id="bookmark-'+kind+'-clear-target-jump-position-jump" class="bookmark-history-jump" type="button" disabled'));
});

test('late visit-return clear target replies cannot show old Session frames or restore cleared history',async()=>{
 for(const kind of ['undo','redo']){
  const ui=await visitClearJumpFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-target-jump-position';const jumping=e[id+'-jump'].onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await jumping;assert.equal(e.result.hidden,true);assert.equal(e[id+'-jump'].disabled,true);assert.equal(e[id+'-target'].textContent,'No available target');assert.equal(e['bookmark-target-clear-jump-return-target'].textContent,'No available target');await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
 }
});

async function visitClearBackFixture(kind='undo'){
 const ui=await visitClearJumpFixture(kind);const jump=ui.elements['bookmark-'+kind+'-clear-target-jump-position-jump'].onclick();await flush();await completeReplay(ui,3);await jump;return ui;
}
function visitClearOlderHistory(ui){return ['bookmark-history-return-target','bookmark-history-undo-clear-target','bookmark-history-redo-clear-target','bookmark-clear-target-return-target','bookmark-undo-clear-target-position-target','bookmark-redo-clear-target-position-target','bookmark-target-clear-jump-return-target','bookmark-undo-clear-target-jump-position-target','bookmark-redo-clear-target-jump-position-target'].map(id=>ui.elements[id].textContent)}
for(const kind of ['undo','redo'])test(kind+' visit-clear return restores its own origin with drafts/settings and all older histories intact',async()=>{
 for(const playing of [false,true]){
  const ui=await visitClearBackFixture(kind),e=ui.elements,back=e['bookmark-visit-clear-jump-return'];assert.equal(back.disabled,false);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'Target: Frame 1 / 3 · #1');e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no match');e['playback-speed'].value='2';e['playback-speed'].onchange();editBookmark(ui,'edited visited draft',['crossing']);const before=visitClearOlderHistory(ui),writes=bookmarkWrites(ui).length,confirmations=ui.confirmations.length;if(playing)e['playback-play'].onclick();const calls=replayRequests(ui).length;const returning=back.onclick();await flush();assert.equal(back.disabled,true);back.onclick();assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,1);await returning;
  assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.deepEqual(visitClearOlderHistory(ui),before);assert.equal(back.disabled,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'No available target');assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-search'].value,'no match');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(bookmarkWrites(ui).length,writes);assert.equal(ui.confirmations.length,confirmations);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'edited visited draft');assert.equal(e['bookmark-tag-crossing'].checked,true);
 }
});

test('visit-clear return HTTP/hash/decode failures preserve the shown frame/editor and origin for retry',async()=>{
 for(const kind of ['undo','redo'])for(const failure of ['http','snapshot','decode']){
  const ui=await visitClearBackFixture(kind),e=ui.elements,back=e['bookmark-visit-clear-jump-return'],image=e.rgb.src,before=visitClearOlderHistory(ui);editBookmark(ui,'kept visited draft',['crossing']);const returning=back.onclick();await flush();if(failure==='http')ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);else if(failure==='snapshot')ui.respond('/api/sessions/session-a/frames/1/replay',{...replayResponse('session-a',1),snapshot_sha256:otherHash});else{ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();ui.decode('data:image/png;base64,session-a-1',Error('synthetic decode failure'));ui.decode('data:image/jpeg;base64,session-a-depth-1')}await returning;assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'kept visited draft');assert.equal(back.disabled,false);assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/#1$/);assert.deepEqual(visitClearOlderHistory(ui),before);const retry=back.onclick();await flush();await completeReplay(ui,1);await retry;assert.equal(e['bookmark-note'].value,'target draft');assert.equal(back.disabled,true);assert.deepEqual(visitClearOlderHistory(ui),before);
 }
});

test('visit-clear origin changes only on successful different-frame target visits and survives older clear actions',async()=>{
 const ui=await visitClearBackFixture('redo'),e=ui.elements,id='bookmark-redo-clear-target-jump-position',summary=e['bookmark-visit-clear-jump-return-target'];let jump=e[id+'-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.match(summary.textContent,/#1$/);await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);jump=e[id+'-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.match(summary.textContent,/#2$/);await showSaved(ui,1);jump=e[id+'-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);await jump;assert.match(summary.textContent,/#2$/);
 e['bookmark-redo-clear-target-jump-position'].onclick();e['bookmark-undo-clear-target-jump-position'].onclick();e['bookmark-redo-clear-target-position'].onclick();e['bookmark-undo-clear-target-position'].onclick();e['bookmark-history-redo-clear'].onclick();e['bookmark-history-undo-clear'].onclick();assert.match(summary.textContent,/#2$/);e.lang.value='zh-TW';e.lang.onchange();assert.equal(summary.textContent,'目標: 影格 2 / 3 · #2');const before=visitClearOlderHistory(ui),returning=e['bookmark-visit-clear-jump-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(e['bookmark-note'].value,'second origin draft');assert.deepEqual(visitClearOlderHistory(ui),before);
});

test('visit-clear return disables missing/modal/hidden/seek/write states and rejects late old-Session replies',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-visit-clear-jump-return'].disabled,true);empty.elements['bookmark-visit-clear-jump-return'].onclick();assert.equal(replayRequests(empty).length,0);const ui=await visitClearBackFixture(),e=ui.elements,back=e['bookmark-visit-clear-jump-return'];
 for(const block of ['help','hidden','seek']){if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}assert.equal(back.disabled,true);const calls=replayRequests(ui).length;back.onclick();assert.equal(replayRequests(ui).length,calls);if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(back.disabled,false)}
 e['bookmark-undo-delete'].onclick();await flush();assert.equal(back.disabled,true);back.onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(back.disabled,false);const returning=back.onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await returning;assert.equal(e.result.hidden,true);assert.equal(back.disabled,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'No available target');await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
});

test('a visit-clear target jump without a complete origin does not manufacture a return position',async()=>{
 const ui=await visitClearJumpFixture(),e=ui.elements;e['frames-list'].value='2';const manual=e.replay.onclick();await flush();assert.equal(e.result.hidden,true);const jump=e['bookmark-undo-clear-target-jump-position-jump'].onclick();await flush();await completeReplay(ui,3);await jump;ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await manual;assertShownFrame(ui,3);assert.equal(e['bookmark-visit-clear-jump-return'].disabled,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'No available target');assert.equal(e['bookmark-undo-clear-target-jump-position'].disabled,false);
});


for(const key of ['j','J'])test(key+' returns from the clear-target visit with both drafts/settings and all histories intact',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitClearBackFixture(kind),e=ui.elements,back=e['bookmark-visit-clear-jump-return'];assert.equal(back.disabled,false);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'Target: Frame 1 / 3 · #1');configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no match');e['playback-speed'].value='2';e['playback-speed'].onchange();editBookmark(ui,'edited visited draft',['crossing']);const before=visitClearOlderHistory(ui),writes=bookmarkWrites(ui).length,confirmations=ui.confirmations.length;if(playing)e['playback-play'].onclick();const calls=replayRequests(ui).length;const returning=Promise.resolve(pressBookmarkKey(ui,key));await flush();assert.equal(back.disabled,true);assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,1);await returning;
  assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.deepEqual(visitClearOlderHistory(ui),before);assert.equal(back.disabled,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'No available target');assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-search'].value,'no match');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(bookmarkWrites(ui).length,writes);assert.equal(ui.confirmations.length,confirmations);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'edited visited draft');assert.equal(e['bookmark-tag-crossing'].checked,true);
 }
});


test('J preserves native note/search/composed/active editor input and ignores IME, modifiers, repeated/hidden events, opt-out and help',async()=>{
 const ui=await visitClearBackFixture(),e=ui.elements,calls=ui.pending.length;const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'j',{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'j',{composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'j',{target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'j',props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'j',{defaultPrevented:true}).defaultPrevented,true);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'j').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'j').defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'j').defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-visit-clear-jump-return'].getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'j').defaultPrevented,false);assert.equal(e['bookmark-visit-clear-jump-return'].disabled,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-visit-clear-jump-return'].getAttribute('aria-keyshortcuts'),'j');assert.equal(ui.pending.length,calls);assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');
});

test('J leaves missing/seek/write/jump states alone and rejects old Session replies after keyboard return',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'j').defaultPrevented,false);const ui=await visitClearBackFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'j').defaultPrevented,false);e['playback-pause'].onclick();const jump=e['bookmark-undo-clear-target-jump-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'j').defaultPrevented,false);await completeReplay(ui,3);await jump;e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'j').defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(pressBookmarkKey(ui,'j').defaultPrevented,true);await flush();assert.equal(pressBookmarkKey(ui,'j').defaultPrevented,false);e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();assert.equal(e.result.hidden,true);assert.equal(pressBookmarkKey(ui,'j').defaultPrevented,false);assert.equal(e['bookmark-visit-clear-jump-return'].disabled,true);await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>J<\/kbd>.*data-i="bookmarkVisitClearJumpReturn"/);assert.ok(html.includes('press J outside editors'));
});


for(const key of ['j','J'])test('Shift '+key+' clears only the clear-target-visit return position while preserving image/drafts/playback and all existing histories',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitClearBackFixture(kind),e=ui.elements;configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const history=()=>visitClearOlderHistory(ui),before=history(),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;
  assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);await flush();assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.deepEqual(history(),before);assert.equal(e['bookmark-visit-clear-jump-return'].disabled,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'This clear-target visit return position cleared');assert.equal(pressBookmarkKey(ui,'j').defaultPrevented,false);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);
 }
});


test('Shift J clearing ignores note/search/composed/active editors, IME, modifiers, repeated/hidden events, opt-out and help',async()=>{
 const ui=await visitClearBackFixture(),e=ui.elements,calls=ui.pending.length;const editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);
 for(const target of editors){assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);
 ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('Shift+j'));assert.equal(e['bookmark-visit-clear-jump-return'].disabled,false);assert.equal(ui.pending.length,calls);
});

test('Shift J leaves missing, seeking, jumping, writing, returning and Session-reset positions alone',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'J',{shiftKey:true}).defaultPrevented,false);const ui=await visitClearBackFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,false);e['playback-pause'].onclick();const jump=e['bookmark-undo-clear-target-jump-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);await jump;e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const returning=e['bookmark-visit-clear-jump-return'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,1);await returning;assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,false);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,false);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>Shift<\/kbd> \+ <kbd>J<\/kbd><\/dt><dd data-i="shortcutHelpClearVisitClearJumpReturn"/);
});

test('Shift J preserves both drafts, permits a fresh return point and does not cancel pending autoplay presentation',async()=>{
 const ui=await visitClearBackFixture('redo'),e=ui.elements;assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,true);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);const jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-visit-clear-jump-return'].disabled,false);assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/#2$/);configureLoop(ui,2,3);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,before=visitClearOlderHistory(ui);assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,true);assert.equal(e['playback-status'].textContent,status);assert.deepEqual(visitClearOlderHistory(ui),before);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-note'].value,'second origin draft');assert.equal(e['bookmark-visit-clear-jump-return'].disabled,true);assert.equal(e['bookmark-redo-clear-target-jump-position'].disabled,false);
});

test('clear-target visit return clear button works with shortcuts off and preserves drafts/settings/playback/all older history',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitClearBackFixture(kind),e=ui.elements,clear=e['bookmark-clear-visit-jump-position'];assert.equal(clear.disabled,false);assert.equal(clear.getAttribute('aria-keyshortcuts'),'Shift+j');e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(clear.getAttribute('aria-keyshortcuts'),'');configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();const history=visitClearOlderHistory(ui),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent;
  clear.onclick();assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.deepEqual(visitClearOlderHistory(ui),history);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(clear.disabled,true);assert.equal(e['bookmark-visit-clear-jump-return'].disabled,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'This clear-target visit return position cleared');clear.onclick();assert.equal(ui.pending.length,calls);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);
 }
});

test('clear-target visit return clear button guards missing/hidden/dialog/seeking/writing/returning and Session reset positions',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-clear-visit-jump-position'].disabled,true);empty.elements['bookmark-clear-visit-jump-position'].onclick();assert.equal(replayRequests(empty).length,0);const ui=await visitClearBackFixture(),e=ui.elements,clear=e['bookmark-clear-visit-jump-position'];
 const blocked=()=>{clear.onclick();assert.equal(clear.disabled,true);assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/#1/)};
 ui.hide();blocked();ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();blocked();e['shortcut-help-close'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();blocked();e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();blocked();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(clear.disabled,false);const returning=e['bookmark-visit-clear-jump-return'].onclick();await flush();blocked();await completeReplay(ui,1);await returning;assert.equal(clear.disabled,true);
 e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;clear.onclick();assert.equal(clear.disabled,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'No available target');
});

test('clear-target visit return clear button keeps pending autoplay and allows a fresh independent origin',async()=>{
 const ui=await visitClearBackFixture('redo'),e=ui.elements,clear=e['bookmark-clear-visit-jump-position'];clear.onclick();await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);const jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.equal(clear.disabled,false);assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/#2$/);configureLoop(ui,2,3);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,history=visitClearOlderHistory(ui),calls=ui.pending.length;clear.onclick();assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),history);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-note'].value,'second origin draft');assert.equal(clear.disabled,true);assert.equal(e['bookmark-redo-clear-target-jump-position'].disabled,false);
});

test('button and Shift J clear notices match in both languages without changing drafts/frame/playback/history',async()=>{
 for(const action of ['button','j','J'])for(const lang of ['en','zh-TW'])for(const playing of [false,true]){
  const ui=await visitClearBackFixture(),e=ui.elements;e.lang.value=lang;e.lang.onchange();if(action==='button'){e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange()}if(playing)e['playback-play'].onclick();const history=visitClearOlderHistory(ui),image=e.rgb.src,status=e['playback-status'].textContent,calls=ui.pending.length,clouds=ui.cloudUpdates.length;
  if(action==='button')e['bookmark-clear-visit-jump-position'].onclick();else assert.equal(pressBookmarkKey(ui,action,{shiftKey:true}).defaultPrevented,true);
  assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,lang==='en'?'This clear-target visit return position cleared':'已清除這次目標跳轉返回位置');assert.equal(e['bookmark-visit-clear-jump-return'].disabled,true);assert.equal(e['bookmark-clear-visit-jump-position'].disabled,true);assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['playback-status'].textContent,status);assert.deepEqual(visitClearOlderHistory(ui),history);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);
 }
});

test('clear notice survives navigation/same-frame/failed target visits and resets only for a new origin or successful return',async()=>{
 const ui=await visitClearBackFixture('redo'),e=ui.elements,summary=e['bookmark-visit-clear-jump-return-target'];e['bookmark-clear-visit-jump-position'].onclick();assert.match(summary.textContent,/position cleared$/);let jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.match(summary.textContent,/position cleared$/);await showSaved(ui,2);assert.equal(e['bookmark-note'].value,'');editBookmark(ui,'new origin draft',['occlusion']);assert.match(summary.textContent,/position cleared$/);jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic failure'},false,404);await jump;assert.match(summary.textContent,/position cleared$/);assert.equal(e['bookmark-note'].value,'new origin draft');jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.equal(summary.textContent,'Target: Frame 2 / 3 · #2');assert.equal(e['bookmark-note'].value,'origin draft');const returning=e['bookmark-visit-clear-jump-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(summary.textContent,'No available target');assert.equal(e['bookmark-note'].value,'new origin draft');
});

test('missing/blocked/typing/IME clear actions cannot create notice and Session reset discards it',async()=>{
 const empty=await startUI();empty.elements['bookmark-clear-visit-jump-position'].onclick();assert.equal(pressBookmarkKey(empty,'J',{shiftKey:true}).defaultPrevented,false);assert.equal(empty.elements['bookmark-visit-clear-jump-return-target'].textContent,'No available target');const ui=await visitClearBackFixture(),e=ui.elements,summary=e['bookmark-visit-clear-jump-return-target'];for(const props of [{target:e['bookmark-note']},{target:e['bookmark-search']},{isComposing:true},{keyCode:229}]){assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(summary.textContent,'Target: Frame 1 / 3 · #1')}
 e['shortcut-help-open'].onclick();e['bookmark-clear-visit-jump-position'].onclick();assert.match(summary.textContent,/#1/);assert.doesNotMatch(summary.textContent,/position cleared/);e['shortcut-help-close'].onclick();e['bookmark-clear-visit-jump-position'].onclick();assert.match(summary.textContent,/position cleared$/);e.lang.value='zh-TW';e.lang.onchange();assert.equal(summary.textContent,'已清除這次目標跳轉返回位置');e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(summary.textContent,'目前無可操作目標');e['bookmark-clear-visit-jump-position'].onclick();assert.equal(summary.textContent,'目前無可操作目標');
});

test('Undo clear restores only the latest visit return position after button or Shift J with shortcuts off, preserving frame/drafts/settings/history',async()=>{
 for(const kind of ['undo','redo'])for(const action of ['button','key'])for(const playing of [false,true]){
  const ui=await visitClearBackFixture(kind),e=ui.elements,undo=e['bookmark-undo-clear-visit-jump-position'];assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();if(action==='button')e['bookmark-clear-visit-jump-position'].onclick();else assert.equal(pressBookmarkKey(ui,'J',{shiftKey:true}).defaultPrevented,true);assert.equal(undo.hidden,false);assert.equal(undo.disabled,false);e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();e.result.focus();const history=visitClearOlderHistory(ui),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;
  undo.onclick();assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);assert.equal(e['bookmark-visit-clear-jump-return'].disabled,false);assert.equal(e['bookmark-clear-visit-jump-position'].disabled,false);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'This clear-target visit return position restored · Target: Frame 1 / 3 · #1');assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assert.equal(e['playback-speed'].value,'2');assertLoopValues(ui,1,2,true);assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.deepEqual(visitClearOlderHistory(ui),history);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);undo.onclick();assert.equal(ui.pending.length,calls);
  const back=e['bookmark-visit-clear-jump-return'].onclick();await flush();await completeReplay(ui,1);await back;assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.deepEqual(visitClearOlderHistory(ui),history);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');
 }
});

test('Undo clear retains its backup through blocked actions and pending autoplay without changing older histories',async()=>{
 const empty=await startUI();empty.elements['bookmark-undo-clear-visit-jump-position'].onclick();assert.equal(empty.elements['bookmark-undo-clear-visit-jump-position'].hidden,true);const ui=await visitClearBackFixture('redo'),e=ui.elements,undo=e['bookmark-undo-clear-visit-jump-position'];e['bookmark-clear-visit-jump-position'].onclick();const blocked=()=>{undo.onclick();assert.equal(undo.disabled,true);assert.equal(undo.hidden,false);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'This clear-target visit return position cleared')};ui.hide();blocked();ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();blocked();e['shortcut-help-close'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();blocked();e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();blocked();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(undo.disabled,false);
 configureLoop(ui,2,3);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,calls=ui.pending.length,history=visitClearOlderHistory(ui);undo.onclick();assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),history);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-visit-clear-jump-return'].disabled,false);assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/#1$/);
});

test('Undo clear cannot overwrite a new return point and Session reset discards only its local backup',async()=>{
 const ui=await visitClearBackFixture('redo'),e=ui.elements,undo=e['bookmark-undo-clear-visit-jump-position'];e['bookmark-clear-visit-jump-position'].onclick();let jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();assert.equal(undo.disabled,true);undo.onclick();await completeReplay(ui,3);await jump;assert.equal(undo.disabled,false);await showSaved(ui,2);jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.equal(undo.hidden,true);undo.onclick();assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'Target: Frame 2 / 3 · #2');e['bookmark-clear-visit-jump-position'].onclick();assert.equal(undo.hidden,false);undo.onclick();assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/#2$/);e['bookmark-clear-visit-jump-position'].onclick();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);undo.onclick();assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'No available target');assert.equal(e['bookmark-visit-clear-jump-return'].disabled,true);
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/id="bookmark-undo-clear-visit-jump-position"[^>]*data-i="bookmarkHistoryUndoClear"[^>]*type="button" hidden disabled/);assert.ok(html.includes('Undo restores only the last cleared position'));
});

test('successful Undo clear shows localized restored notice and target while keeping frame/drafts/playback/all older history',async()=>{
 for(const lang of ['en','zh-TW'])for(const action of ['button','key'])for(const playing of [false,true]){
  const ui=await visitClearBackFixture(),e=ui.elements;e.lang.value=lang;e.lang.onchange();if(action==='button')e['bookmark-clear-visit-jump-position'].onclick();else pressBookmarkKey(ui,'J',{shiftKey:true});e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();if(playing)e['playback-play'].onclick();const image=e.rgb.src,status=e['playback-status'].textContent,history=visitClearOlderHistory(ui),calls=ui.pending.length,clouds=ui.cloudUpdates.length;e['bookmark-undo-clear-visit-jump-position'].onclick();assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,lang==='en'?'This clear-target visit return position restored · Target: Frame 1 / 3 · #1':'已恢復這次目標跳轉返回位置 · 目標: 影格 1 / 3 · #1');assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['playback-status'].textContent,status);assert.deepEqual(visitClearOlderHistory(ui),history);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(e['bookmark-undo-clear-visit-jump-position'].hidden,true);assert.equal(e['bookmark-visit-clear-jump-return'].disabled,false);
 }
});

test('restored notice survives ordinary/same-frame/failed navigation and resets on new origin, clear or successful return',async()=>{
 const ui=await visitClearBackFixture('redo'),e=ui.elements,summary=e['bookmark-visit-clear-jump-return-target'];e['bookmark-clear-visit-jump-position'].onclick();e['bookmark-undo-clear-visit-jump-position'].onclick();assert.match(summary.textContent,/position restored/);let jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.match(summary.textContent,/position restored/);await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);assert.match(summary.textContent,/position restored/);jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic failure'},false,404);await jump;assert.match(summary.textContent,/position restored/);let back=e['bookmark-visit-clear-jump-return'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic failure'},false,404);await back;assert.match(summary.textContent,/position restored/);jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.equal(summary.textContent,'Target: Frame 2 / 3 · #2');e['bookmark-clear-visit-jump-position'].onclick();assert.equal(summary.textContent,'This clear-target visit return position cleared');e['bookmark-undo-clear-visit-jump-position'].onclick();assert.match(summary.textContent,/position restored.*#2$/);back=e['bookmark-visit-clear-jump-return'].onclick();await flush();await completeReplay(ui,2);await back;assert.equal(summary.textContent,'No available target');assert.equal(e['bookmark-note'].value,'second origin draft');
});

test('missing or blocked Undo clear never claims restoration and Session reset removes restored notice',async()=>{
 const empty=await startUI();empty.elements['bookmark-undo-clear-visit-jump-position'].onclick();assert.equal(empty.elements['bookmark-visit-clear-jump-return-target'].textContent,'No available target');const ui=await visitClearBackFixture(),e=ui.elements,summary=e['bookmark-visit-clear-jump-return-target'];e['bookmark-clear-visit-jump-position'].onclick();e['shortcut-help-open'].onclick();e['bookmark-undo-clear-visit-jump-position'].onclick();assert.equal(summary.textContent,'This clear-target visit return position cleared');e['shortcut-help-close'].onclick();e['bookmark-undo-clear-visit-jump-position'].onclick();assert.match(summary.textContent,/position restored/);e.lang.value='zh-TW';e.lang.onchange();assert.equal(summary.textContent,'已恢復這次目標跳轉返回位置 · 目標: 影格 1 / 3 · #1');e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(summary.textContent,'目前無可操作目標');e['bookmark-undo-clear-visit-jump-position'].onclick();assert.equal(summary.textContent,'目前無可操作目標');
});

for(const key of ['k','K'])test(key+' restores only the latest cleared visit return position with notice and preserves frame/drafts/playback/all history',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitClearBackFixture(kind),e=ui.elements;e['bookmark-clear-visit-jump-position'].onclick();configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const history=visitClearOlderHistory(ui),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;assert.equal(pressBookmarkKey(ui,key).defaultPrevented,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'This clear-target visit return position restored · Target: Frame 1 / 3 · #1');assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.deepEqual(visitClearOlderHistory(ui),history);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(e['bookmark-undo-clear-visit-jump-position'].hidden,true);assert.equal(e['bookmark-visit-clear-jump-return'].disabled,false);assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');
 }
});

test('K ignores native/custom/composed/active editors, note/search, IME, modifiers, repeated/hidden events and opt-out',async()=>{
 const ui=await visitClearBackFixture(),e=ui.elements;e['bookmark-clear-visit-jump-position'].onclick();const calls=ui.pending.length,editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);for(const target of editors){assert.equal(pressBookmarkKey(ui,'k',{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'K',{composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'k',{target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{shiftKey:true},{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'K',props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'k',{defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,false);assert.equal(e['bookmark-undo-clear-visit-jump-position'].getAttribute('aria-keyshortcuts'),'');assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/position cleared$/);assert.equal(ui.pending.length,calls);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-undo-clear-visit-jump-position'].getAttribute('aria-keyshortcuts'),'k');assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('k'));assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,true);
});

test('K leaves missing/seeking/writing/jumping/Session-reset or replaced backups alone',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'k').defaultPrevented,false);const ui=await visitClearBackFixture('redo'),e=ui.elements;e['bookmark-clear-visit-jump-position'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();let jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,false);await completeReplay(ui,3);await jump;await showSaved(ui,2);jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,false);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'Target: Frame 2 / 3 · #2');e['bookmark-clear-visit-jump-position'].onclick();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,false);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'No available target');
});

test('K keeps pending autoplay presentation and shows Traditional Chinese restored notice without touching older histories',async()=>{
 const ui=await visitClearBackFixture('redo'),e=ui.elements;e['bookmark-clear-visit-jump-position'].onclick();e.lang.value='zh-TW';e.lang.onchange();configureLoop(ui,2,3);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,calls=ui.pending.length,history=visitClearOlderHistory(ui);assert.equal(pressBookmarkKey(ui,'K').defaultPrevented,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'已恢復這次目標跳轉返回位置 · 目標: 影格 1 / 3 · #1');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),history);await completeReplay(ui,2);assertShownFrame(ui,2);assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/已恢復這次目標跳轉返回位置/);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>K<\/kbd>.*data-i="shortcutHelpUndoClearVisitJumpPosition"/);
});

for(const key of ['k','K'])test('Shift '+key+' redoes only the just-restored visit return clear with notice and preserves frame/drafts/settings/playback/all history',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitClearBackFixture(kind),e=ui.elements;e['bookmark-clear-visit-jump-position'].onclick();assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,true);configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const history=visitClearOlderHistory(ui),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'This clear-target visit return position cleared');assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.deepEqual(visitClearOlderHistory(ui),history);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(e['bookmark-visit-clear-jump-return'].disabled,true);assert.equal(e['bookmark-undo-clear-visit-jump-position'].disabled,false);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,true);assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/position restored.*#1$/);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');
 }
});

test('Shift K ignores note/search/native/custom/composed/active editors, IME/modifiers/repeats/hidden events, dialogs and opt-out',async()=>{
 const ui=await visitClearBackFixture(),e=ui.elements;e['bookmark-clear-visit-jump-position'].onclick();e['bookmark-undo-clear-visit-jump-position'].onclick();const calls=ui.pending.length,editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);for(const target of editors){assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('Shift+k'));assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/position restored.*#1$/);assert.equal(ui.pending.length,calls);
});

test('Shift K rejects missing/new/cleared/consumed/replaced/Session-reset positions and busy seeks/writes/jumps',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'K',{shiftKey:true}).defaultPrevented,false);const ui=await visitClearBackFixture('redo'),e=ui.elements;assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);e['bookmark-clear-visit-jump-position'].onclick();assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);e['bookmark-undo-clear-visit-jump-position'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();let jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);await jump;await showSaved(ui,2);jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();await completeReplay(ui,3);await jump;assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);e['bookmark-clear-visit-jump-position'].onclick();e['bookmark-undo-clear-visit-jump-position'].onclick();const back=e['bookmark-visit-clear-jump-return'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,2);await back;assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,false);
});

test('Shift K preserves pending autoplay and supports repeated undo/redo with the Traditional Chinese cleared notice',async()=>{
 const ui=await visitClearBackFixture('redo'),e=ui.elements;e['bookmark-clear-visit-jump-position'].onclick();e['bookmark-undo-clear-visit-jump-position'].onclick();e.lang.value='zh-TW';e.lang.onchange();configureLoop(ui,2,3);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,calls=ui.pending.length,history=visitClearOlderHistory(ui);assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'已清除這次目標跳轉返回位置');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),history);assert.equal(pressBookmarkKey(ui,'k').defaultPrevented,true);assert.equal(pressBookmarkKey(ui,'K',{shiftKey:true}).defaultPrevented,true);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'已清除這次目標跳轉返回位置');assert.equal(e['bookmark-redo-clear-target-jump-position'].disabled,false);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>Shift<\/kbd> \+ <kbd>K<\/kbd><\/dt><dd data-i="shortcutHelpRedoClearVisitJumpPosition"/);
});

test('visit-return Redo clear button works with shortcuts off and preserves frame/drafts/settings/playback/all older history',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitClearBackFixture(kind),e=ui.elements,redo=e['bookmark-redo-clear-visit-jump-position'];assert.equal(redo.disabled,true);assert.equal(redo.getAttribute('aria-keyshortcuts'),'Shift+k');e['bookmark-clear-visit-jump-position'].onclick();assert.equal(redo.disabled,true);e['bookmark-undo-clear-visit-jump-position'].onclick();assert.equal(redo.disabled,false);e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(redo.getAttribute('aria-keyshortcuts'),'');configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();const image=e.rgb.src,status=e['playback-status'].textContent,history=visitClearOlderHistory(ui),calls=ui.pending.length,clouds=ui.cloudUpdates.length;redo.onclick();assert.equal(redo.disabled,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'This clear-target visit return position cleared');assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.deepEqual(visitClearOlderHistory(ui),history);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);redo.onclick();assert.equal(ui.pending.length,calls);e['bookmark-undo-clear-visit-jump-position'].onclick();assert.equal(redo.disabled,false);assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/position restored.*#1$/);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');
 }
});

test('visit-return Redo clear button guards missing/new/cleared/hidden/modal/seeking/writing/jumping/replaced/Session-reset states',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-redo-clear-visit-jump-position'].disabled,true);empty.elements['bookmark-redo-clear-visit-jump-position'].onclick();const ui=await visitClearBackFixture('redo'),e=ui.elements,redo=e['bookmark-redo-clear-visit-jump-position'];redo.onclick();assert.equal(redo.disabled,true);assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/#1$/);e['bookmark-clear-visit-jump-position'].onclick();redo.onclick();assert.equal(redo.disabled,true);e['bookmark-undo-clear-visit-jump-position'].onclick();const blocked=()=>{redo.onclick();assert.equal(redo.disabled,true);assert.match(e['bookmark-visit-clear-jump-return-target'].textContent,/position restored/)};ui.hide();blocked();ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();blocked();e['shortcut-help-close'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();blocked();e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();blocked();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();let jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();blocked();await completeReplay(ui,3);await jump;assert.equal(redo.disabled,false);await showSaved(ui,2);jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();await completeReplay(ui,3);await jump;redo.onclick();assert.equal(redo.disabled,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'Target: Frame 2 / 3 · #2');e['bookmark-clear-visit-jump-position'].onclick();e['bookmark-undo-clear-visit-jump-position'].onclick();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;redo.onclick();assert.equal(redo.disabled,true);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'No available target');
});

test('visit-return Redo clear button keeps pending autoplay and supports repeated undo/redo with Traditional Chinese notice',async()=>{
 const ui=await visitClearBackFixture('redo'),e=ui.elements,redo=e['bookmark-redo-clear-visit-jump-position'];e['bookmark-clear-visit-jump-position'].onclick();e['bookmark-undo-clear-visit-jump-position'].onclick();e.lang.value='zh-TW';e.lang.onchange();configureLoop(ui,2,3);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,calls=ui.pending.length,history=visitClearOlderHistory(ui);redo.onclick();assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'已清除這次目標跳轉返回位置');assert.equal(redo.disabled,true);assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),history);e['bookmark-undo-clear-visit-jump-position'].onclick();assert.equal(redo.disabled,false);redo.onclick();await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'已清除這次目標跳轉返回位置');assert.equal(e['bookmark-redo-clear-target-jump-position'].disabled,false);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/id="bookmark-redo-clear-visit-jump-position"[^>]*data-i="bookmarkHistoryRedoClear"[^>]*type="button" disabled/);assert.ok(html.includes('The button works with shortcuts off and disables without a valid just-restored position or while busy.'));
});

test('visit-return Undo/Redo clear target summaries follow their own history rather than shown frame or filters without changing drafts/history',async()=>{
 for(const kind of ['undo','redo']){
  const ui=await visitClearBackFixture(kind),e=ui.elements,undo=e['bookmark-undo-clear-visit-jump-position-target'],redo=e['bookmark-redo-clear-visit-jump-position-target'];assert.equal(e['bookmark-undo-clear-visit-jump-position-action'].hidden,true);assert.equal(redo.textContent,'No available target');configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();const image=e.rgb.src,history=visitClearOlderHistory(ui),calls=ui.pending.length,clouds=ui.cloudUpdates.length;e['bookmark-clear-visit-jump-position'].onclick();assert.equal(e['bookmark-undo-clear-visit-jump-position-action'].hidden,false);assert.equal(undo.textContent,'Target: Frame 1 / 3 · #1');assert.equal(redo.textContent,'No available target');assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.deepEqual(visitClearOlderHistory(ui),history);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);
  e['bookmark-undo-clear-visit-jump-position'].onclick();assert.equal(e['bookmark-undo-clear-visit-jump-position-action'].hidden,true);assert.equal(undo.textContent,'No available target');assert.equal(redo.textContent,'Target: Frame 1 / 3 · #1');await showSaved(ui,2);editBookmark(ui,'second draft',['crossing']);assert.equal(redo.textContent,'Target: Frame 1 / 3 · #1');e['bookmark-redo-clear-visit-jump-position'].onclick();assert.equal(undo.textContent,'Target: Frame 1 / 3 · #1');assert.equal(redo.textContent,'No available target');assert.equal(e['bookmark-note'].value,'second draft');assert.deepEqual(visitClearOlderHistory(ui),history);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');
 }
});

test('visit-return clear summaries keep blocked target identity, localize and discard targets on replacement/Session reset',async()=>{
 const ui=await visitClearBackFixture('redo'),e=ui.elements,undo=e['bookmark-undo-clear-visit-jump-position-target'],redo=e['bookmark-redo-clear-visit-jump-position-target'];e['bookmark-clear-visit-jump-position'].onclick();e['shortcut-help-open'].onclick();assert.equal(undo.textContent,'Target: Frame 1 / 3 · #1 · Temporarily unavailable');e['shortcut-help-close'].onclick();assert.equal(undo.textContent,'Target: Frame 1 / 3 · #1');e.lang.value='zh-TW';e.lang.onchange();assert.equal(undo.textContent,'目標: 影格 1 / 3 · #1');e['bookmark-undo-clear-visit-jump-position'].onclick();assert.equal(redo.textContent,'目標: 影格 1 / 3 · #1');ui.hide();assert.equal(redo.textContent,'目標: 影格 1 / 3 · #1 · 暫不可操作');ui.document.hidden=false;ui.dispatch('visibilitychange');e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(redo.textContent,'目標: 影格 1 / 3 · #1 · 暫不可操作');e['playback-pause'].onclick();await showSaved(ui,2);const jump=e['bookmark-redo-clear-target-jump-position-jump'].onclick();await flush();assert.match(redo.textContent,/#1 · 暫不可操作$/);await completeReplay(ui,3);await jump;assert.equal(redo.textContent,'目前無可操作目標');e['bookmark-clear-visit-jump-position'].onclick();assert.equal(undo.textContent,'目標: 影格 2 / 3 · #2');e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(undo.textContent,'目前無可操作目標');assert.equal(redo.textContent,'目前無可操作目標');assert.equal(e['bookmark-undo-clear-visit-jump-position-action'].hidden,true);
});

test('visit-return clear target summaries update during pending playback without extra work and have accessible descriptions',async()=>{
 const ui=await visitClearBackFixture('redo'),e=ui.elements;e['bookmark-clear-visit-jump-position'].onclick();e.lang.value='zh-TW';e.lang.onchange();configureLoop(ui,2,3);e['playback-play'].onclick();await ui.tick(200);const calls=ui.pending.length,status=e['playback-status'].textContent,history=visitClearOlderHistory(ui);assert.equal(e['bookmark-undo-clear-visit-jump-position-target'].textContent,'目標: 影格 1 / 3 · #1');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),history);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-undo-clear-visit-jump-position-target'].textContent,'目標: 影格 1 / 3 · #1');const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');for(const action of ['undo','redo']){const id='bookmark-'+action+'-clear-visit-jump-position';assert.ok(html.includes('aria-describedby="'+id+'-target bookmark-history-help"'));assert.ok(html.includes('id="'+id+'-target" class="bookmark-history-target" role="status" aria-live="polite" aria-atomic="true"'))}assert.ok(html.includes('data-i="shortcutHelpVisitReturnClearTargets"'));
});

async function visitReturnTargetFixture(kind='undo'){
 const ui=await visitClearBackFixture('redo');ui.elements['bookmark-clear-visit-jump-position'].onclick();if(kind==='redo')ui.elements['bookmark-undo-clear-visit-jump-position'].onclick();return ui;
}
function visitReturnClearState(ui){const e=ui.elements;return [e['bookmark-visit-clear-jump-return-target'].textContent,e['bookmark-undo-clear-visit-jump-position-target'].textContent,e['bookmark-redo-clear-visit-jump-position-target'].textContent,e['bookmark-undo-clear-visit-jump-position-action'].hidden,e['bookmark-undo-clear-visit-jump-position'].disabled,e['bookmark-redo-clear-visit-jump-position'].disabled,e['bookmark-visit-clear-jump-return'].disabled]}

test('latest visit-return clear target buttons pause and jump with both drafts/settings/all clear history preserved',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitReturnTargetFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-visit-jump-position';e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'no matches');e['playback-speed'].value='2';e['playback-speed'].onchange();editBookmark(ui,'edited visited draft',['crossing']);const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),writes=bookmarkWrites(ui).length,clouds=ui.cloudUpdates.length;if(playing)e['playback-play'].onclick();const calls=replayRequests(ui).length;const jumping=e[id+'-jump'].onclick();await flush();assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,1);await jumping;assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(e['bookmark-search'].value,'no matches');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.equal(bookmarkWrites(ui).length,writes);assert.equal(ui.cloudUpdates.length,clouds+1);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'edited visited draft');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.deepEqual(visitReturnClearState(ui),own);
 }
});

test('latest visit-return target HTTP/hash/decode failures keep the shown image/editor and allow exact-target retry without history changes',async()=>{
 for(const kind of ['undo','redo'])for(const failure of ['http','snapshot','decode']){
  const ui=await visitReturnTargetFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-visit-jump-position',image=e.rgb.src,older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);editBookmark(ui,'kept visited draft',['crossing']);const jumping=e[id+'-jump'].onclick();await flush();if(failure==='http')ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);else if(failure==='snapshot')ui.respond('/api/sessions/session-a/frames/1/replay',{...replayResponse('session-a',1),snapshot_sha256:otherHash});else{ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();ui.decode('data:image/png;base64,session-a-1',Error('synthetic decode failure'));ui.decode('data:image/jpeg;base64,session-a-depth-1')}await jumping;assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'kept visited draft');assert.equal(e[id+'-jump'].disabled,false);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);const retry=e[id+'-jump'].onclick();await flush();await completeReplay(ui,1);await retry;assert.equal(e['bookmark-note'].value,'target draft');assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);
 }
});

test('latest visit-return target jumps disable absent/help/hidden/seek/write states without extra requests',async()=>{
 const empty=await startUI();for(const kind of ['undo','redo']){const jump=empty.elements['bookmark-'+kind+'-clear-visit-jump-position-jump'];assert.equal(jump.disabled,true);jump.onclick()}assert.equal(replayRequests(empty).length,0);
 for(const kind of ['undo','redo']){
  const ui=await visitReturnTargetFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-visit-jump-position',calls=replayRequests(ui).length,older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);for(const block of ['help','hidden','seek']){if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();assert.equal(replayRequests(ui).length,calls);if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(e[id+'-jump'].disabled,false)}e['bookmark-undo-delete'].onclick();await flush();assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e[id+'-jump'].disabled,false);assert.equal(replayRequests(ui).length,calls);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(visitClearOlderHistory(ui).slice(3).join('|'),older.slice(3).join('|'));
 }
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');for(const kind of ['undo','redo'])assert.ok(html.includes('id="bookmark-'+kind+'-clear-visit-jump-position-jump" class="bookmark-history-jump" type="button" disabled'));
});

test('late latest visit-return target replies cannot display old Session frames or alter reset clear history',async()=>{
 for(const kind of ['undo','redo']){
  const ui=await visitReturnTargetFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-visit-jump-position';const jumping=e[id+'-jump'].onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await jumping;assert.equal(e.result.hidden,true);assert.equal(e[id+'-jump'].disabled,true);assert.equal(e[id+'-target'].textContent,'No available target');assert.equal(e['bookmark-visit-clear-jump-return-target'].textContent,'No available target');await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
 }
});

test('latest visit-return target jump supersedes in-flight manual replay and keeps exact history and localized accessible labels',async()=>{
 for(const kind of ['undo','redo']){
  const ui=await visitReturnTargetFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-visit-jump-position';e.lang.value='zh-TW';e.lang.onchange();assert.match(e[id+'-jump'].getAttribute('aria-label'),/目標: 影格 1 \/ 3 · #1/);const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);e['frames-list'].value='2';const manual=e.replay.onclick();await flush();const jumping=e[id+'-jump'].onclick();await flush();await completeReplay(ui,1);await jumping;ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await manual;assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);
 }
});

async function visitReturnBackFixture(kind='undo'){
 const ui=await visitReturnTargetFixture(kind);const jumping=ui.elements['bookmark-'+kind+'-clear-visit-jump-position-jump'].onclick();await flush();await completeReplay(ui,1);await jumping;return ui;
}

test('return before this return-target visit restores the fully shown origin with drafts/settings/all older history intact',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitReturnBackFixture(kind),e=ui.elements,back=e['bookmark-visit-clear-history-return'];assert.equal(back.disabled,false);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'Target: Frame 3 / 3 · #3');e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();editBookmark(ui,'edited target draft',['crossing']);const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),writes=bookmarkWrites(ui).length;if(playing)e['playback-play'].onclick();const calls=replayRequests(ui).length,returning=back.onclick();await flush();assert.equal(back.disabled,true);back.onclick();assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,3);await returning;assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(bookmarkWrites(ui).length,writes);assert.equal(back.disabled,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'No available target');await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'edited target draft');assert.equal(e['bookmark-tag-crossing'].checked,true);
 }
});

test('return-target-visit back HTTP/hash/decode failures keep shown frame/editor and history, retain origin and allow retry',async()=>{
 for(const kind of ['undo','redo'])for(const failure of ['http','snapshot','decode']){
  const ui=await visitReturnBackFixture(kind),e=ui.elements,back=e['bookmark-visit-clear-history-return'],image=e.rgb.src,older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);editBookmark(ui,'kept target draft',['crossing']);const returning=back.onclick();await flush();if(failure==='http')ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);else if(failure==='snapshot')ui.respond('/api/sessions/session-a/frames/3/replay',{...replayResponse('session-a',3),snapshot_sha256:otherHash});else{ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();ui.decode('data:image/png;base64,session-a-3',Error('synthetic decode failure'));ui.decode('data:image/jpeg;base64,session-a-depth-3')}await returning;assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'kept target draft');assert.equal(back.disabled,false);assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/#3$/);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);const retry=back.onclick();await flush();await completeReplay(ui,3);await retry;assert.equal(back.disabled,true);assert.equal(e['bookmark-note'].value,'origin draft');assert.deepEqual(visitReturnClearState(ui),own);
 }
});

test('return-target-visit origin changes only after successful different-frame visits and survives ordinary clear histories',async()=>{
 const ui=await visitReturnBackFixture('redo'),e=ui.elements,id='bookmark-redo-clear-visit-jump-position',summary=e['bookmark-visit-clear-history-return-target'];let jumping=e[id+'-jump'].onclick();await flush();await completeReplay(ui,1);await jumping;assert.match(summary.textContent,/#3$/);await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);jumping=e[id+'-jump'].onclick();await flush();await completeReplay(ui,1);await jumping;assert.match(summary.textContent,/#2$/);await showSaved(ui,3);jumping=e[id+'-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await jumping;assert.match(summary.textContent,/#2$/);e['bookmark-redo-clear-visit-jump-position'].onclick();e['bookmark-undo-clear-visit-jump-position'].onclick();e['bookmark-redo-clear-target-jump-position'].onclick();e['bookmark-undo-clear-target-jump-position'].onclick();e['bookmark-redo-clear-target-position'].onclick();e['bookmark-undo-clear-target-position'].onclick();e['bookmark-history-redo-clear'].onclick();e['bookmark-history-undo-clear'].onclick();assert.match(summary.textContent,/#2$/);e.lang.value='zh-TW';e.lang.onchange();assert.equal(summary.textContent,'目標: 影格 2 / 3 · #2');const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),returning=e['bookmark-visit-clear-history-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(e['bookmark-note'].value,'second origin draft');assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);
});

test('return-target-visit back disables missing/hidden/modal/seek/write states and rejects late old-Session replies',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-visit-clear-history-return'].disabled,true);empty.elements['bookmark-visit-clear-history-return'].onclick();assert.equal(replayRequests(empty).length,0);const ui=await visitReturnBackFixture(),e=ui.elements,back=e['bookmark-visit-clear-history-return'],calls=replayRequests(ui).length;
 for(const block of ['help','hidden','seek']){if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}assert.equal(back.disabled,true);back.onclick();assert.equal(replayRequests(ui).length,calls);if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(back.disabled,false)}e['bookmark-undo-delete'].onclick();await flush();assert.equal(back.disabled,true);back.onclick();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(back.disabled,false);const returning=back.onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await returning;assert.equal(e.result.hidden,true);assert.equal(back.disabled,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'No available target');await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
});

test('target visit without a fully shown origin cannot create this return position or revive superseded replay',async()=>{
 const ui=await visitReturnTargetFixture(),e=ui.elements;e['frames-list'].value='2';const manual=e.replay.onclick();await flush();assert.equal(e.result.hidden,true);const jumping=e['bookmark-undo-clear-visit-jump-position-jump'].onclick();await flush();await completeReplay(ui,1);await jumping;ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await manual;assertShownFrame(ui,1);assert.equal(e['bookmark-visit-clear-history-return'].disabled,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'No available target');assert.equal(e['bookmark-undo-clear-visit-jump-position'].disabled,false);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.ok(html.includes('data-i="shortcutHelpVisitClearHistoryReturn"'));assert.ok(html.includes('id="bookmark-visit-clear-history-return" data-i="bookmarkVisitClearHistoryReturn"'));
});

for(const key of ['n','N'])test(key+' returns before this return-target visit with both drafts/settings/all older clear history intact',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitReturnBackFixture(kind),e=ui.elements;configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();editBookmark(ui,'edited target draft',['crossing']);const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),writes=bookmarkWrites(ui).length;if(playing)e['playback-play'].onclick();const calls=replayRequests(ui).length;assert.equal(pressBookmarkKey(ui,key).defaultPrevented,true);await flush();assert.equal(e['bookmark-visit-clear-history-return'].disabled,true);assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,3);await flush();assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(bookmarkWrites(ui).length,writes);assert.equal(e['bookmark-visit-clear-history-return'].disabled,true);assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'edited target draft');assert.equal(e['bookmark-tag-crossing'].checked,true);
 }
});

test('N ignores note/search/native/custom/composed/active editors, IME, modifiers, repeats/hidden events, help and opt-out',async()=>{
 const ui=await visitReturnBackFixture(),e=ui.elements,calls=replayRequests(ui).length,editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);for(const target of editors){assert.equal(pressBookmarkKey(ui,'n',{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'N',{composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'n',{target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'N',props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'n',{defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'n').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'n').defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'n').defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressBookmarkKey(ui,'n').defaultPrevented,false);assert.equal(e['bookmark-visit-clear-history-return'].getAttribute('aria-keyshortcuts'),'');assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-visit-clear-history-return'].getAttribute('aria-keyshortcuts'),'n');assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('n'));assert.equal(replayRequests(ui).length,calls);assert.equal(e['bookmark-visit-clear-history-return'].disabled,false);
});

test('N guards missing/seeking/jumping/writing/returning and Session-reset positions without consuming history',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'n').defaultPrevented,false);const ui=await visitReturnBackFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'n').defaultPrevented,false);e['playback-pause'].onclick();const jumping=e['bookmark-undo-clear-visit-jump-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'n').defaultPrevented,false);await completeReplay(ui,1);await jumping;e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'n').defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(pressBookmarkKey(ui,'n').defaultPrevented,true);await flush();assert.equal(pressBookmarkKey(ui,'n').defaultPrevented,false);e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();assert.equal(e.result.hidden,true);assert.equal(pressBookmarkKey(ui,'n').defaultPrevented,false);assert.equal(e['bookmark-visit-clear-history-return'].disabled,true);await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
});

test('N return failure retains origin, draft and all history for retry with localized help',async()=>{
 const ui=await visitReturnBackFixture('redo'),e=ui.elements;e.lang.value='zh-TW';e.lang.onchange();editBookmark(ui,'kept target draft',['crossing']);const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),image=e.rgb.src;assert.equal(pressBookmarkKey(ui,'N').defaultPrevented,true);await flush();ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);await flush();assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'kept target draft');assert.equal(e['bookmark-visit-clear-history-return'].disabled,false);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'目標: 影格 3 / 3 · #3');assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(pressBookmarkKey(ui,'n').defaultPrevented,true);await flush();await completeReplay(ui,3);await flush();assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-visit-clear-history-return'].disabled,true);assert.deepEqual(visitReturnClearState(ui),own);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>N<\/kbd>.*data-i="bookmarkVisitClearHistoryReturn"/);assert.ok(html.includes('press N outside editors'));
});

for(const key of ['n','N'])test('Shift '+key+' clears only this return-target-visit origin and preserves image/drafts/playback/settings/all history',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitReturnBackFixture(kind),e=ui.elements;configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(e['bookmark-visit-clear-history-return'].disabled,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'Return-target visit position cleared');assert.equal(pressBookmarkKey(ui,'n').defaultPrevented,false);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);
 }
});

test('Shift N ignores note/search/native/custom/composed/active editors, IME/modifiers/repeats/hidden events, help and opt-out',async()=>{
 const ui=await visitReturnBackFixture(),e=ui.elements,calls=ui.pending.length,editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);for(const target of editors){assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,false);e['shortcut-help-close'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,false);assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('Shift+n'));assert.equal(e['bookmark-visit-clear-history-return'].disabled,false);assert.equal(ui.pending.length,calls);
});

test('Shift N leaves missing/seeking/jumping/writing/returning and Session-reset positions alone',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'N',{shiftKey:true}).defaultPrevented,false);const ui=await visitReturnBackFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,false);e['playback-pause'].onclick();const jumping=e['bookmark-undo-clear-visit-jump-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,1);await jumping;e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const returning=e['bookmark-visit-clear-history-return'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);await returning;assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,false);e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,false);
});

test('Shift N preserves both drafts, allows fresh origins and does not cancel pending autoplay presentation',async()=>{
 const ui=await visitReturnBackFixture('redo'),e=ui.elements;assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,true);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);const jumping=e['bookmark-redo-clear-visit-jump-position-jump'].onclick();await flush();await completeReplay(ui,1);await jumping;assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-visit-clear-history-return'].disabled,false);assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/#2$/);configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,calls=ui.pending.length,older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,true);assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-note'].value,'second origin draft');assert.equal(e['bookmark-visit-clear-history-return'].disabled,true);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>Shift<\/kbd> \+ <kbd>N<\/kbd><\/dt><dd data-i="shortcutHelpClearVisitHistoryReturn"/);
});

test('clear return-target-visit position button works with shortcuts off and preserves frame/drafts/settings/playback/all history',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitReturnBackFixture(kind),e=ui.elements,clear=e['bookmark-clear-visit-history-position'];assert.equal(clear.disabled,false);assert.equal(clear.getAttribute('aria-keyshortcuts'),'Shift+n');e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(clear.getAttribute('aria-keyshortcuts'),'');configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();const image=e.rgb.src,status=e['playback-status'].textContent,older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),calls=ui.pending.length,clouds=ui.cloudUpdates.length;clear.onclick();assert.equal(clear.disabled,true);assert.equal(e['bookmark-visit-clear-history-return'].disabled,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'Return-target visit position cleared');assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);clear.onclick();assert.equal(ui.pending.length,calls);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);
 }
});

test('clear return-target-visit position button guards missing/hidden/help/seeking/writing/jumping/returning and Session reset',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-clear-visit-history-position'].disabled,true);empty.elements['bookmark-clear-visit-history-position'].onclick();assert.equal(replayRequests(empty).length,0);const ui=await visitReturnBackFixture(),e=ui.elements,clear=e['bookmark-clear-visit-history-position'];const blocked=()=>{clear.onclick();assert.equal(clear.disabled,true);assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/#3/)};ui.hide();blocked();ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();blocked();e['shortcut-help-close'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();blocked();e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();blocked();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const jumping=e['bookmark-undo-clear-visit-jump-position-jump'].onclick();await flush();blocked();await completeReplay(ui,1);await jumping;assert.equal(clear.disabled,false);const returning=e['bookmark-visit-clear-history-return'].onclick();await flush();blocked();await completeReplay(ui,3);await returning;clear.onclick();assert.equal(clear.disabled,true);e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;clear.onclick();assert.equal(clear.disabled,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'No available target');
});

test('clear return-target-visit position button permits fresh origins and preserves pending autoplay with both drafts/history intact',async()=>{
 const ui=await visitReturnBackFixture('redo'),e=ui.elements,clear=e['bookmark-clear-visit-history-position'];clear.onclick();await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);const jumping=e['bookmark-redo-clear-visit-jump-position-jump'].onclick();await flush();await completeReplay(ui,1);await jumping;assert.equal(clear.disabled,false);assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/#2$/);configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,calls=ui.pending.length,older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);clear.onclick();assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-note'].value,'second origin draft');assert.equal(clear.disabled,true);assert.equal(e['bookmark-redo-clear-visit-jump-position'].disabled,false);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/id="bookmark-clear-visit-history-position"[^>]*data-i="bookmarkClearVisitHistoryPosition"[^>]*type="button" disabled/);assert.ok(html.includes('The clear button works with shortcuts off')||html.includes('The button works with shortcuts off and disables without a valid position or while busy.'));
});

test('return-target visit clear button and Shift N show matching localized success notices without changing frame/drafts/playback/history',async()=>{
 for(const action of ['button','n','N'])for(const lang of ['en','zh-TW'])for(const playing of [false,true]){
  const ui=await visitReturnBackFixture(),e=ui.elements;e.lang.value=lang;e.lang.onchange();if(action==='button'){e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange()}if(playing)e['playback-play'].onclick();const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),image=e.rgb.src,status=e['playback-status'].textContent,calls=ui.pending.length,clouds=ui.cloudUpdates.length;if(action==='button')e['bookmark-clear-visit-history-position'].onclick();else assert.equal(pressBookmarkKey(ui,action,{shiftKey:true}).defaultPrevented,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,lang==='en'?'Return-target visit position cleared':'已清除此次目標跳轉返回位置');assert.equal(e['bookmark-visit-clear-history-return'].disabled,true);assert.equal(e['bookmark-clear-visit-history-position'].disabled,true);assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['playback-status'].textContent,status);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);
 }
});

test('return-target visit cleared notice survives navigation/same-frame/failed target visits and resets for a new origin or successful return',async()=>{
 const ui=await visitReturnBackFixture('redo'),e=ui.elements,summary=e['bookmark-visit-clear-history-return-target'];e['bookmark-clear-visit-history-position'].onclick();assert.equal(summary.textContent,'Return-target visit position cleared');let jump=e['bookmark-redo-clear-visit-jump-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.equal(summary.textContent,'Return-target visit position cleared');await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);assert.equal(summary.textContent,'Return-target visit position cleared');jump=e['bookmark-redo-clear-visit-jump-position-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await jump;assert.equal(summary.textContent,'Return-target visit position cleared');assert.equal(e['bookmark-note'].value,'second origin draft');jump=e['bookmark-redo-clear-visit-jump-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.equal(summary.textContent,'Target: Frame 2 / 3 · #2');const returning=e['bookmark-visit-clear-history-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(summary.textContent,'No available target');assert.equal(e['bookmark-note'].value,'second origin draft');
});

test('missing/blocked/typing/IME clear actions cannot create the latest cleared notice and Session reset discards it',async()=>{
 const empty=await startUI();empty.elements['bookmark-clear-visit-history-position'].onclick();assert.equal(pressBookmarkKey(empty,'N',{shiftKey:true}).defaultPrevented,false);assert.equal(empty.elements['bookmark-visit-clear-history-return-target'].textContent,'No available target');const ui=await visitReturnBackFixture(),e=ui.elements,summary=e['bookmark-visit-clear-history-return-target'];for(const props of [{target:e['bookmark-note']},{target:e['bookmark-search']},{isComposing:true},{keyCode:229}]){assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(summary.textContent,'Target: Frame 3 / 3 · #3')}e['shortcut-help-open'].onclick();e['bookmark-clear-visit-history-position'].onclick();assert.match(summary.textContent,/#3/);assert.doesNotMatch(summary.textContent,/position cleared/);e['shortcut-help-close'].onclick();e['bookmark-clear-visit-history-position'].onclick();assert.equal(summary.textContent,'Return-target visit position cleared');e.lang.value='zh-TW';e.lang.onchange();assert.equal(summary.textContent,'已清除此次目標跳轉返回位置');e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(summary.textContent,'目前無可操作目標');e['bookmark-clear-visit-history-position'].onclick();assert.equal(summary.textContent,'目前無可操作目標');
});

test('undo clearing the return-target visit origin restores only its saved point with shortcuts off, preserving drafts/settings/playback/all older history',async()=>{
 for(const kind of ['undo','redo'])for(const action of ['button','shortcut'])for(const playing of [false,true]){
  const ui=await visitReturnBackFixture(kind),e=ui.elements,undo=e['bookmark-undo-clear-visit-history-position'];assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();if(action==='button')e['bookmark-clear-visit-history-position'].onclick();else assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,true);assert.equal(undo.hidden,false);assert.equal(undo.disabled,false);e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();e.result.focus();const image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement,older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),calls=ui.pending.length,clouds=ui.cloudUpdates.length;undo.onclick();assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'Return-target visit position restored · Target: Frame 3 / 3 · #3');assert.equal(e['bookmark-visit-clear-history-return'].disabled,false);assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);undo.onclick();assert.equal(ui.pending.length,calls);const returning=e['bookmark-visit-clear-history-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');
 }
});

test('undo return-target visit clearing blocks missing/hidden/help/seeking/writing/jumping states without losing backup and preserves pending autoplay',async()=>{
 const empty=await startUI();empty.elements['bookmark-undo-clear-visit-history-position'].onclick();assert.equal(replayRequests(empty).length,0);const ui=await visitReturnBackFixture(),e=ui.elements,undo=e['bookmark-undo-clear-visit-history-position'];e['bookmark-clear-visit-history-position'].onclick();const blocked=()=>{undo.onclick();assert.equal(undo.disabled,true);assert.equal(undo.hidden,false);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'Return-target visit position cleared')};ui.hide();blocked();ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();blocked();e['shortcut-help-close'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();blocked();e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();blocked();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const jump=e['bookmark-undo-clear-visit-jump-position-jump'].onclick();await flush();blocked();await completeReplay(ui,1);await jump;assert.equal(undo.disabled,false);configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,calls=ui.pending.length,older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);undo.onclick();assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);await completeReplay(ui,2);assertShownFrame(ui,2);assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/#3$/);assert.equal(e['bookmark-visit-clear-history-return'].disabled,false);
});

test('return-target visit clear backup survives same-frame/failed visits, is replaced by a fresh origin, and is discarded on Session reset',async()=>{
 const ui=await visitReturnBackFixture('redo'),e=ui.elements,undo=e['bookmark-undo-clear-visit-history-position'];e['bookmark-clear-visit-history-position'].onclick();let jump=e['bookmark-redo-clear-visit-jump-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.equal(undo.disabled,false);await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);jump=e['bookmark-redo-clear-visit-jump-position-jump'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await jump;assert.equal(undo.disabled,false);jump=e['bookmark-redo-clear-visit-jump-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);undo.onclick();assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/#2$/);e['bookmark-clear-visit-history-position'].onclick();undo.onclick();assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/#2$/);e['bookmark-clear-visit-history-position'].onclick();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;undo.onclick();assert.equal(undo.hidden,true);assert.equal(undo.disabled,true);assert.equal(e['bookmark-visit-clear-history-return'].disabled,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'No available target');const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/id="bookmark-undo-clear-visit-history-position"[^>]*data-i="bookmarkHistoryUndoClear"[^>]*aria-describedby="bookmark-undo-clear-visit-history-position-target bookmark-history-help"[^>]*type="button" hidden disabled/);assert.ok(html.includes('Successful clearing shows an Undo clear button beside the notice.'));
});

test('successful undo clear shows localized return-target visit restored notice with target while preserving drafts/playback/settings/all older history',async()=>{
 for(const lang of ['en','zh-TW'])for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitReturnBackFixture(kind),e=ui.elements;e.lang.value=lang;e.lang.onchange();e['bookmark-clear-visit-history-position'].onclick();e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');if(playing)e['playback-play'].onclick();const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),image=e.rgb.src,status=e['playback-status'].textContent,calls=ui.pending.length,clouds=ui.cloudUpdates.length;e['bookmark-undo-clear-visit-history-position'].onclick();assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,lang==='en'?'Return-target visit position restored · Target: Frame 3 / 3 · #3':'已恢復此次目標跳轉返回位置 · 目標: 影格 3 / 3 · #3');assert.equal(e['bookmark-undo-clear-visit-history-position'].hidden,true);assert.equal(e['bookmark-visit-clear-history-return'].disabled,false);assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-status'].textContent,status);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);
 }
});

test('return-target visit restored notice persists across navigation/language/settings/failed returns and resets on fresh origin, clearing or successful return',async()=>{
 const ui=await visitReturnBackFixture('redo'),e=ui.elements,summary=e['bookmark-visit-clear-history-return-target'];e['bookmark-clear-visit-history-position'].onclick();e['bookmark-undo-clear-visit-history-position'].onclick();await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e.lang.value='zh-TW';e.lang.onchange();assert.match(summary.textContent,/^已恢復此次目標跳轉返回位置.*#3$/);let returning=e['bookmark-visit-clear-history-return'].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);await returning;assertShownFrame(ui,2);assert.equal(e['bookmark-note'].value,'second origin draft');assert.match(summary.textContent,/^已恢復此次目標跳轉返回位置.*#3$/);let jump=e['bookmark-redo-clear-visit-jump-position-jump'].onclick();await flush();await completeReplay(ui,1);await jump;assert.equal(summary.textContent,'目標: 影格 2 / 3 · #2');e['bookmark-clear-visit-history-position'].onclick();assert.equal(summary.textContent,'已清除此次目標跳轉返回位置');e['bookmark-undo-clear-visit-history-position'].onclick();assert.match(summary.textContent,/^已恢復此次目標跳轉返回位置.*#2$/);returning=e['bookmark-visit-clear-history-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(summary.textContent,'目前無可操作目標');assert.equal(e['bookmark-note'].value,'second origin draft');
});

test('missing/blocked undo clear cannot create a restored return-target visit notice and Session reset removes successful notice',async()=>{
 const empty=await startUI();empty.elements['bookmark-undo-clear-visit-history-position'].onclick();assert.equal(empty.elements['bookmark-visit-clear-history-return-target'].textContent,'No available target');const ui=await visitReturnBackFixture(),e=ui.elements,summary=e['bookmark-visit-clear-history-return-target'],undo=e['bookmark-undo-clear-visit-history-position'];undo.onclick();assert.equal(summary.textContent,'Target: Frame 3 / 3 · #3');e['bookmark-clear-visit-history-position'].onclick();e['shortcut-help-open'].onclick();undo.onclick();assert.equal(summary.textContent,'Return-target visit position cleared');e['shortcut-help-close'].onclick();ui.hide();undo.onclick();assert.equal(summary.textContent,'Return-target visit position cleared');ui.document.hidden=false;ui.dispatch('visibilitychange');undo.onclick();assert.match(summary.textContent,/^Return-target visit position restored/);undo.onclick();assert.match(summary.textContent,/^Return-target visit position restored/);e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(summary.textContent,'No available target');undo.onclick();assert.equal(summary.textContent,'No available target');const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.ok(html.includes('Successful Undo clear shows “Return-target visit position restored” with its target in the live status summary.'));assert.match(html,/id="bookmark-visit-clear-history-return-target"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('P and Caps Lock P undo only this return-target visit clear, show localized restored notice and preserve drafts/settings/playback/all older history',async()=>{
 for(const key of ['p','P'])for(const lang of ['en','zh-TW'])for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitReturnBackFixture(kind),e=ui.elements;e.lang.value=lang;e.lang.onchange();e['bookmark-clear-visit-history-position'].onclick();configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement,calls=ui.pending.length,clouds=ui.cloudUpdates.length;assert.equal(pressBookmarkKey(ui,key).defaultPrevented,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,lang==='en'?'Return-target visit position restored · Target: Frame 3 / 3 · #3':'已恢復此次目標跳轉返回位置 · 目標: 影格 3 / 3 · #3');assert.equal(e['bookmark-undo-clear-visit-history-position'].hidden,true);assert.equal(e['bookmark-visit-clear-history-return'].disabled,false);assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assert.equal(e['playback-speed'].value,'2');assertLoopValues(ui,1,2,true);assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);const returning=e['bookmark-visit-clear-history-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(e['bookmark-note'].value,'origin draft');await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');
 }
});

test('P ignores note/search/native/custom/composed/active editors, IME, modifiers/repeats/hidden events, dialogs and shortcut opt-out with accessible metadata',async()=>{
 const ui=await visitReturnBackFixture(),e=ui.elements;e['bookmark-clear-visit-history-position'].onclick();const calls=ui.pending.length,editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','spinbutton','slider','listbox','radiogroup','menu','tablist','tree','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);for(const target of editors){assert.equal(pressBookmarkKey(ui,'p',{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'P',{composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'p',{target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'P',props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'p',{defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'p').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'p').defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'p').defaultPrevented,false);e['shortcut-help-close'].onclick();assert.equal(e['bookmark-undo-clear-visit-history-position'].getAttribute('aria-keyshortcuts'),'p');assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('p'));e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressBookmarkKey(ui,'p').defaultPrevented,false);assert.equal(e['bookmark-undo-clear-visit-history-position'].getAttribute('aria-keyshortcuts'),'');assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');assert.equal(ui.pending.length,calls);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'Return-target visit position cleared');assert.equal(e['bookmark-undo-clear-visit-history-position'].disabled,false);e['bookmark-undo-clear-visit-history-position'].onclick();assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/^Return-target visit position restored/);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>P<\/kbd>.*data-i="shortcutHelpUndoClearVisitHistoryPosition"/);
});

test('P guards missing/seeking/writing/jumping/deletion-confirmation/Session-reset backups without consuming this clear history',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'p').defaultPrevented,false);const ui=await visitReturnBackFixture(),e=ui.elements;e['bookmark-clear-visit-history-position'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'p').defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'p').defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const jumping=e['bookmark-undo-clear-visit-jump-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'p').defaultPrevented,false);await completeReplay(ui,1);await jumping;ui.setConfirm(()=>undefined);const removing=e['bookmark-delete'].onclick();await flush();assert.equal(e['bookmark-delete-dialog'].open,true);assert.equal(pressBookmarkKey(ui,'p').defaultPrevented,false);e['bookmark-delete-cancel'].onclick();await removing;assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'Return-target visit position cleared');assert.equal(pressBookmarkKey(ui,'P').defaultPrevented,true);assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/^Return-target visit position restored/);e['bookmark-clear-visit-history-position'].onclick();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'p').defaultPrevented,false);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'No available target');
});

test('P restores without cancelling pending autoplay or altering older clear history and may restore another explicit clear afterward',async()=>{
 const ui=await visitReturnBackFixture('redo'),e=ui.elements;e['bookmark-clear-visit-history-position'].onclick();configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,calls=ui.pending.length,older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);assert.equal(pressBookmarkKey(ui,'p').defaultPrevented,true);assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);await completeReplay(ui,2);assertShownFrame(ui,2);assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/^Return-target visit position restored.*#3$/);assert.equal(pressBookmarkKey(ui,'N',{shiftKey:true}).defaultPrevented,true);assert.equal(pressBookmarkKey(ui,'P').defaultPrevented,true);assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/^Return-target visit position restored.*#3$/);
});

async function restoredVisitHistoryKeyFixture(kind='undo'){
 const ui=await visitReturnBackFixture(kind),e=ui.elements;e['bookmark-clear-visit-history-position'].onclick();e['bookmark-undo-clear-visit-history-position'].onclick();return ui;
}
test('Shift P redoes only just-restored return-target visit clearing with localized notice, preserving drafts/settings/playback/all older history',async()=>{
 for(const key of ['p','P'])for(const lang of ['en','zh-TW'])for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await restoredVisitHistoryKeyFixture(kind),e=ui.elements;e.lang.value=lang;e.lang.onchange();configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement,calls=ui.pending.length,clouds=ui.cloudUpdates.length;assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,lang==='en'?'Return-target visit position cleared':'已清除此次目標跳轉返回位置');assert.equal(e['bookmark-visit-clear-history-return'].disabled,true);assert.equal(e['bookmark-undo-clear-visit-history-position'].hidden,false);assert.equal(e['bookmark-undo-clear-visit-history-position'].disabled,false);assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assert.equal(e['playback-speed'].value,'2');assertLoopValues(ui,1,2,true);assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'p').defaultPrevented,true);assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/#3$/);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);e['bookmark-undo-clear-visit-history-position'].onclick();const returning=e['bookmark-visit-clear-history-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(e['bookmark-note'].value,'origin draft');await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');
 }
});

test('Shift P ignores note/search/native/custom/composed/active editors, IME, modifiers/repeats/hidden events, help and opt-out with shortcut metadata',async()=>{
 const ui=await restoredVisitHistoryKeyFixture(),e=ui.elements,calls=ui.pending.length,editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','spinbutton','slider','listbox','radiogroup','menu','tablist','tree','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);for(const target of editors){assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'P',{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'P',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true}).defaultPrevented,false);e['shortcut-help-close'].onclick();assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('Shift+p'));e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true}).defaultPrevented,false);assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('Shift+p'));assert.equal(ui.pending.length,calls);assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/^Return-target visit position restored/);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>Shift<\/kbd> \+ <kbd>P<\/kbd><\/dt><dd data-i="shortcutHelpRedoClearVisitHistoryPosition"/);
});

test('Shift P rejects absent/new/consumed/reset positions and seek/write/jump/delete-confirmation states without consuming redo eligibility',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'P',{shiftKey:true}).defaultPrevented,false);const fresh=await visitReturnBackFixture();assert.equal(pressBookmarkKey(fresh,'P',{shiftKey:true}).defaultPrevented,false);assert.match(fresh.elements['bookmark-visit-clear-history-return-target'].textContent,/^Target:/);const ui=await restoredVisitHistoryKeyFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true}).defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true}).defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const jumping=e['bookmark-undo-clear-visit-jump-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,1);await jumping;ui.setConfirm(()=>undefined);const removing=e['bookmark-delete'].onclick();await flush();assert.equal(e['bookmark-delete-dialog'].open,true);assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true}).defaultPrevented,false);e['bookmark-delete-cancel'].onclick();await removing;assert.equal(pressBookmarkKey(ui,'P',{shiftKey:true}).defaultPrevented,true);e['bookmark-undo-clear-visit-history-position'].onclick();const returning=e['bookmark-visit-clear-history-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(pressBookmarkKey(ui,'P',{shiftKey:true}).defaultPrevented,false);e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true}).defaultPrevented,false);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'No available target');
});

test('Shift P keeps pending autoplay and all older history intact while new origins revoke previous redo eligibility',async()=>{
 const ui=await restoredVisitHistoryKeyFixture('redo'),e=ui.elements;configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,calls=ui.pending.length,older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);assert.equal(pressBookmarkKey(ui,'p',{shiftKey:true}).defaultPrevented,true);assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'Return-target visit position cleared');assert.equal(pressBookmarkKey(ui,'p').defaultPrevented,true);e['playback-pause'].onclick();editBookmark(ui,'second origin draft',['crossing']);const jumping=e['bookmark-redo-clear-visit-jump-position-jump'].onclick();await flush();await completeReplay(ui,1);await jumping;assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'Target: Frame 2 / 3 · #2');assert.equal(pressBookmarkKey(ui,'P',{shiftKey:true}).defaultPrevented,false);assert.equal(e['bookmark-visit-clear-history-return'].disabled,false);assert.equal(e['bookmark-note'].value,'target draft');assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);
});

test('return-target visit Redo clear button works with shortcuts off, shows localized notice and preserves drafts/settings/playback/all older history',async()=>{
 for(const lang of ['en','zh-TW'])for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await restoredVisitHistoryKeyFixture(kind),e=ui.elements,redo=e['bookmark-redo-clear-visit-history-position'];e.lang.value=lang;e.lang.onchange();assert.equal(redo.disabled,false);assert.equal(redo.getAttribute('aria-keyshortcuts'),'Shift+p');e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(redo.getAttribute('aria-keyshortcuts'),'');configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement,calls=ui.pending.length,clouds=ui.cloudUpdates.length;redo.onclick();assert.equal(redo.disabled,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,lang==='en'?'Return-target visit position cleared':'已清除此次目標跳轉返回位置');assert.equal(e['bookmark-visit-clear-history-return'].disabled,true);assert.equal(e['bookmark-undo-clear-visit-history-position'].disabled,false);assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assert.equal(e['playback-speed'].value,'2');assertLoopValues(ui,1,2,true);assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);redo.onclick();assert.equal(ui.pending.length,calls);e['bookmark-undo-clear-visit-history-position'].onclick();assert.equal(redo.disabled,false);assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/#3$/);const returning=e['bookmark-visit-clear-history-return'].onclick();await flush();await completeReplay(ui,3);await returning;assert.equal(redo.disabled,true);assert.equal(e['bookmark-note'].value,'origin draft');await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');
 }
});

test('return-target visit Redo clear button disables for missing/new/reset origins and hidden/help/seek/write/jump/delete-dialog states without consuming eligibility',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-redo-clear-visit-history-position'].disabled,true);empty.elements['bookmark-redo-clear-visit-history-position'].onclick();assert.equal(replayRequests(empty).length,0);const fresh=await visitReturnBackFixture();fresh.elements['bookmark-redo-clear-visit-history-position'].onclick();assert.equal(fresh.elements['bookmark-redo-clear-visit-history-position'].disabled,true);assert.match(fresh.elements['bookmark-visit-clear-history-return-target'].textContent,/^Target:/);const ui=await restoredVisitHistoryKeyFixture(),e=ui.elements,redo=e['bookmark-redo-clear-visit-history-position'];const blocked=()=>{redo.onclick();assert.equal(redo.disabled,true);assert.match(e['bookmark-visit-clear-history-return-target'].textContent,/^Return-target visit position restored/)};ui.hide();blocked();ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();blocked();e['shortcut-help-close'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();blocked();e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();blocked();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const jumping=e['bookmark-undo-clear-visit-jump-position-jump'].onclick();await flush();blocked();await completeReplay(ui,1);await jumping;ui.setConfirm(()=>undefined);const removing=e['bookmark-delete'].onclick();await flush();assert.equal(e['bookmark-delete-dialog'].open,true);blocked();e['bookmark-delete-cancel'].onclick();await removing;assert.equal(redo.disabled,false);e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;redo.onclick();assert.equal(redo.disabled,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'No available target');
});

test('return-target visit Redo clear button preserves pending autoplay and revokes eligibility for fresh origins, with accessible initial disabled state and help',async()=>{
 const ui=await restoredVisitHistoryKeyFixture('redo'),e=ui.elements,redo=e['bookmark-redo-clear-visit-history-position'];configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,calls=ui.pending.length,older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);redo.onclick();assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(redo.disabled,true);e['bookmark-undo-clear-visit-history-position'].onclick();assert.equal(redo.disabled,false);e['playback-pause'].onclick();editBookmark(ui,'second origin draft',['crossing']);const jumping=e['bookmark-redo-clear-visit-jump-position-jump'].onclick();await flush();await completeReplay(ui,1);await jumping;redo.onclick();assert.equal(redo.disabled,true);assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'Target: Frame 2 / 3 · #2');assert.equal(e['bookmark-note'].value,'target draft');assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/id="bookmark-redo-clear-visit-history-position"[^>]*data-i="bookmarkHistoryRedoClear"[^>]*aria-describedby="bookmark-redo-clear-visit-history-position-target bookmark-history-help"[^>]*type="button" disabled/);assert.ok(html.includes('The Redo clear button works with shortcuts off'));
});

test('return-target visit Undo/Redo clear summaries follow their own exact target across localized undo/redo, not shown frame/filters, preserving all drafts/settings/history',async()=>{
 for(const lang of ['en','zh-TW'])for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitReturnBackFixture(kind),e=ui.elements,undo=e['bookmark-undo-clear-visit-history-position-target'],redo=e['bookmark-redo-clear-visit-history-position-target'],empty=lang==='en'?'No available target':'目前無可操作目標',target=lang==='en'?'Target: Frame 3 / 3 · #3':'目標: 影格 3 / 3 · #3';e.lang.value=lang;e.lang.onchange();assert.equal(undo.textContent,empty);assert.equal(redo.textContent,empty);assert.equal(e['bookmark-undo-clear-visit-history-position-action'].hidden,true);configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement,calls=ui.pending.length,clouds=ui.cloudUpdates.length;e['bookmark-clear-visit-history-position'].onclick();assert.equal(undo.textContent,target);assert.equal(redo.textContent,empty);assert.equal(e['bookmark-undo-clear-visit-history-position-action'].hidden,false);e['bookmark-undo-clear-visit-history-position'].onclick();assert.equal(undo.textContent,empty);assert.equal(redo.textContent,target);assert.equal(e['bookmark-undo-clear-visit-history-position-action'].hidden,true);e['bookmark-redo-clear-visit-history-position'].onclick();assert.equal(undo.textContent,target);assert.equal(redo.textContent,empty);assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assert.equal(e['playback-speed'].value,'2');assertLoopValues(ui,1,2,true);assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.doesNotMatch(undo.textContent,/draft/);assert.doesNotMatch(redo.textContent,/draft/);await showSaved(ui,3);assert.equal(undo.textContent,target);assert.equal(e['bookmark-note'].value,'origin draft');
 }
});

test('return-target visit clear summaries retain known blocked target identity and reset on fresh origins/consumed returns/Session changes',async()=>{
 const ui=await visitReturnBackFixture(),e=ui.elements,undo=e['bookmark-undo-clear-visit-history-position-target'],redo=e['bookmark-redo-clear-visit-history-position-target'];e['bookmark-clear-visit-history-position'].onclick();const blocked=()=>{assert.match(undo.textContent,/^Target: Frame 3 \/ 3 · #3 · /);assert.equal(e['bookmark-undo-clear-visit-history-position'].disabled,true);assert.equal(redo.textContent,'No available target')};ui.hide();blocked();ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();blocked();e['shortcut-help-close'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();blocked();e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();blocked();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(undo.textContent,'Target: Frame 3 / 3 · #3');e['bookmark-undo-clear-visit-history-position'].onclick();e['shortcut-help-open'].onclick();assert.match(redo.textContent,/^Target: Frame 3 \/ 3 · #3 · /);assert.equal(e['bookmark-redo-clear-visit-history-position'].disabled,true);e['shortcut-help-close'].onclick();assert.equal(redo.textContent,'Target: Frame 3 / 3 · #3');await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);const jumping=e['bookmark-undo-clear-visit-jump-position-jump'].onclick();await flush();assert.match(redo.textContent,/#3 · /);await completeReplay(ui,1);await jumping;assert.equal(undo.textContent,'No available target');assert.equal(redo.textContent,'No available target');e['bookmark-clear-visit-history-position'].onclick();assert.equal(undo.textContent,'Target: Frame 2 / 3 · #2');e['bookmark-undo-clear-visit-history-position'].onclick();assert.equal(redo.textContent,'Target: Frame 2 / 3 · #2');const returning=e['bookmark-visit-clear-history-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(redo.textContent,'No available target');e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(undo.textContent,'No available target');assert.equal(redo.textContent,'No available target');assert.equal(e['bookmark-undo-clear-visit-history-position-action'].hidden,true);
});

test('return-target visit clear summaries preserve pending autoplay and remain accessible, empty initially and independent of shortcuts',async()=>{
 const empty=await startUI();for(const kind of ['undo','redo'])assert.equal(empty.elements['bookmark-'+kind+'-clear-visit-history-position-target'].textContent,'No available target');const ui=await restoredVisitHistoryKeyFixture('redo'),e=ui.elements;e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const status=e['playback-status'].textContent,calls=ui.pending.length,older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);assert.equal(e['bookmark-redo-clear-visit-history-position-target'].textContent,'Target: Frame 3 / 3 · #3');e['bookmark-redo-clear-visit-history-position'].onclick();assert.equal(e['bookmark-undo-clear-visit-history-position-target'].textContent,'Target: Frame 3 / 3 · #3');assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-undo-clear-visit-history-position-target'].textContent,'Target: Frame 3 / 3 · #3');const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');for(const kind of ['undo','redo']){const id='bookmark-'+kind+'-clear-visit-history-position';assert.ok(html.includes('aria-describedby="'+id+'-target bookmark-history-help"'));assert.ok(html.includes('id="'+id+'-target" class="bookmark-history-target" role="status" aria-live="polite" aria-atomic="true"'))}assert.match(html,/id="bookmark-undo-clear-visit-history-position-action" class="bookmark-history-action" hidden/);assert.ok(html.includes('data-i="shortcutHelpVisitHistoryClearTargets"'));
});

async function visitHistoryTargetFixture(kind='undo',origin='undo'){
 const ui=await visitReturnBackFixture(origin),e=ui.elements;e['bookmark-clear-visit-history-position'].onclick();if(kind==='redo')e['bookmark-undo-clear-visit-history-position'].onclick();return ui;
}
function visitHistoryClearState(ui){
 const e=ui.elements;return [e['bookmark-visit-clear-history-return-target'].textContent,e['bookmark-undo-clear-visit-history-position-target'].textContent,e['bookmark-redo-clear-visit-history-position-target'].textContent,e['bookmark-visit-clear-history-return'].disabled,e['bookmark-clear-visit-history-position'].disabled,e['bookmark-undo-clear-visit-history-position'].hidden,e['bookmark-undo-clear-visit-history-position'].disabled,e['bookmark-redo-clear-visit-history-position'].disabled,e['bookmark-undo-clear-visit-history-position-action'].hidden];
}
test('return-target visit Undo/Redo target clicks pause and replay the exact saved frame, preserving both drafts/settings and all clear/deletion history',async()=>{
 for(const kind of ['undo','redo'])for(const origin of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitHistoryTargetFixture(kind,origin),e=ui.elements,id='bookmark-'+kind+'-clear-visit-history-position';e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,1,2);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();editBookmark(ui,'kept source draft',['crossing']);if(playing)e['playback-play'].onclick();const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),latest=visitHistoryClearState(ui),writes=bookmarkWrites(ui).length,calls=replayRequests(ui).length;assert.equal(e[id+'-jump'].disabled,false);const jumping=e[id+'-jump'].onclick();await flush();assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,3);await jumping;assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.equal(e['bookmark-tag-id-switch'].checked,true);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.deepEqual(visitHistoryClearState(ui),latest);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,1,2,true);assert.equal(e['playback-speed'].value,'2');assert.equal(bookmarkWrites(ui).length,writes);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'kept source draft');assert.equal(e['bookmark-tag-crossing'].checked,true);
 }
});

test('same-frame return-target history visits preserve edits and all eligibility without consuming the return point',async()=>{
 for(const kind of ['undo','redo']){
  const ui=await visitHistoryTargetFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-visit-history-position';let jumping=e[id+'-jump'].onclick();await flush();await completeReplay(ui,3);await jumping;editBookmark(ui,'edited target draft',['occlusion']);const latest=visitHistoryClearState(ui),older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);jumping=e[id+'-jump'].onclick();await flush();await completeReplay(ui,3);await jumping;assert.equal(e['bookmark-note'].value,'edited target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.deepEqual(visitHistoryClearState(ui),latest);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(e[id].disabled,false);
 }
});

test('return-target history jumps reject HTTP/hash/decode failures without replacing the shown image/draft and keep exact-target retry',async()=>{
 for(const kind of ['undo','redo'])for(const failure of ['http','snapshot','decode']){
  const ui=await visitHistoryTargetFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-visit-history-position',image=e.rgb.src;editBookmark(ui,'kept source draft',['crossing']);const latest=visitHistoryClearState(ui),older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);const jumping=e[id+'-jump'].onclick();await flush();if(failure==='http')ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);else if(failure==='snapshot')ui.respond('/api/sessions/session-a/frames/3/replay',{...replayResponse('session-a',3),snapshot_sha256:otherHash});else{ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await flush();ui.decode('data:image/png;base64,session-a-3',Error('synthetic decode failure'));ui.decode('data:image/jpeg;base64,session-a-depth-3')}await jumping;assertShownFrame(ui,1);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'kept source draft');assert.equal(e[id+'-jump'].disabled,false);assert.deepEqual(visitHistoryClearState(ui),latest);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);const retry=e[id+'-jump'].onclick();await flush();await completeReplay(ui,3);await retry;assert.equal(e['bookmark-note'].value,'origin draft');assert.deepEqual(visitHistoryClearState(ui),latest);
 }
});

test('return-target history jumps disable missing/hidden/help/seek/write targets and expose localized native buttons with empty-state guards',async()=>{
 const empty=await startUI();for(const kind of ['undo','redo']){const b=empty.elements['bookmark-'+kind+'-clear-visit-history-position-jump'];assert.equal(b.disabled,true);b.onclick()}assert.equal(replayRequests(empty).length,0);
 for(const kind of ['undo','redo']){
  const ui=await visitHistoryTargetFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-visit-history-position',calls=replayRequests(ui).length;e.lang.value='zh-TW';e.lang.onchange();assert.match(e[id+'-jump'].getAttribute('aria-label'),/目標: 影格 3 \/ 3 · #3/);for(const block of ['help','hidden','seek']){if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();assert.equal(replayRequests(ui).length,calls);if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(e[id+'-jump'].disabled,false)}e['bookmark-undo-delete'].onclick();await flush();assert.equal(e[id+'-jump'].disabled,true);e[id+'-jump'].onclick();assert.equal(replayRequests(ui).length,calls);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(e[id+'-jump'].disabled,false);
 }
 const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');for(const kind of ['undo','redo'])assert.ok(html.includes('id="bookmark-'+kind+'-clear-visit-history-position-jump" class="bookmark-history-jump" type="button" disabled'));assert.ok(html.includes('Click a target frame number, or press Enter/Space on its button'));
});

test('late return-target history replies cannot display old Session frames or restore cleared histories',async()=>{
 for(const kind of ['undo','redo']){
  const ui=await visitHistoryTargetFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-visit-history-position';const jumping=e[id+'-jump'].onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/3/replay',replayResponse('session-a',3));await jumping;assert.equal(e.result.hidden,true);assert.equal(e[id+'-jump'].disabled,true);assert.equal(e[id+'-target'].textContent,'No available target');assert.equal(e['bookmark-visit-clear-history-return-target'].textContent,'No available target');await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
 }
});

test('return-target history jumps pause and supersede pending autoplay without letting its late response change the exact target or clear history',async()=>{
 for(const kind of ['undo','redo']){
  const ui=await visitHistoryTargetFixture(kind),e=ui.elements,id='bookmark-'+kind+'-clear-visit-history-position';configureLoop(ui,1,2);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const latest=visitHistoryClearState(ui),older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),clouds=ui.cloudUpdates.length;const jumping=e[id+'-jump'].onclick();await flush();await completeReplay(ui,3);await jumping;ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();assertShownFrame(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.cloudUpdates.length,clouds+1);assert.deepEqual(visitHistoryClearState(ui),latest);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);
 }
});

async function visitHistoryBackFixture(kind='undo',origin='undo'){
 const ui=await visitHistoryTargetFixture(kind,origin),e=ui.elements;const jumping=e['bookmark-'+kind+'-clear-visit-history-position-jump'].onclick();await flush();await completeReplay(ui,3);await jumping;return ui;
}
test('return before this clear-history target visit restores the origin and both drafts while preserving all existing clear/deletion history and review settings',async()=>{
 for(const kind of ['undo','redo'])for(const origin of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitHistoryBackFixture(kind,origin),e=ui.elements,back=e['bookmark-visit-history-jump-return'];assert.equal(back.disabled,false);assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'Target: Frame 1 / 3 · #1');e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();editBookmark(ui,'edited visit draft',['occlusion']);if(playing)e['playback-play'].onclick();const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),latest=visitHistoryClearState(ui),writes=bookmarkWrites(ui).length,calls=replayRequests(ui).length;const returning=back.onclick();await flush();assert.equal(back.disabled,true);back.onclick();assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,1);await returning;assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.deepEqual(visitHistoryClearState(ui),latest);assert.equal(bookmarkWrites(ui).length,writes);assert.equal(back.disabled,true);assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'No available target');await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'edited visit draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);
 }
});

test('clear-history target visit return failures keep the shown draft/history and return point for exact-snapshot retry',async()=>{
 for(const kind of ['undo','redo'])for(const failure of ['http','snapshot','decode']){
  const ui=await visitHistoryBackFixture(kind),e=ui.elements,back=e['bookmark-visit-history-jump-return'],image=e.rgb.src;editBookmark(ui,'kept visit draft',['crossing']);const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),latest=visitHistoryClearState(ui);const returning=back.onclick();await flush();if(failure==='http')ui.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);else if(failure==='snapshot')ui.respond('/api/sessions/session-a/frames/1/replay',{...replayResponse('session-a',1),snapshot_sha256:otherHash});else{ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();ui.decode('data:image/png;base64,session-a-1',Error('synthetic decode failure'));ui.decode('data:image/jpeg;base64,session-a-depth-1')}await returning;assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'kept visit draft');assert.equal(back.disabled,false);assert.match(e['bookmark-visit-history-jump-return-target'].textContent,/#1$/);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.deepEqual(visitHistoryClearState(ui),latest);const retry=back.onclick();await flush();await completeReplay(ui,1);await retry;assert.equal(e['bookmark-note'].value,'target draft');assert.equal(back.disabled,true);
 }
});

test('clear-history target visit return origin survives same-frame/failed visits and clear operations, while a successful different-frame visit replaces it',async()=>{
 const ui=await visitHistoryBackFixture('redo'),e=ui.elements,summary=e['bookmark-visit-history-jump-return-target'],id='bookmark-redo-clear-visit-history-position-jump';let jump=e[id].onclick();await flush();await completeReplay(ui,3);await jump;assert.equal(summary.textContent,'Target: Frame 1 / 3 · #1');e['bookmark-redo-clear-visit-history-position'].onclick();assert.equal(summary.textContent,'Target: Frame 1 / 3 · #1');e['bookmark-undo-clear-visit-history-position'].onclick();await showSaved(ui,2);editBookmark(ui,'second origin draft',['crossing']);jump=e[id].onclick();await flush();ui.respond('/api/sessions/session-a/frames/3/replay',{detail:'synthetic unavailable'},false,404);await jump;assert.equal(summary.textContent,'Target: Frame 1 / 3 · #1');assert.equal(e['bookmark-note'].value,'second origin draft');jump=e[id].onclick();await flush();await completeReplay(ui,3);await jump;assert.equal(summary.textContent,'Target: Frame 2 / 3 · #2');const latest=visitHistoryClearState(ui),older=visitClearOlderHistory(ui),own=visitReturnClearState(ui);const returning=e['bookmark-visit-history-jump-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(e['bookmark-note'].value,'second origin draft');assert.deepEqual(visitHistoryClearState(ui),latest);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(summary.textContent,'No available target');
});

test('clear-history target visit return disables missing/hidden/help/seek/write/jump states without consuming its origin and exposes localized accessible help',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-visit-history-jump-return'].disabled,true);empty.elements['bookmark-visit-history-jump-return'].onclick();assert.equal(replayRequests(empty).length,0);const ui=await visitHistoryBackFixture(),e=ui.elements,back=e['bookmark-visit-history-jump-return'];e.lang.value='zh-TW';e.lang.onchange();assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'目標: 影格 1 / 3 · #1');const calls=replayRequests(ui).length;for(const block of ['help','hidden','seek']){if(block==='help')e['shortcut-help-open'].onclick();else if(block==='hidden')ui.hide();else{e['replay-progress'].value='2';e['replay-progress'].oninput()}back.onclick();assert.equal(back.disabled,true);assert.equal(replayRequests(ui).length,calls);if(block==='help')e['shortcut-help-close'].onclick();else if(block==='hidden'){ui.document.hidden=false;ui.dispatch('visibilitychange')}else e['playback-pause'].onclick();assert.equal(back.disabled,false)}e['bookmark-undo-delete'].onclick();await flush();back.onclick();assert.equal(back.disabled,true);assert.equal(replayRequests(ui).length,calls);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();assert.equal(back.disabled,false);const jumping=e['bookmark-undo-clear-visit-history-position-jump'].onclick();await flush();back.onclick();assert.equal(back.disabled,true);await completeReplay(ui,3);await jumping;assert.equal(back.disabled,false);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/id="bookmark-visit-history-jump-return"[^>]*data-i="bookmarkVisitHistoryJumpReturn"[^>]*aria-describedby="bookmark-visit-history-jump-return-target bookmark-history-help"[^>]*type="button" disabled/);assert.ok(html.includes('data-i="shortcutHelpVisitHistoryJumpReturn"'));
});

test('Session/frame-list reload discards clear-history target visit return points and late return replies cannot change the new Session',async()=>{
 for(const kind of ['undo','redo']){
  const ui=await visitHistoryBackFixture(kind),e=ui.elements;const returning=e['bookmark-visit-history-jump-return'].onclick();await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await returning;assert.equal(e.result.hidden,true);assert.equal(e['bookmark-visit-history-jump-return'].disabled,true);assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'No available target');await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
 }
 const ui=await visitHistoryBackFixture(),e=ui.elements;const refresh=e.refresh.onclick();await flush();ui.respond('/api/sessions/status',{enabled:true});await flush();ui.respond('/api/sessions',{sessions:[{session_id:'session-a',label:'A',frame_count:3}]});await flush();await finishFrames(ui,'session-a',true,null,[1,2,3],[]);await refresh;assert.equal(e['bookmark-visit-history-jump-return'].disabled,true);assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'No available target');
});

test('clear-history target visit return supersedes pending autoplay and preserves all pre-existing history and source draft',async()=>{
 const ui=await visitHistoryBackFixture('redo'),e=ui.elements;configureLoop(ui,2,3);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const latest=visitHistoryClearState(ui),older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),clouds=ui.cloudUpdates.length;const returning=e['bookmark-visit-history-jump-return'].onclick();await flush();await completeReplay(ui,1);await returning;ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.cloudUpdates.length,clouds+1);assert.deepEqual(visitHistoryClearState(ui),latest);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.equal(e['bookmark-visit-history-jump-return'].disabled,true);
});

test('V and Caps Lock V return before clear-history target visits, pause and preserve both drafts/settings/all previous clear history',async()=>{
 for(const key of ['v','V'])for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitHistoryBackFixture(kind),e=ui.elements;configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();editBookmark(ui,'edited visit draft',['crossing']);if(playing)e['playback-play'].onclick();e.result.focus();const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),latest=visitHistoryClearState(ui),calls=replayRequests(ui).length,writes=bookmarkWrites(ui).length;assert.equal(pressBookmarkKey(ui,key).defaultPrevented,true);await flush();assert.equal(e['bookmark-visit-history-jump-return'].disabled,true);assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);assert.equal(replayRequests(ui).length,calls+1);await completeReplay(ui,1);await flush();assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.equal(e['bookmark-tag-occlusion'].checked,true);assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.document.activeElement,e.result);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assertLoopValues(ui,2,3,true);assert.equal(e['playback-speed'].value,'2');assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.deepEqual(visitHistoryClearState(ui),latest);assert.equal(bookmarkWrites(ui).length,writes);assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'No available target');assert.equal(pressBookmarkKey(ui,key).defaultPrevented,false);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'edited visit draft');assert.equal(e['bookmark-tag-crossing'].checked,true);
 }
});

test('V ignores note/search/native/custom/composed/active editors, IME, modifiers/repeats/hidden events, help and opt-out with accessible metadata',async()=>{
 const ui=await visitHistoryBackFixture(),e=ui.elements,calls=ui.pending.length,editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','spinbutton','slider','listbox','radiogroup','menu','tablist','tree','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);for(const target of editors){assert.equal(pressBookmarkKey(ui,'v',{target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'V',{composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'v',{target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'V',props).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'v',{defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'v').defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'v').defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'v').defaultPrevented,false);e['shortcut-help-close'].onclick();assert.equal(e['bookmark-visit-history-jump-return'].getAttribute('aria-keyshortcuts'),'v');assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('v'));e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressBookmarkKey(ui,'v').defaultPrevented,false);assert.equal(e['bookmark-visit-history-jump-return'].getAttribute('aria-keyshortcuts'),'');assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');assert.equal(ui.pending.length,calls);assert.equal(e['bookmark-visit-history-jump-return'].disabled,false);e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.equal(e['bookmark-visit-history-jump-return'].getAttribute('aria-keyshortcuts'),'v');const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>V<\/kbd>.*data-i="bookmarkVisitHistoryJumpReturn"/);assert.ok(html.includes('Press V outside editors to run the same return action'));
});

test('V guards absent/seeking/writing/jumping/delete-dialog/reset return points and rejects late replies after Session change',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'v').defaultPrevented,false);const ui=await visitHistoryBackFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'v').defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'v').defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const jumping=e['bookmark-undo-clear-visit-history-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'v').defaultPrevented,false);await completeReplay(ui,3);await jumping;await showSaved(ui,1);ui.setConfirm(()=>undefined);const removing=e['bookmark-delete'].onclick();await flush();assert.equal(e['bookmark-delete-dialog'].open,true);assert.equal(pressBookmarkKey(ui,'v').defaultPrevented,false);e['bookmark-delete-cancel'].onclick();await removing;await showSaved(ui,3);assert.equal(pressBookmarkKey(ui,'V').defaultPrevented,true);await flush();e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[bookmarkRecord(2,{note:'other Session'})]);await changed;ui.respond('/api/sessions/session-a/frames/1/replay',replayResponse('session-a',1));await flush();assert.equal(e.result.hidden,true);assert.equal(pressBookmarkKey(ui,'v').defaultPrevented,false);assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'No available target');await showSaved(ui,2,{sid:'session-b'});assert.equal(e['bookmark-note'].value,'other Session');
});

test('V retains the origin and draft after return failure for retry and supersedes pending autoplay without altering previous history',async()=>{
 const failed=await visitHistoryBackFixture('redo'),f=failed.elements;f.lang.value='zh-TW';f.lang.onchange();editBookmark(failed,'kept visit draft',['crossing']);const image=f.rgb.src,latest=visitHistoryClearState(failed),older=visitClearOlderHistory(failed),own=visitReturnClearState(failed);assert.equal(pressBookmarkKey(failed,'V').defaultPrevented,true);await flush();failed.respond('/api/sessions/session-a/frames/1/replay',{detail:'synthetic unavailable'},false,404);await flush();assertShownFrame(failed,3);assert.equal(f.rgb.src,image);assert.equal(f['bookmark-note'].value,'kept visit draft');assert.equal(f['bookmark-visit-history-jump-return-target'].textContent,'目標: 影格 1 / 3 · #1');assert.deepEqual(visitHistoryClearState(failed),latest);assert.deepEqual(visitClearOlderHistory(failed),older);assert.deepEqual(visitReturnClearState(failed),own);assert.equal(pressBookmarkKey(failed,'v').defaultPrevented,true);await flush();await completeReplay(failed,1);await flush();assert.equal(f['bookmark-note'].value,'target draft');
 const ui=await visitHistoryBackFixture('redo'),e=ui.elements;configureLoop(ui,2,3);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const history=visitHistoryClearState(ui),previous=visitClearOlderHistory(ui),clear=visitReturnClearState(ui),clouds=ui.cloudUpdates.length;assert.equal(pressBookmarkKey(ui,'v').defaultPrevented,true);await flush();await completeReplay(ui,1);await flush();ui.respond('/api/sessions/session-a/frames/2/replay',replayResponse('session-a',2));await flush();assertShownFrame(ui,1);assert.equal(e['bookmark-note'].value,'target draft');assert.match(e['playback-status'].textContent,/Paused/);assert.equal(ui.cloudUpdates.length,clouds+1);assert.deepEqual(visitHistoryClearState(ui),history);assert.deepEqual(visitClearOlderHistory(ui),previous);assert.deepEqual(visitReturnClearState(ui),clear);
});

test('Shift V clears only this clear-history target visit return point while preserving image/drafts/playback/settings and every existing clear history',async()=>{
 for(const key of ['v','V'])for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitHistoryBackFixture(kind),e=ui.elements;editBookmark(ui,'kept visit draft',['crossing']);configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();e.result.focus();if(playing)e['playback-play'].onclick();const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),latest=visitHistoryClearState(ui),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,true);assert.equal(e['bookmark-visit-history-jump-return'].disabled,true);assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'No available target');assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'kept visit draft');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assert.equal(e['playback-speed'].value,'2');assertLoopValues(ui,2,3,true);assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.deepEqual(visitHistoryClearState(ui),latest);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);assert.equal(pressBookmarkKey(ui,key,{shiftKey:true}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'v').defaultPrevented,false);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'kept visit draft');
 }
});

test('Shift V ignores note/search/native/custom/composed/active editors, IME, modifiers/repeats/hidden events, help and opt-out with shortcut metadata',async()=>{
 const ui=await visitHistoryBackFixture(),e=ui.elements,calls=ui.pending.length,editors=[e['bookmark-note'],e['bookmark-search'],e['bookmark-filter-tag'],e['replay-progress']];for(const role of ['textbox','searchbox','combobox','spinbutton','slider','listbox','radiogroup','menu','tablist','tree','grid']){const el=new Element('div');el.setAttribute('role',role);editors.push(el)}const editable=new Element('div');editable.setAttribute('contenteditable','true');editors.push(editable);for(const target of editors){assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true,target}).defaultPrevented,false);const child=new Element('span');child.parentElement=target;assert.equal(pressBookmarkKey(ui,'V',{shiftKey:true,composedPath:()=>[child,target]}).defaultPrevented,false)}for(const target of [e['bookmark-note'],e['bookmark-search']]){target.focus();assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true,target:e.result}).defaultPrevented,false)}e.result.focus();for(const props of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{keyCode:229}])assert.equal(pressBookmarkKey(ui,'V',{shiftKey:true,...props}).defaultPrevented,false);assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true,defaultPrevented:true}).defaultPrevented,true);ui.dispatch('compositionstart');assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true}).defaultPrevented,false);ui.dispatch('compositionend');ui.hide();assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true}).defaultPrevented,false);ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true}).defaultPrevented,false);e['shortcut-help-close'].onclick();assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('Shift+v'));e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true}).defaultPrevented,false);assert.equal(e.result.getAttribute('aria-keyshortcuts'),'');e['bookmark-shortcuts-enabled'].checked=true;e['bookmark-shortcuts-enabled'].onchange();assert.ok(e.result.getAttribute('aria-keyshortcuts').split(' ').includes('Shift+v'));assert.equal(ui.pending.length,calls);assert.equal(e['bookmark-visit-history-jump-return'].disabled,false);assert.match(e['bookmark-visit-history-jump-return-target'].textContent,/#1$/);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/<kbd>Shift<\/kbd> \+ <kbd>V<\/kbd><\/dt><dd data-i="shortcutHelpClearVisitHistoryJumpReturn"/);
});

test('Shift V guards absent/seek/write/jump/delete-dialog/returning/Session-reset positions without clearing busy return points',async()=>{
 const empty=await startUI();assert.equal(pressBookmarkKey(empty,'V',{shiftKey:true}).defaultPrevented,false);const ui=await visitHistoryBackFixture(),e=ui.elements;e['replay-progress'].value='2';e['replay-progress'].oninput();assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true}).defaultPrevented,false);e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true}).defaultPrevented,false);ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const jumping=e['bookmark-undo-clear-visit-history-position-jump'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,3);await jumping;await showSaved(ui,1);ui.setConfirm(()=>undefined);const removing=e['bookmark-delete'].onclick();await flush();assert.equal(e['bookmark-delete-dialog'].open,true);assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true}).defaultPrevented,false);e['bookmark-delete-cancel'].onclick();await removing;await showSaved(ui,3);const returning=e['bookmark-visit-history-jump-return'].onclick();await flush();assert.equal(pressBookmarkKey(ui,'V',{shiftKey:true}).defaultPrevented,false);await completeReplay(ui,1);await returning;assert.equal(pressBookmarkKey(ui,'V',{shiftKey:true}).defaultPrevented,false);e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true}).defaultPrevented,false);assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'No available target');
});

test('Shift V preserves pending autoplay and allows a fresh origin without changing existing clear histories or either draft',async()=>{
 const ui=await visitHistoryBackFixture('redo'),e=ui.elements;configureLoop(ui,2,3);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const latest=visitHistoryClearState(ui),older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),status=e['playback-status'].textContent,calls=ui.pending.length;assert.equal(pressBookmarkKey(ui,'v',{shiftKey:true}).defaultPrevented,true);assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitHistoryClearState(ui),latest);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(e['bookmark-visit-history-jump-return'].disabled,true);e['playback-pause'].onclick();editBookmark(ui,'second origin draft',['crossing']);const jumping=e['bookmark-redo-clear-visit-history-position-jump'].onclick();await flush();await completeReplay(ui,3);await jumping;assert.equal(e['bookmark-visit-history-jump-return'].disabled,false);assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'Target: Frame 2 / 3 · #2');const returning=e['bookmark-visit-history-jump-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(e['bookmark-note'].value,'second origin draft');assert.deepEqual(visitHistoryClearState(ui),latest);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'origin draft');
});

test('clear-history target visit return clear button works with shortcuts off and preserves frame/drafts/settings/playback/all existing histories',async()=>{
 for(const kind of ['undo','redo'])for(const playing of [false,true]){
  const ui=await visitHistoryBackFixture(kind),e=ui.elements,clear=e['bookmark-clear-history-jump-return-position'];assert.equal(clear.disabled,false);assert.equal(clear.getAttribute('aria-keyshortcuts'),'Shift+v');e['bookmark-shortcuts-enabled'].checked=false;e['bookmark-shortcuts-enabled'].onchange();assert.equal(clear.getAttribute('aria-keyshortcuts'),'');editBookmark(ui,'kept visit draft',['crossing']);configureLoop(ui,2,3);filterBookmarkTag(ui,'general');searchBookmarkNotes(ui,'kept query');e['playback-speed'].value='2';e['playback-speed'].onchange();if(playing)e['playback-play'].onclick();e.result.focus();const older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),latest=visitHistoryClearState(ui),calls=ui.pending.length,clouds=ui.cloudUpdates.length,image=e.rgb.src,status=e['playback-status'].textContent,active=ui.document.activeElement;clear.onclick();assert.equal(clear.disabled,true);assert.equal(e['bookmark-visit-history-jump-return'].disabled,true);assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'No available target');assertShownFrame(ui,3);assert.equal(e.rgb.src,image);assert.equal(e['bookmark-note'].value,'kept visit draft');assert.equal(e['bookmark-tag-crossing'].checked,true);assert.equal(e['bookmark-search'].value,'kept query');assert.equal(e['bookmark-filter-tag'].value,'general');assert.equal(e['playback-speed'].value,'2');assertLoopValues(ui,2,3,true);assert.equal(e['playback-status'].textContent,status);assert.equal(ui.document.activeElement,active);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);assert.deepEqual(visitHistoryClearState(ui),latest);assert.equal(ui.pending.length,calls);assert.equal(ui.cloudUpdates.length,clouds);clear.onclick();assert.equal(ui.pending.length,calls);await showSaved(ui,1);assert.equal(e['bookmark-note'].value,'target draft');await showSaved(ui,3);assert.equal(e['bookmark-note'].value,'kept visit draft');
 }
});

test('clear-history visit return clear button disables missing/hidden/help/seek/write/jump/return/reset states without consuming blocked positions',async()=>{
 const empty=await startUI();assert.equal(empty.elements['bookmark-clear-history-jump-return-position'].disabled,true);empty.elements['bookmark-clear-history-jump-return-position'].onclick();assert.equal(replayRequests(empty).length,0);const ui=await visitHistoryBackFixture(),e=ui.elements,clear=e['bookmark-clear-history-jump-return-position'];const blocked=()=>{clear.onclick();assert.equal(clear.disabled,true);assert.match(e['bookmark-visit-history-jump-return-target'].textContent,/#1/)};ui.hide();blocked();ui.document.hidden=false;ui.dispatch('visibilitychange');e['shortcut-help-open'].onclick();blocked();e['shortcut-help-close'].onclick();e['replay-progress'].value='2';e['replay-progress'].oninput();blocked();e['playback-pause'].onclick();e['bookmark-undo-delete'].onclick();await flush();blocked();ui.respond('/api/sessions/session-a/frames/1/bookmark',bookmarkResponse('session-a',[bookmarkRecord(1,{tags:['crossing']})]));await flush();const jumping=e['bookmark-undo-clear-visit-history-position-jump'].onclick();await flush();blocked();await completeReplay(ui,3);await jumping;assert.equal(clear.disabled,false);const returning=e['bookmark-visit-history-jump-return'].onclick();await flush();blocked();await completeReplay(ui,1);await returning;clear.onclick();assert.equal(clear.disabled,true);e['sessions-list'].value='session-b';const changed=e['sessions-list'].onchange();await flush();await finishFrames(ui,'session-b',true,null,[1,2,3],[]);await changed;clear.onclick();assert.equal(clear.disabled,true);assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'No available target');
});

test('clear-history visit return clear button leaves pending autoplay intact and permits fresh origins, with accessible initial state and bilingual help',async()=>{
 const ui=await visitHistoryBackFixture('redo'),e=ui.elements,clear=e['bookmark-clear-history-jump-return-position'];configureLoop(ui,2,3);e['playback-play'].onclick();await ui.tick(200);assert.ok(ui.pending.some(p=>!p.done&&p.url==='/api/sessions/session-a/frames/2/replay'));const latest=visitHistoryClearState(ui),older=visitClearOlderHistory(ui),own=visitReturnClearState(ui),status=e['playback-status'].textContent,calls=ui.pending.length;clear.onclick();assert.equal(e['playback-status'].textContent,status);assert.equal(ui.pending.length,calls);assert.deepEqual(visitHistoryClearState(ui),latest);assert.deepEqual(visitClearOlderHistory(ui),older);assert.deepEqual(visitReturnClearState(ui),own);await completeReplay(ui,2);assertShownFrame(ui,2);assert.equal(clear.disabled,true);e['playback-pause'].onclick();editBookmark(ui,'second origin draft',['crossing']);const jumping=e['bookmark-redo-clear-visit-history-position-jump'].onclick();await flush();await completeReplay(ui,3);await jumping;assert.equal(clear.disabled,false);assert.equal(e['bookmark-visit-history-jump-return-target'].textContent,'Target: Frame 2 / 3 · #2');e.lang.value='zh-TW';e.lang.onchange();assert.equal(clear.disabled,false);const returning=e['bookmark-visit-history-jump-return'].onclick();await flush();await completeReplay(ui,2);await returning;assert.equal(e['bookmark-note'].value,'second origin draft');assert.equal(clear.disabled,true);const html=fs.readFileSync(path.join(root,'static/sessions.html'),'utf8');assert.match(html,/id="bookmark-clear-history-jump-return-position"[^>]*data-i="bookmarkClearHistoryJumpReturnPosition"[^>]*aria-describedby="bookmark-visit-history-jump-return-target bookmark-history-help"[^>]*type="button" disabled/);assert.ok(html.includes('The clear button works with shortcuts off'));
});
