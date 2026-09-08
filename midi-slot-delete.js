(()=>{
'use strict';
const TOMBSTONES='music-chat-lab.midi-slot-deleted.v1';
const sig=x=>{try{return JSON.stringify(x?.score||null)}catch{return''}};
function tombstones(){try{return new Set(JSON.parse(localStorage.getItem(TOMBSTONES)||'[]'))}catch{return new Set()}}
function saveTombstones(s){try{localStorage.setItem(TOMBSTONES,JSON.stringify([...s].slice(-100)))}catch{}}
function ensureDialog(){
  let d=document.getElementById('mclSlotDeleteDialog');
  if(d)return d;
  d=document.createElement('dialog');d.id='mclSlotDeleteDialog';
  Object.assign(d.style,{border:'0',borderRadius:'18px',padding:'0',width:'min(88vw,420px)',maxWidth:'420px',boxShadow:'0 18px 55px rgba(0,0,0,.28)',background:'#fff',color:'#20242a'});
  d.innerHTML=`<div style="padding:22px 22px 18px"><div id="mclSlotDeleteTitle" style="font-size:21px;font-weight:750;margin-bottom:10px">Speicherplatz löschen</div><div id="mclSlotDeleteText" style="font-size:16px;line-height:1.45;color:#4e5661;word-break:break-word"></div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px"><button type="button" id="mclSlotDeleteCancel" style="border:0;border-radius:10px;padding:10px 16px;background:#edf0f3;color:#30363d;font:inherit;font-weight:650">Abbrechen</button><button type="button" id="mclSlotDeleteOk" style="border:0;border-radius:10px;padding:10px 16px;background:#c63d3d;color:white;font:inherit;font-weight:700">Löschen</button></div></div>`;
  document.body.appendChild(d);
  d.addEventListener('cancel',e=>{e.preventDefault();d.close('cancel')});
  return d;
}
function ask(title,message,okLabel='Löschen'){return new Promise(resolve=>{
  const d=ensureDialog(),head=d.querySelector('#mclSlotDeleteTitle'),text=d.querySelector('#mclSlotDeleteText'),cancel=d.querySelector('#mclSlotDeleteCancel'),ok=d.querySelector('#mclSlotDeleteOk');
  head.textContent=title;text.textContent=message;text.style.whiteSpace='pre-wrap';ok.textContent=okLabel;
  const done=v=>{cancel.onclick=null;ok.onclick=null;if(d.open)d.close(v?'ok':'cancel');resolve(v)};
  cancel.onclick=()=>done(false);ok.onclick=()=>done(true);
  d.showModal();
})}
function askDelete(n,item){return ask('Speicherplatz löschen',`Speicherplatz ${n} wirklich löschen?${item?.name?`\n\n${item.name}`:''}`)}
async function removeSlot(n,askUser=true){
  const api=window.MCLMidiSlots;if(!api?.all||!api?.restoreState)return;
  const before=api.all(),item=before.find(x=>x.slot===n);if(!item)return;
  if(askUser&&!(await askDelete(n,item)))return;
  const activeButton=document.querySelector('.mcl-midi-slot.active');
  const oldActive=activeButton?Number(activeButton.dataset.slot)+1:0;
  const dead=tombstones();if(item.kind==='KI'){const s=sig(item);if(s)dead.add(s);saveTombstones(dead)}
  const keep=before.filter(x=>x.slot!==n).map(x=>({slot:x.slot,name:x.name,kind:x.kind,score:x.score}));
  let active=oldActive!==n&&keep.some(x=>x.slot===oldActive)?oldActive:0;
  if(!active&&keep.length){const after=keep.find(x=>x.slot>n),beforeItem=[...keep].reverse().find(x=>x.slot<n);active=(after||beforeItem||keep[0]).slot}
  api.restoreState(keep,active);
  window.dispatchEvent(new CustomEvent('mcl-midi-slots-changed'));
  const st=document.getElementById('mainMidiStatus');if(st)st.textContent=`Speicherplatz ${n} wurde gelöscht.`;
}
async function clearAll(){
  const api=window.MCLMidiSlots;if(!api?.all||!api?.restoreState)return;
  const all=api.all();if(!all.length)return;
  if(!(await ask('Arbeitstisch leeren',`Alle ${all.length} belegten Speicherplätze wirklich freimachen?\n\nDie MIDI-Dateien werden nur aus dem Arbeitstisch entfernt. Der Chatverlauf bleibt erhalten.`,'Alle löschen')))return;
  const dead=tombstones();for(const item of all){if(item.kind==='KI'){const s=sig(item);if(s)dead.add(s)}}saveTombstones(dead);
  api.restoreState([],0);
  window.dispatchEvent(new CustomEvent('mcl-midi-slots-changed'));
  const st=document.getElementById('mainMidiStatus');if(st)st.textContent='Alle MIDI-Speicherplätze wurden geleert.';
  const note=document.getElementById('composerNote');if(note)note.textContent='Arbeitstisch geleert. Der Chatverlauf wurde nicht verändert.';
}
function installClearButton(){
  if(document.getElementById('mclClearAllSlots'))return;
  const slots=document.getElementById('midiSlots');if(!slots)return;
  const row=document.createElement('div');row.style.cssText='max-width:820px;margin:0 auto 6px;display:flex;justify-content:flex-end';
  const b=document.createElement('button');b.type='button';b.id='mclClearAllSlots';b.textContent='Alle Speicher löschen';b.title='Alle MIDI-Speicherplätze leeren';
  b.style.cssText='border:1px solid #d4d9de;background:#fff;color:#6a7178;border-radius:8px;padding:6px 10px;font:inherit;font-size:12px;cursor:pointer';
  b.addEventListener('click',clearAll);row.appendChild(b);slots.insertAdjacentElement('afterend',row);
}
function purgeDeleted(){
  const api=window.MCLMidiSlots;if(!api?.all||!api?.restoreState)return;
  const dead=tombstones();if(!dead.size)return;
  const all=api.all(),keep=all.filter(x=>!dead.has(sig(x)));
  if(keep.length===all.length)return;
  const activeButton=document.querySelector('.mcl-midi-slot.active');
  const oldActive=activeButton?Number(activeButton.dataset.slot)+1:0;
  const active=keep.some(x=>x.slot===oldActive)?oldActive:(keep[0]?.slot||0);
  api.restoreState(keep,active);
  window.dispatchEvent(new CustomEvent('mcl-midi-slots-changed'));
}
function bind(){
  document.querySelectorAll('.mcl-midi-slot').forEach((b,i)=>{
    let timer=null,long=false;
    const start=()=>{if(!window.MCLMidiSlots?.has?.(i+1))return;long=false;timer=setTimeout(()=>{timer=null;long=true;removeSlot(i+1,true)},650)};
    const cancel=()=>{if(timer){clearTimeout(timer);timer=null}};
    b.addEventListener('pointerdown',start);
    b.addEventListener('pointerup',cancel);
    b.addEventListener('pointercancel',cancel);
    b.addEventListener('pointerleave',cancel);
    b.addEventListener('click',e=>{if(long){e.preventDefault();e.stopImmediatePropagation();long=false}},true);
    b.addEventListener('contextmenu',e=>{if(window.MCLMidiSlots?.has?.(i+1)){e.preventDefault();removeSlot(i+1,true)}});
  });
  installClearButton();
  setTimeout(purgeDeleted,900);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
