// SPDX-License-Identifier: AGPL-3.0-only
// Execute the built page's deferred dependency order using the real software renderer.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const page=path.resolve(process.argv[2]),html=fs.readFileSync(page,'utf8');
const scripts=[...html.matchAll(/<script\b([^>]+)>/g)].map(m=>({src:m[1].match(/src="([^"]+)"/)[1],defer:/\bdefer\b/.test(m[1])}));
function run(unavailable=false){
 const notes=[],nodes=new Map(),rafs=[];let toggle,draws=0;
 function context(cloud){return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),fillRect(){if(cloud)draws++;}},{get:(o,k)=>k in o?o[k]:()=>{}});}
 for(const id of ['rgbField','depthField','depthHistogram','syntheticCloud','pixelValue','depthValue','xyzValue','semanticValue','maskToggle','spatialReset']){
  const ctx=context(id==='syntheticCloud');nodes.set('#'+id,{id,width:640,height:360,clientWidth:640,clientHeight:360,dataset:{},events:{},textContent:'',
   addEventListener(n,f){this.events[n]=f;},setAttribute(k,v){this[k]=v;},setPointerCapture(){},
   getContext(type){return type==='2d'&&!(unavailable&&id==='syntheticCloud')?ctx:null;},
   getBoundingClientRect(){return{left:0,top:0,width:640,height:360};},insertAdjacentElement(where,n){notes.push(n);}});
 }
 const button={addEventListener(n,f){toggle=f;}};
 const document={body:{dataset:{showcase:'spatial'}},documentElement:{},
  querySelector:s=>s==='[data-lang-switch]'?button:nodes.get(s),
  querySelectorAll:s=>s==='[data-en][data-zh]'?notes:[],dispatchEvent(){},
  createElement:()=>({dataset:{},textContent:'',setAttribute(k,v){this[k]=v;}})};
 const window={devicePixelRatio:1};const sandbox=vm.createContext({window,document,location:{search:'?lang=zh-TW'},navigator:{language:'zh-TW'},
  localStorage:{getItem(){return null;},setItem(){}},URLSearchParams,Event:class{},performance:{now:()=>100},requestAnimationFrame:f=>{rafs.push(f);}});
 for(const script of scripts.filter(s=>/\/(viewer|showcase)\.js(?:\?|$)/.test(s.src))){
  assert.ok(script.defer,'Order under test is the actual deferred HTML order');
  vm.runInContext(fs.readFileSync(path.resolve(path.dirname(page),script.src.split('?')[0]),'utf8'),sandbox,{filename:script.src});
 }
 if(!unavailable){
  assert.equal(notes.length,0,'Supported Canvas2D must not display an initialization failure');
  assert.equal(rafs.length,1,'Synthetic CloudViewer must be constructed after its dependency');
  rafs.shift()();assert.ok(draws>1000,'Real software renderer must draw the generated cloud');
  assert.ok(nodes.get('#syntheticCloud').events.pointerdown,'Cloud retains orbit controls');
 }else{
  assert.equal(notes.length,1);assert.equal(notes[0].role,'status');assert.match(notes[0].textContent,/點雲未能初始化/);
  toggle();assert.match(notes[0].textContent,/Point cloud could not initialize/);
  toggle();assert.match(notes[0].textContent,/點雲未能初始化/);
  assert.doesNotMatch(notes[0].textContent,/瀏覽器無法/);
 }
 nodes.get('#rgbField').events.click({currentTarget:nodes.get('#rgbField'),clientX:100,clientY:120});
 assert.equal(nodes.get('#pixelValue').textContent,'(100, 120)');
 nodes.get('#maskToggle').events.click();assert.equal(nodes.get('#maskToggle')['aria-pressed'],'true');
}
run();run(true);console.log('Built v0.2 deferred renderer order, software drawing, inspector/mask and bilingual failure: PASS');
