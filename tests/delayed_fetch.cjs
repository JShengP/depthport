// SPDX-License-Identifier: AGPL-3.0-only
// Synthetic scheduling regression, loaded only in the isolated Node test child.
const original=globalThis.fetch;
globalThis.fetch=async (...args)=>{
 await new Promise(resolve=>setTimeout(resolve,250));
 return original(...args);
};
console.log('Test transport: fetch dispatch delayed 250ms');
