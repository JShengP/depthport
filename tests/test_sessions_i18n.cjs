/* SPDX-License-Identifier: AGPL-3.0-only */
const fs=require('node:fs'),assert=require('node:assert/strict');
const js=fs.readFileSync('static/sessions.js','utf8');
const html=fs.readFileSync('static/sessions.html','utf8');
const match=js.match(/const tr=\{([\s\S]*?)\n\};/);
assert(match,'Session dictionary missing');
const en=(match[1].match(/en:\{([^\n]+)\}/)||[])[1];
const zh=(match[1].match(/'zh-TW':\{([^\n]+)\}/)||[])[1];
assert(en&&zh,'Both languages required');
const keys=t=>new Set([...t.matchAll(/(?:^|,)\s*([A-Za-z][A-Za-z0-9]*):/g)].map(v=>v[1]));
const a=keys(en),b=keys(zh);assert.deepEqual([...a].sort(),[...b].sort());
for(const match of html.matchAll(/data-i="([a-zA-Z]+)"/g))assert(a.has(match[1]),'Missing translation '+match[1]);
assert(a.size>=16);console.log('Session UI bilingual dictionary: '+a.size+' matching keys');
