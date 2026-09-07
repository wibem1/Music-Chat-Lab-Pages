(()=>{
'use strict';
const KEY='music-chat-lab.midi-slots.v1';
let restoring=false,lastSaved='';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function currentState(){
  const api=window.MCLMidiSlots;
  if(!api?.all)return null;
  const items=api.all().map(x=>({slot:x.slot,name:x.name,kind:x.kind,score:x.score}));
  const activeButton=document.querySelector('.mcl-midi-slot.active');
  const active=activeButton?Number(activeButton.dataset.slot)+1:0;
  return {version:1,active,items};
}
function save(){
  if(restoring)return;
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
function chats(){try{return JSON.parse(localStorage.getItem('music-chat-lab.chats.v1')||'[]')}catch{return[]}}
function writeChats(x){localStorage.setItem('music-chat-lab.chats.v1',JSON.stringify(x))}
function activeChatId(){return localStorage.getItem('music-chat-lab.active-chat.v1')||''}
function poke(){
  const n=document.createElement('i');
  n.hidden=true;
  n.setAttribute('data-mcl-memory-poke','1');
  document.body.appendChild(n);
  n.remove();
}
async function restoreOne(item){
  if(!item?.score||!item.slot||item.slot<1||item.slot>6)return;
  if(window.MCLMidiSlots?.has?.(item.slot))return;
  const id=activeChatId();
  if(!id)return;
  const all=chats(),chat=all.find(c=>c.id===id);
  if(!chat)return;
  const original=Array.isArray(chat.messages)?chat.messages.slice():[];
  const score=JSON.parse(JSON.stringify(item.score));
  if(!score.ti&&item.name)score.ti=item.name;
  const temp={id:`mcl-memory-${item.slot}-${Date.now()}-${Math.random()}`,role:'assistant',text:JSON.stringify(score),isMemoryRestore:true};
  chat.messages=[...original,temp];
  writeChats(all);
  window.MCLTargetMidiSlot=item.slot-1;
  poke();
  await sleep(35);
  const after=chats(),afterChat=after.find(c=>c.id===id);
  if(afterChat){afterChat.messages=original;writeChats(after)}
  await sleep(10);
}
async function restore(){
  const mem=readMemory();
  if(!mem?.items?.length)return;
  restoring=true;
  try{
    for(const item of [...mem.items].sort((a,b)=>a.slot-b.slot))await restoreOne(item);
    if(mem.active&&window.MCLMidiSlots?.has?.(mem.active)){
      document.querySelector(`.mcl-midi-slot[data-slot="${mem.active-1}"]`)?.click();
    }
    const state=currentState();
    if(state)lastSaved=JSON.stringify(state);
  }catch(e){console.warn('MIDI-Speicher konnte nicht wiederhergestellt werden',e)}
  finally{restoring=false;save()}
}
function start(){
  const slots=document.getElementById('midiSlots');
  if(slots)new MutationObserver(()=>save()).observe(slots,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.querySelectorAll('.mcl-midi-slot').forEach(b=>b.addEventListener('click',()=>setTimeout(save,80)));
  window.addEventListener('mcl-pending-files-rendered',()=>setTimeout(save,120));
  window.addEventListener('pagehide',save);
  window.addEventListener('beforeunload',save);
  setInterval(save,1000);
  setTimeout(()=>restore(),180);
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
