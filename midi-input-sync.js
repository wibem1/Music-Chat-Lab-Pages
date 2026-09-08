(()=>{
'use strict';
const input=document.getElementById('fileInput');
if(!input)return;
const isMidi=f=>!!f&&(/\.midi?$/i.test(f.name)||/midi/i.test(f.type||''));
const key=f=>`${f.name}|${f.size}|${f.lastModified}`;
input.addEventListener('change',e=>{
  const selected=Array.from(e.target.files||[]).filter(isMidi);
  if(!selected.length)return;
  const slotTarget=Number(window.MCLTargetMidiSlot);
  const isSlotLoad=Number.isInteger(slotTarget)&&slotTarget>=0&&slotTarget<6;
  if(isSlotLoad){
    e.stopImmediatePropagation();
    queueMicrotask(()=>{
      window.dispatchEvent(new CustomEvent('mcl-pending-files-rendered',{
        detail:{files:selected,source:'midi-slot-picker',slot:slotTarget+1}
      }));
      input.value='';
    });
    return;
  }
  const combined=[],seen=new Set();
  for(const f of [...(window.pendingFiles||[]),...selected]){
    if(!isMidi(f))continue;
    const k=key(f);if(seen.has(k))continue;seen.add(k);combined.push(f);
  }
  queueMicrotask(()=>window.dispatchEvent(new CustomEvent('mcl-pending-files-rendered',{detail:{files:combined,source:'direct-file-input'}})));
},true);
})();
