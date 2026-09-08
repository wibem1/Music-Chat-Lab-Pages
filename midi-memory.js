(()=>{
'use strict';
const KEY='music-chat-lab.midi-slots.v1';
let restoring=false,lastSaved='';
function currentState(){
  const api=window.MCLMidiSlots;
  if(!api?.all)return null;
  const items=api.all().map(x=>({slot:x.slot,name:x.name,kind:x.kind,score:x.score}));
  const activeButton=document.querySelector('.mcl-midi-slot.active');
  const active=activeButton?Number(activeButton.dataset.slot)+1:0;
  return {version:2,active,items};
}
function save(){
  if(restoring||window.MCLMidiMemoryRestoring)return;
  try{
    const state=currentState();
    if(!state)return;
    const text=JSON.stringify(state);
    if(text===lastSaved)return;
    localStorage.setItem(KEY,text);
    lastSaved=text;
  }catch(e){console.warn('MIDI-Speicher konnte nicht gesichert werden',e)}
}
function readMemory(){
  try{
    const x=JSON.parse(localStorage.getItem(KEY)||'null');
    if(!x||!Array.isArray(x.items))return null;
    return x;
  }catch{return null}
}
function restore(){
  const mem=readMemory();
  if(!mem?.items?.length)return;
  const api=window.MCLMidiSlots;
  if(typeof api?.restoreState!=='function')return;
  restoring=true;
  window.MCLMidiMemoryRestoring=true;
  try{
    api.restoreState(mem.items,mem.active||0);
    const state=currentState();
    if(state)lastSaved=JSON.stringify(state);
  }catch(e){console.warn('MIDI-Speicher konnte nicht wiederhergestellt werden',e)}
  finally{
    restoring=false;
    window.MCLMidiMemoryRestoring=false;
    setTimeout(save,150);
  }
}
function start(){
  const slots=document.getElementById('midiSlots');
  if(slots)new MutationObserver(()=>save()).observe(slots,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.querySelectorAll('.mcl-midi-slot').forEach(b=>b.addEventListener('click',()=>setTimeout(save,80)));
  window.addEventListener('mcl-pending-files-rendered',()=>setTimeout(save,120));
  window.addEventListener('pagehide',save);
  window.addEventListener('beforeunload',save);
  restore();
  setInterval(save,1000);
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
