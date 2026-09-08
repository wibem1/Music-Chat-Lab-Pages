(()=>{
'use strict';
function sync(){try{window.MCLMidiSlots?.all?.();const files=window.pendingFiles||[];window.dispatchEvent(new CustomEvent('mcl-midi-input-sync',{detail:{files}}))}catch(_){}}
window.addEventListener('mcl-pending-files-rendered',sync);
})();
