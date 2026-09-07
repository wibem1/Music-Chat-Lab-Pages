(()=>{
'use strict';
const TOMBSTONES='music-chat-lab.midi-slot-deleted.v1';
const sig=x=>{try{return JSON.stringify(x?.score||null)}catch{return''}};
function tombstones(){try{return new Set(JSON.parse(localStorage.getItem(TOMBSTONES)||'[]'))}catch{return new Set()}}
function saveTombstones(s){try{localStorage.setItem(TOMBSTONES,JSON.stringify([...s].slice(-100)))}catch{}}
function removeSlot(n,ask=true){
  const api=window.MCLMidiSlots;if(!api?.all||!api?.restoreState)return;
  const item=api.all().find(x=>x.slot===n);if(!item)return;
  if(ask&&!confirm(`Speicherplatz ${n} löschen?\n\n${item.name||''}`))return;
  const dead=tombstones();if(item.kind==='KI'){const s=sig(item);if(s)dead.add(s);saveTombstones(dead)}
  const keep=api.all().filter(x=>x.slot!==n).map(x=>({slot:x.slot,name:x.name,kind:x.kind,score:x.score}));
  const active=keep.length?keep[0].slot:0;
  api.restoreState(keep,active);
  window.dispatchEvent(new CustomEvent('mcl-midi-slots-changed'));
  const st=document.getElementById('mainMidiStatus');if(st)st.textContent=`Speicherplatz ${n} wurde gelöscht.`;
}
function purgeDeleted(){
  const api=window.MCLMidiSlots;if(!api?.all||!api?.restoreState)return;
  const dead=tombstones();if(!dead.size)return;
  const all=api.all(),keep=all.filter(x=>!dead.has(sig(x)));
  if(keep.length===all.length)return;
  api.restoreState(keep,keep[0]?.slot||0);
  window.dispatchEvent(new CustomEvent('mcl-midi-slots-changed'));
}
function bind(){
  document.querySelectorAll('.mcl-midi-slot').forEach((b,i)=>{
    let timer=null,long=false;
    const start=e=>{if(!window.MCLMidiSlots?.has?.(i+1))return;long=false;timer=setTimeout(()=>{long=true;removeSlot(i+1,true)},650)};
    const cancel=()=>{if(timer){clearTimeout(timer);timer=null}};
    b.addEventListener('pointerdown',start);
    b.addEventListener('pointerup',cancel);
    b.addEventListener('pointercancel',cancel);
    b.addEventListener('pointerleave',cancel);
    b.addEventListener('click',e=>{if(long){e.preventDefault();e.stopImmediatePropagation();long=false}},true);
    b.addEventListener('contextmenu',e=>{if(window.MCLMidiSlots?.has?.(i+1)){e.preventDefault();removeSlot(i+1,true)}});
  });
  setTimeout(purgeDeleted,900);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();