(()=>{
'use strict';
if(window.__mclVariantPlayerFixesV137)return;
window.__mclVariantPlayerFixesV137=true;

const CHAT_KEY='music-chat-lab.chats.v1';
const ACTIVE_KEY='music-chat-lab.active-chat.v1';
const el=id=>document.getElementById(id);

function scoreFromText(text){
  let raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a<0||b<=a)return null;
  try{const x=JSON.parse(raw.slice(a,b+1));return Array.isArray(x?.tr)?x:null}catch{return null}
}

function normalizeVariantTitles(){
  let chats;
  try{chats=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]')}catch{return}
  if(!Array.isArray(chats))return;
  let changed=false;
  for(const chat of chats){
    if(!Array.isArray(chat?.messages))continue;
    const used=new Set(),maxVariant=new Map();
    for(const message of chat.messages){
      if(message?.role!=='assistant'||message?.isError||message?.thinking)continue;
      const score=scoreFromText(message.text);if(!score)continue;
      let title=String(score.ti||'KI-Komposition').trim()||'KI-Komposition';
      const m=title.match(/^(.*?)(?:\s+[–-]\s+Variante\s+(\d+))$/i);
      const base=(m?.[1]||title).trim()||'KI-Komposition';
      const stated=m?Math.max(2,Number(m[2])||2):1;
      let max=Math.max(maxVariant.get(base)||0,stated);
      if(used.has(title)){
        let n=Math.max(2,max+1),candidate=`${base} – Variante ${n}`;
        while(used.has(candidate)){n++;candidate=`${base} – Variante ${n}`}
        title=candidate;score.ti=title;message.text=JSON.stringify(score);changed=true;max=n;
      }
      used.add(title);maxVariant.set(base,Math.max(maxVariant.get(base)||0,max));
    }
  }
  if(changed)try{localStorage.setItem(CHAT_KEY,JSON.stringify(chats))}catch(_){ }
}

function maxBeat(score){
  let max=0;(score?.tr||[]).forEach(t=>(t.nt||[]).forEach(n=>{const st=Number(n?.[0])||0,d=Number(n?.[1])||0,g=n?.length>5?(Number(n[5])||.95):.95;max=Math.max(max,st+d*Math.max(.05,g))}));return max;
}
function fmt(sec){sec=Math.max(0,Math.floor(sec||0));return`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`}
function activeItem(){
  const b=document.querySelector('.mcl-midi-slot.active');if(!b||!window.MCLMidiSlots)return null;
  const slot=Number(b.dataset.slot)+1;return window.MCLMidiSlots.get?.([slot])?.[0]||null;
}
function isRunning(){
  const s=String(el('mainMidiStatus')?.textContent||'');
  return /Wiedergabe (?:läuft|fortgesetzt|wird vorbereitet)/i.test(s)&&!/Pausiert/i.test(s);
}
function handleSeek(e){
  if(e.target?.id!=='mainMidiSeek')return;
  const seek=e.target,value=Number(seek.value)||0,wasRunning=isRunning();
  e.preventDefault();e.stopImmediatePropagation();
  seek.value=String(value);
  const item=activeItem();if(!item?.score)return;
  const max=maxBeat(item.score),bpm=Math.max(20,Math.min(300,Number(item.score.bpm)||96)),beat=max*value/1000,total=max*60/bpm,pos=beat*60/bpm;
  if(el('mainMidiTime'))el('mainMidiTime').textContent=`${fmt(pos)} / ${fmt(total)}`;
  if(wasRunning){
    el('mainMidiPlay')?.click();
  }else if(el('mainMidiStatus')){
    el('mainMidiStatus').textContent=`Position gewählt · ${fmt(pos)}. Mit ▶ starten.`;
  }
}

document.addEventListener('change',handleSeek,true);
normalizeVariantTitles();
new MutationObserver(normalizeVariantTitles).observe(document.documentElement,{subtree:true,childList:true});
window.MCLVariantPlayerFixesV137={version:'1.3.11',normalizeVariantTitles};
})();
