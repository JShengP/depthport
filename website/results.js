/* SPDX-License-Identifier: AGPL-3.0-only */
(function(root){
'use strict';
const normalize=value=>String(value).normalize('NFKC').toLocaleLowerCase();
function matches(record,filters,search=''){
 for(const [facet,value] of Object.entries(filters))if(value&&!String(record[facet]||'').split(' ').includes(value))return false;
 return normalize(record.text||'').includes(normalize(search).trim());
}
function sequenceSelection(params,key,values){
 const selected=params.getAll(key);
 return selected.length===1&&values.includes(selected[0])?selected[0]:'all';
}
function sequenceURL(href,selections){
 const url=new URL(href);
 for(const {key,value} of selections){
  if(value==='all')url.searchParams.delete(key);else url.searchParams.set(key,value);
 }
 return url.href;
}
if(typeof module==='object'&&module.exports){module.exports={matches,sequenceSelection,sequenceURL};return;}
const form=document.querySelector('.results-filters');if(!form)return;
const cards=Array.from(document.querySelectorAll('[data-result]')),groups=Array.from(document.querySelectorAll('[data-group]'));
const facets=Array.from(form.querySelectorAll('[data-facet]')),search=document.querySelector('#resultsSearch');
const sequences=Array.from(document.querySelectorAll('[data-comparison-sequence]')).map(node=>({
 node,key:'seq-'+node.closest('[data-comparison]').dataset.comparison,values:Array.from(node.options,option=>option.value)
}));
const chinese=()=>document.documentElement.lang.startsWith('zh');
function saveSequences(method){
 const href=sequenceURL(location.href,sequences.map(({key,node})=>({key,value:node.value})));
 if(href!==location.href)history[method](history.state,'',href);
}
function restoreSequences(){
 const params=new URLSearchParams(location.search);
 for(const {node,key,values} of sequences)node.value=sequenceSelection(params,key,values);
 // The URL is authoritative, including when a browser restores form values.
 // Invalid, duplicated and explicit "all" values use the default without a new history entry.
 saveSequences('replaceState');filter();
}
function filter(){
 const selected=Object.fromEntries(facets.map(node=>[node.dataset.facet,node.value]));let count=0;
 for(const card of cards){
  // Search both languages, even after the current UI language changes.
  const bilingual=Array.from(card.querySelectorAll('[data-en]')).map(node=>node.dataset.en+' '+node.dataset.zh).join(' ');
  card.hidden=!matches({...card.dataset,text:card.textContent+' '+bilingual},selected,search.value);if(!card.hidden)count++;
 }
 for(const comparison of document.querySelectorAll('[data-comparison]')){
  const members=comparison.dataset.members.split(' '),visible=members.filter(id=>cards.some(card=>card.dataset.result===id&&!card.hidden));
  comparison.hidden=visible.length===0;
  const sequence=comparison.querySelector('[data-comparison-sequence]');
  for(const view of comparison.querySelectorAll('[data-comparison-view]'))view.hidden=view.dataset.comparisonView!==sequence.value;
  for(const row of comparison.querySelectorAll('[data-comparison-member]'))row.hidden=!visible.includes(row.dataset.comparisonMember);
  comparison.querySelector('.comparison-visible').textContent=chinese()?`本組顯示 ${visible.length}／${members.length} 個追蹤器；比例尺保持不變`:`Showing ${visible.length} of ${members.length} trackers in this cohort; scales unchanged`;
 }
 for(const group of groups)group.hidden=!Array.from(group.querySelectorAll('[data-result]')).some(card=>!card.hidden);
 document.querySelector('#resultsCount').textContent=chinese()?`顯示 ${count}／${cards.length} 筆結果條目`:`Showing ${count} of ${cards.length} indexed records`;
 document.querySelector('#resultsEmpty').hidden=count!==0;
 for(const link of document.querySelectorAll('[data-report-en]'))link.href=chinese()?link.dataset.reportZh:link.dataset.reportEn;
}
for(const input of form.querySelectorAll('input,select,button'))input.disabled=false;
for(const {node} of sequences){node.disabled=false;node.addEventListener('change',()=>{saveSequences('pushState');filter();});}
root.addEventListener('popstate',restoreSequences);root.addEventListener('pageshow',restoreSequences);
form.addEventListener('submit',event=>event.preventDefault());form.addEventListener('input',filter);form.addEventListener('change',filter);
// Reset explicitly: Chromium can flush microtasks before native form reset.
form.addEventListener('reset',event=>{event.preventDefault();for(const node of facets)node.value='';search.value='';filter();});document.addEventListener('depthport:language',filter);restoreSequences();
})(typeof window!=='undefined'?window:globalThis);
