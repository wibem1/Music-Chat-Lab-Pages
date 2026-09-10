(()=>{
'use strict';
if(window.__mclConceptDisplayV139)return;
window.__mclConceptDisplayV139=true;
const CHAT_KEY='music-chat-lab.chats.v1',ACTIVE_KEY='music-chat-lab.active-chat.v1';
let applying=false;
function parseScore(text){
  let s=String(text||'').trim();
  const f=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);if(f)s=f[1].trim();
  const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;
  try{const x=JSON.parse(s.slice(a,b+1));return x&&Array.isArray(x.tr)&&x.tr.some(t=>Array.isArray(t.nt))?x:null}catch{return null}
}
function compact(text,max=350){
  let s=String(text||'').replace(/\s+/g,' ').trim();if(!s)return'';
  const parts=s.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[s];
  s=parts.slice(0,4).join(' ').replace(/\s+/g,' ').trim();
  if(s.length<=max)return s;
  const cut=s.slice(0,max-1),i=cut.lastIndexOf(' ');
  return (i>max*.7?cut.slice(0,i):cut).replace(/[,:;\-\s]+$/,'')+'…';
}
function currentMessages(){
  try{
    const chats=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]'),id=localStorage.getItem(ACTIVE_KEY);
    return (chats.find(c=>c?.id===id)||chats[0]||{}).messages||[];
  }catch{return[]}
}
function format(score){
  const idea=compact(score?.sm||'');
  const title=String(score?.ti||'Neue Komposition').trim()||'Neue Komposition';
  return idea?`Kompositionsidee\n${idea}\n\nKomposition erzeugt: ${title}`:`Komposition erzeugt: ${title}`;
}
function refresh(){
  if(applying)return;applying=true;
  try{
    const msgs=currentMessages(),rows=[...document.querySelectorAll('#messages .message-row')];
    rows.forEach((row,i)=>{
      const m=msgs[i];if(!m||m.role!=='assistant'||m.isError||m.thinking)return;
      const score=parseScore(m.text);if(!score)return;
      const bubble=row.querySelector('.message-bubble');if(!bubble)return;
      const next=format(score);if(bubble.textContent!==next)bubble.textContent=next;
    });
    const panel=document.getElementById('clabConceptPanel');
    if(panel&&!panel.hidden){
      const b=document.querySelector('.mcl-midi-slot.active');
      if(b&&window.MCLMidiSlots?.get){
        const slot=Number(b.dataset.slot)+1,item=window.MCLMidiSlots.get([slot])?.[0];
        const idea=compact(item?.score?.sm||'');
        if(idea&&panel.textContent!==idea)panel.textContent=idea;
      }
    }
  }finally{applying=false}
}
function start(){
  const messages=document.getElementById('messages');
  if(messages)new MutationObserver(()=>queueMicrotask(refresh)).observe(messages,{childList:true,subtree:true});
  const slots=document.getElementById('midiSlots');
  if(slots)slots.addEventListener('click',()=>setTimeout(refresh,0));
  setTimeout(refresh,0);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.MCLConceptDisplayV139={version:'1.3.9',compact,refresh};
})();
