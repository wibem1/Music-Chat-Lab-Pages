(()=>{
'use strict';
if(window.__mclCompositionIdeaFieldV1312)return;
window.__mclCompositionIdeaFieldV1312=true;
const CHAT_KEY='music-chat-lab.active-chat.v1',STORE_KEY='music-chat-lab.composition-idea.v1';
const el=id=>document.getElementById(id);
function activeChatId(){return localStorage.getItem(CHAT_KEY)||'default'}
function readStore(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{}}catch{return{}}}
function saveDraft(text){try{const all=readStore();all[activeChatId()]=String(text||'');localStorage.setItem(STORE_KEY,JSON.stringify(all))}catch(_){}}
function compactGenerated(text,max=350){let s=String(text||'').replace(/\s+/g,' ').trim();if(!s)return'';const parts=s.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[s];s=parts.slice(0,4).join(' ').replace(/\s+/g,' ').trim();if(s.length<=max)return s;const cut=s.slice(0,max-1),i=cut.lastIndexOf(' ');return(i>max*.7?cut.slice(0,i):cut).replace(/[,:;\-\s]+$/,'')+'…'}
function input(){return el('compositionIdeaInput')}
function get(){return String(input()?.value||'').trim()}
function set(text,opts={}){const box=input();if(!box)return;const next=opts.generated===false?String(text||'').trim():compactGenerated(text);if(box.value!==next)box.value=next;saveDraft(next);box.dispatchEvent(new CustomEvent('mcl-composition-idea-changed',{bubbles:true,detail:{source:opts.source||'system'}}))}
function activeItem(){try{const b=document.querySelector('.mcl-midi-slot.active');if(!b||!window.MCLMidiSlots?.get)return null;return window.MCLMidiSlots.get([Number(b.dataset.slot)+1])?.[0]||null}catch{return null}}
function syncFromActive(){const item=activeItem();if(item?.score){set(item.score.sm||'',{generated:true,source:'score'});return true}return false}
function restoreDraft(){const box=input();if(!box)return;const all=readStore(),draft=all[activeChatId()];if(typeof draft==='string'&&draft.trim()){box.value=draft;return}const doc=window.MCLCLAB?.getLoadedDocument?.();if(doc?.concept){set(doc.concept,{generated:false,source:'clab'});return}syncFromActive()}
function parseScore(text){let s=String(text||'').trim();const f=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);if(f)s=f[1].trim();const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;try{const x=JSON.parse(s.slice(a,b+1));return x&&Array.isArray(x.tr)&&x.tr.some(t=>Array.isArray(t.nt))?x:null}catch{return null}}
function syncLatestGenerated(){try{const chats=JSON.parse(localStorage.getItem('music-chat-lab.chats.v1')||'[]'),id=activeChatId(),chat=chats.find(c=>c?.id===id)||chats[0];if(!chat)return;for(const m of [...(chat.messages||[])].reverse()){if(m?.role!=='assistant'||m?.isError||m?.thinking)continue;const score=parseScore(m.text);if(score){set(score.sm||'',{generated:true,source:'score'});return}}}catch(_){}}
function start(){const box=input();if(!box)return;box.addEventListener('input',()=>saveDraft(box.value));restoreDraft();const slots=el('midiSlots');if(slots)slots.addEventListener('click',()=>setTimeout(syncFromActive,20));const messages=el('messages');if(messages)new MutationObserver(()=>setTimeout(syncLatestGenerated,0)).observe(messages,{childList:true});document.addEventListener('click',e=>{if(e.target?.closest?.('.chat-item,#newChatButton'))setTimeout(restoreDraft,30)},true)}
window.MCLCompositionIdea={version:'1.3.12',get,set,syncFromActive,restoreDraft,compactGenerated};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
