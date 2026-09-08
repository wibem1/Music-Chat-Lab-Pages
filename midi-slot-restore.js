(()=>{
'use strict';
function install(){
  const api=window.MCLMidiSlots;
  if(!api?.restoreState||api.__stableRestoreInstalled)return;
  const original=api.restoreState.bind(api);
  api.restoreState=function(items,active=0){
    const safe=(Array.isArray(items)?items:[]).map(x=>({
      slot:x.slot,
      name:x.name,
      kind:x.kind==='Import'?'Gespeichert':x.kind,
      score:x.score
    }));
    original(safe,active);
    window.MCLMidiMemoryRestoring=true;
    setTimeout(()=>{window.MCLMidiMemoryRestoring=false},0);
  };
  api.__stableRestoreInstalled=true;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
