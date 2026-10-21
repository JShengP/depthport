// SPDX-License-Identifier: AGPL-3.0-only
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {mountCloud}=require('../website/cloud-demo.js');
const {withDeadline}=require('../website/real-results.js');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../website/data/bus/manifest.json')));
const nodes=new Map(),calls=[],renders=[];let fail=false;
for(const key of ['cloudDemo','savedCloud','cloudStatus','cloudRetry','cloudEngine','cloudPointSize','cloudColor','cloudHome','cloudUnits','cloudProvenance','cloudRGB'])nodes.set('#'+key,{value:key==='cloudEngine'?'da2-small':'',textContent:'',hidden:false,disabled:false,setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}});
const events={},doc={documentElement:{lang:'en'},querySelector:s=>{assert.ok(nodes.has(s),'Unexpected spatial element '+s);return nodes.get(s);},addEventListener:(n,fn)=>events[n]=fn};
class Viewer{setPoints(){renders.push(null);}setPacked(p,n){renders.push({packed:p,count:n});}setColorMode(v){this.colour=v;}reset(){}}
const root={CloudViewer:Viewer,RealResults:{withDeadline,async readJSON(url){calls.push(url);if(fail)throw Error('Synthetic transport failure');if(url.endsWith('manifest.json'))return manifest;assert.match(url,/^\.\.\/data\/bus\/previews\/(yolo26|da2-small|da3-small|da3-metric)\.json$/);const id=url.split('/').at(-1);const full=JSON.parse(fs.readFileSync(path.join(__dirname,'../website/data/bus/',id)));return Object.fromEntries(['engine','model','width','height','rgb','cloud','color_range'].map(k=>[k,full[k]]));}}};
(async()=>{
 const ui=mountCloud(root,doc);await ui.ready;
 assert.match(nodes.get('#cloudStatus').textContent,/exported points/);assert.match(nodes.get('#cloudUnits').textContent,/not metres/);
 for(const entry of manifest.engines){nodes.get('#cloudEngine').value=entry.id;await ui.load();const original=JSON.parse(fs.readFileSync(path.join(__dirname,'../website/data/bus/',entry.path)));assert.deepEqual(renders.at(-1),{packed:original.cloud.packed,count:original.cloud.count});assert.equal(nodes.get('#cloudDemo')['aria-busy'],'false');assert.equal(nodes.get('#cloudEngine').disabled,false);}
 assert.ok(!calls.some(x=>x.includes('semantic')||(/\/bus\/[^/]+\.json$/.test(x)&&!x.endsWith('manifest.json'))));
 // A new mount must show an actionable failure, clear stale output and recover.
 fail=true;const broken=mountCloud(root,doc);await broken.ready;assert.equal(nodes.get('#cloudRetry').hidden,false);assert.equal(nodes.get('#cloudStatus').role,'alert');assert.equal(renders.at(-1),null);assert.equal(nodes.get('#cloudProvenance').textContent,'');
 fail=false;await broken.load();assert.equal(nodes.get('#cloudRetry').hidden,true);assert.equal(nodes.get('#cloudStatus').role,'status');
 doc.documentElement.lang='zh-Hant';events['depthport:language']();assert.match(nodes.get('#cloudStatus').textContent,/匯出點/);console.log('Cloud-only boundary: four original packs, no full arrays/masks, retry and language: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
