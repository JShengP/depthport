// SPDX-License-Identifier: AGPL-3.0-only
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let toggle;
const button={textContent:'',addEventListener:(type,fn)=>{if(type==='click')toggle=fn;}};
const labels=[{dataset:{en:'Saved AI results',zh:'AI 保存結果'},textContent:''}];
const links=['./v0.1/','./v0.2/','./v0.3/','../v0.2/','../v0.1/synthetic.html','./results/','../results/','../'].map(href=>({href,getAttribute(){return this.href;},setAttribute(k,v){this[k]=v;}}));
const images=['v01-cloud','v02-inspector','v03-replay'].map(name=>({dataset:{srcEn:`./media/pages-${name}.en.jpg`,srcZh:`./media/pages-${name}.zh-TW.jpg`,altEn:name+' actual saved data',altZh:name+' 真實保存資料'}}));
const document={body:{dataset:{showcase:'home'}},documentElement:{lang:'en'},querySelector:s=>s==='[data-lang-switch]'?button:null,querySelectorAll:s=>s==='[data-en][data-zh]'?labels:s.startsWith('a[href^=')?links:s==='img[data-src-en][data-src-zh]'?images:[],dispatchEvent(){}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../website/showcase.js'),'utf8'),{document,location:{search:'?lang=en'},navigator:{language:'en'},localStorage:{getItem(){return null;},setItem(){}},URLSearchParams,Event:class{constructor(type){this.type=type;}}});
function check(lang){
 assert.equal(document.documentElement.lang,lang==='en'?'en':'zh-Hant');
 for(const img of images){assert.equal(img.src,lang==='en'?img.dataset.srcEn:img.dataset.srcZh);assert.equal(img.alt,lang==='en'?img.dataset.altEn:img.dataset.altZh);}
 for(let i=0;i<4;i++)assert.equal(links[i].href,links[i].href.split('?')[0]+'?lang='+lang);
 assert.equal(links[4].href,'../v0.1/synthetic.html');
 for(const link of links.slice(5))assert.equal(link.href,link.href.split('?')[0]+'?lang='+lang);
}
check('en');toggle();check('zh-TW');assert.equal(labels[0].textContent,'AI 保存結果');toggle();check('en');
console.log('Home card images, alt text and all three version links follow language changes: PASS');
