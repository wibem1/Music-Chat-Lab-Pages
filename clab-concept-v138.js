(()=>{
'use strict';
if(window.__mclClabConceptV138)return;
window.__mclClabConceptV138=true;
function removeLegacyUi(){
  document.getElementById('clabConceptBtn')?.remove();
  document.getElementById('clabConceptPanel')?.remove();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',removeLegacyUi,{once:true});else removeLegacyUi();
window.MCLClabConceptV138={version:'1.3.10',disabled:true};
})();
