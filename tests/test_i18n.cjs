/* SPDX-License-Identifier: AGPL-3.0-only */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'static/i18n.js'), 'utf8');
function load(search='', saved=null, navigatorLanguage='en-US', blockStorage=false) {
  const store = {value:saved};
  const window = {location:{search, href:'http://localhost/'+search}, navigator:{language:navigatorLanguage},
    history:{replaceState(){}}, localStorage:{getItem(){if(blockStorage)throw Error('blocked');return store.value;},setItem(k,v){if(blockStorage)throw Error('blocked');store.value=v;}}};
  const sandbox = {window, URLSearchParams, URL};vm.runInNewContext(src,sandbox);return [window.DepthPortI18n,store];
}
let [api,store]=load('?lang=en','zh-TW','zh-TW');assert.equal(api.language,'en');
assert.equal(load('', 'en', 'zh-TW')[0].language,'en');
assert.equal(load('', null, 'zh-HK')[0].language,'zh-TW');
assert.equal(load('', null, 'en-US',true)[0].language,'en');
api.setLanguage('zh-TW');assert.equal(store.value,'zh-TW');assert.equal(api.t('source.heading'),'影像來源');
api.setLanguage('en');assert.equal(api.t('source.heading'),'Image source');
const en=Object.keys(api.messages.en).sort(),zh=Object.keys(api.messages['zh-TW']).sort();
assert.deepEqual(en,zh);
for(const key of en){
 assert.ok(api.messages.en[key].trim()&&api.messages['zh-TW'][key].trim());
 const holes=s=>(s.match(/\{\w+\}/g)||[]).sort();
 assert.deepEqual(holes(api.messages.en[key]),holes(api.messages['zh-TW'][key]),key);
}
const html=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
for(const match of html.matchAll(/data-i18n(?:-(?:aria-label|title|alt|placeholder))?="([^"]+)"/g)) assert.ok(api.messages.en[match[1]],match[1]);
assert.equal(api.t('cloud.caption',{model:'test',frame:12,unit:'m'}),'test · frame 12 · m');
console.log(`PASS: ${en.length} bilingual keys; placeholders, DOM references, URL priority, saved choice and blocked-storage fallback.`);
