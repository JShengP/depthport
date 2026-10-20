/* SPDX-License-Identifier: AGPL-3.0-only */
(function(root){
'use strict';
const normalize=value=>String(value).normalize('NFKC').toLocaleLowerCase();
function matches(record,filters,search=''){
 for(const [facet,value] of Object.entries(filters))if(value&&!String(record[facet]||'').split(' ').includes(value))return false;
 return normalize(record.text||'').includes(normalize(search).trim());
}
if(typeof module==='object'&&module.exports){module.exports={matches};return;}
const form=document.querySelector('.results-filters');if(!form)return;
const cards=Array.from(document.querySelectorAll('[data-result]')),groups=Array.from(document.querySelectorAll('[data-group]'));
const facets=Array.from(form.querySelectorAll('[data-facet]')),search=document.querySelector('#resultsSearch');
const chinese=()=>document.documentElement.lang.startsWith('zh');
function filter(){
 const selected=Object.fromEntries(facets.map(node=>[node.dataset.facet,node.value]));let count=0;
 for(const card of cards){
  // Search both languages, even after the current UI language changes.
  const bilingual=Array.from(card.querySelectorAll('[data-en]')).map(node=>node.dataset.en+' '+node.dataset.zh).join(' ');
  card.hidden=!matches({...card.dataset,text:card.textContent+' '+bilingual},selected,search.value);if(!card.hidden)count++;
 }
 for(const group of groups)group.hidden=!Array.from(group.querySelectorAll('[data-result]')).some(card=>!card.hidden);
 document.querySelector('#resultsCount').textContent=chinese()?`顯示 ${count}／${cards.length} 筆結果條目`:`Showing ${count} of ${cards.length} indexed records`;
 document.querySelector('#resultsEmpty').hidden=count!==0;
 for(const link of document.querySelectorAll('[data-report-en]'))link.href=chinese()?link.dataset.reportZh:link.dataset.reportEn;
}
for(const input of form.querySelectorAll('input,select,button'))input.disabled=false;
form.addEventListener('submit',event=>event.preventDefault());form.addEventListener('input',filter);form.addEventListener('change',filter);
// Reset explicitly: Chromium can flush microtasks before native form reset.
form.addEventListener('reset',event=>{event.preventDefault();for(const node of facets)node.value='';search.value='';filter();});document.addEventListener('depthport:language',filter);filter();
})(typeof window!=='undefined'?window:globalThis);
