(()=>{
'use strict';
if(window.__mclConceptDisplayV139)return;
window.__mclConceptDisplayV139=true;
const CHAT_KEY='music-chat-lab.chats.v1',ACTIVE_KEY='music-chat-lab.active-chat.v1';
let applying=false;
function parseScore(text){let s=String(text||'').trim();const f=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);if(f)s=f[1].trim();const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;try{const x=JSON.parse(s.slice(a,b+1));return x&&Array.isArray(x.tr)&&x.tr.some(t=>Array.isArray(t.nt))?x:null}catch{return null}}
function currentMessages(){try{const chats=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]'),id=localStorage.getItem(ACTIVE_KEY);return(chats.find(c=>c?.id===id)||chats[0]||{}).messages||[]}catch{return[]}}
function refresh(){if(applying)return;applying=true;try{const msgs=currentMessages(),rows=[...document.querySelectorAll('#messages .message-row')];rows.forEach((row,i)=>{const m=msgs[i];if(!m||m.role!=='assistant'||m.isError||m.thinking)return;const score=parseScore(m.text);if(!score)return;const bubble=row.querySelector('.message-bubble');if(!bubble)return;const title=String(score.ti||'Neue Komposition').trim()||'Neue Komposition',next=`Komposition erzeugt: ${title}`;if(bubble.textContent!==next)bubble.textContent=next})}finally{applying=false}}
function start(){const messages=document.getElementById('messages');if(messages)new MutationObserver(()=>queueMicrotask(refresh)).observe(messages,{childList:true,subtree:true});setTimeout(refresh,0)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.MCLConceptDisplayV139={version:'1.3.12',refresh};
})();
