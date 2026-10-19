/* SPDX-License-Identifier: AGPL-3.0-only */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'static/spatial.js'),'utf8');
const html=fs.readFileSync(path.join(root,'static/spatial.html'),'utf8');
const window={DepthPortI18n:{language:'en'}};
vm.runInNewContext(source,{window,document:{addEventListener(){}},console});
const words=window.DepthPortSpatialI18n;
assert.ok(words?.en&&words?.['zh-TW']);
assert.deepEqual(Object.keys(words.en).sort(),Object.keys(words['zh-TW']).sort());
for(const [key,value] of Object.entries(words.en)){
 assert.ok(value.trim()&&words['zh-TW'][key].trim(),key);
}
for(const m of html.matchAll(/data-tr="([^"]+)"/g))assert.ok(words.en[m[1]],m[1]);
assert.ok(html.includes('id="compareCards"')&&html.includes('id="semanticCloud"'));
assert.ok(html.includes('id="rgbImage"')&&html.includes('id="depthImage"'));
console.log(`PASS: ${Object.keys(words.en).length} v0.2 spatial bilingual keys and HTML references`);
