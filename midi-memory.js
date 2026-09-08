(()=>{
'use strict';
const OLD_KEY='music-chat-lab.midi-slots.v1';
const DB_NAME='music-chat-lab-midi';
const DB_VERSION=1;
const STORE='workspace';
const RECORD='current';
let restoring=false,saveTimer=null,lastFingerprint='';

/* v1.1.8: Never keep complete MIDI scores in localStorage. Large synchronous
   JSON stringify/parse operations can freeze Chrome on Android. */
try{localStorage.removeItem(OLD_KEY)}catch(_){ }

function openDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('IndexedDB nicht verfügbar'));return}
    const r=indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error||new Error('IndexedDB konnte nicht geöffnet werden'));
  });
}
function dbGet(){return openDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(RECORD);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close()}))}
function dbPut(value){return openDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,RECORD);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{const e=tx.error;db.close();reject(e)}}))}

function currentState(){
  const api=window.MCLMidiSlots;if(!api?.all)return null;
  const items=api.all().map(x=>({slot:x.slot,name:x.name,kind:x.kind,score:x.score}));
  const activeButton=document.querySelector('.mcl-midi-slot.active');
  const active=activeButton?Number(activeButton.dataset.slot)+1:0;
  return{version:3,active,items};
}
function fingerprint(state){
  if(!state)return'';
  return state.items.map(x=>`${x.slot}:${x.name}:${(x.score?.tr||[]).reduce((n,t)=>n+(t.nt?.length||0),0)}`).join('|')+`@${state.active}`;
}
async function saveNow(){
  if(restoring||window.MCLMidiMemoryRestoring)return;
  const state=currentState();if(!state)return;
  const fp=fingerprint(state);if(fp===lastFingerprint)return;
  try{await dbPut(state);lastFingerprint=fp}catch(e){console.warn('MIDI-Speicher konnte nicht gesichert werden',e)}
}
function scheduleSave(delay=350){clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,delay)}
async function restore(){
  const api=window.MCLMidiSlots;if(typeof api?.restoreState!=='function')return;
  let mem=null;try{mem=await dbGet()}catch(e){console.warn('MIDI-Speicher konnte nicht gelesen werden',e);return}
  if(!mem?.items?.length)return;
  restoring=true;window.MCLMidiMemoryRestoring=true;
  try{api.restoreState(mem.items,mem.active||0);lastFingerprint=fingerprint(currentState())}
  catch(e){console.warn('MIDI-Speicher konnte nicht wiederhergestellt werden',e)}
  finally{restoring=false;window.MCLMidiMemoryRestoring=false}
}
function start(){
  const slots=document.getElementById('midiSlots');
  if(slots)new MutationObserver(()=>scheduleSave(500)).observe(slots,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.querySelectorAll('.mcl-midi-slot').forEach(b=>b.addEventListener('click',()=>scheduleSave(500)));
  window.addEventListener('mcl-pending-files-rendered',()=>scheduleSave(700));
  window.addEventListener('pagehide',()=>scheduleSave(0));
  restore();
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
