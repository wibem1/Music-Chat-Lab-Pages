(()=>{
'use strict';
if(window.__mclVariantPlayerFixesV137)return;
window.__mclVariantPlayerFixesV137=true;

const CHAT_KEY='music-chat-lab.chats.v1';

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

normalizeVariantTitles();
new MutationObserver(normalizeVariantTitles).observe(document.documentElement,{subtree:true,childList:true});
window.MCLVariantPlayerFixesV137={version:'1.3.13',normalizeVariantTitles};
})();
