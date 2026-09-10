(()=>{
'use strict';
if(window.__mclCompositionStateV120)return;
window.__mclCompositionStateV120=true;

const VERSION='1.2.1';
const CHAT_KEY='music-chat-lab.chats.v1';
const ACTIVE_KEY='music-chat-lab.active-chat.v1';
const META='music-chat-lab.score-meta-v120.v1';
const APPLE_EPOCH=978307200;
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const clean=s=>String(s||'').trim();

function fingerprint(x){const s=JSON.stringify(x||{});let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return`${s.length}:${(h>>>0).toString(16)}`}
function readMeta(){try{return JSON.parse(localStorage.getItem(META)||'{}')||{}}catch{return{}}}
function currentChat(){try{const chats=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]'),id=localStorage.getItem(ACTIVE_KEY);return chats.find(c=>c.id===id)||chats[0]||null}catch{return null}}
function parseScore(text){let s=String(text||'').trim();const f=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);if(f)s=f[1].trim();const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;try{const x=JSON.parse(s.slice(a,b+1));return x&&Array.isArray(x.tr)&&x.tr.some(t=>Array.isArray(t?.nt))?x:null}catch{return null}}
function latestGenerated(){const c=currentChat();if(!c)return null;for(const m of [...(c.messages||[])].reverse()){if(m.role!=='assistant'||m.isError||m.thinking)continue;const score=parseScore(m.text);if(score)return{message:m,score}}return null}
function coreSignature(score){try{const x=clone(score);delete x.ti;return fingerprint(x)}catch{return''}}
function providerLabel(p){return p==='anthropic'?'Claude':p==='google'?'Gemini':p==='openai'?'OpenAI':'KI'}
function ensureTitle(score,message){let t=clean(score?.ti);if(t)return t;t=`Neue Komposition von ${providerLabel(message?.provider)}`;score.ti=t;return t}
function syncGenerated(rec){const api=window.MCLMidiSlots;if(!api?.all||!api?.restoreState||!rec?.score)return;const score=clone(rec.score),title=ensureTitle(score,rec.message),core=coreSignature(score),items=api.all().map(clone);let hit=items.find(x=>coreSignature(x.score)===core);if(hit){hit.score=score;hit.name=title;hit.kind='KI';api.restoreState(items,hit.slot);return}const used=new Set(items.map(x=>Number(x.slot))),free=[1,2,3,4,5,6].find(n=>!used.has(n));if(free){items.push({slot:free,name:title,kind:'KI',score});api.restoreState(items,free)}}
let lastId=latestGenerated()?.message?.id||null,timer=null;
function scheduleSync(){clearTimeout(timer);timer=setTimeout(()=>{const r=latestGenerated(),id=r?.message?.id||null;if(!id||id===lastId)return;lastId=id;setTimeout(()=>syncGenerated(r),120)},40)}
function activeSlot(){const b=document.querySelector('.mcl-midi-slot.active');return b?Number(b.dataset.slot)+1:0}
function scoreMeasures(score){let end=0;for(const tr of score?.tr||[])for(const n of tr?.nt||[])if(Array.isArray(n))end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0));const ts=score?.ts||{},n=Number(ts.n),d=Number(ts.d);if(!(n>0&&d>0))return'';const beats=n*(4/d);return String(Math.max(1,Math.ceil((end-1e-7)/beats)))}
function trackNames(score){return(score?.tr||[]).map(t=>t?.nm).filter(Boolean).join(', ')}
function safeName(v){return String(v||'Komposition').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim()||'Komposition'}
function download(text,name){const blob=new Blob([text],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function setNote(s){const e=document.getElementById('composerNote');if(e)e.textContent=s}
function saveActiveClab(){const api=window.MCLMidiSlots;if(!api?.all)throw new Error('Der MIDI-Arbeitstisch ist nicht verfügbar.');const slot=activeSlot();if(!slot)throw new Error('Kein Stück auf dem Arbeitstisch markiert.');const item=(api.all()||[]).find(x=>Number(x.slot)===slot&&x.score);if(!item)throw new Error('Der markierte Speicherplatz enthält keine Komposition.');const score=clone(item.score),title=clean(score.ti)||clean(item.name)||'Komposition';score.ti=title;const meta=readMeta()[fingerprint(score)]||null,old=window.MCLCLAB?.getLoadedDocument?.()||null,sameOld=!!old&&fingerprint(old.score)===fingerprint(score);const doc={...(sameOld?clone(old):{}),format:'composition-lab-document',version:1,savedAt:Date.now()/1000-APPLE_EPOCH,title,score,concept:meta?.concept??(sameOld?old?.concept:'')??'',provider:meta?.provider??(sameOld?old?.provider:null)??null,model:meta?.model??(sameOld?old?.model:null)??null,measures:scoreMeasures(score),meter:score?.ts?.n&&score?.ts?.d?`${score.ts.n}/${score.ts.d}`:'',tempo:String(score?.bpm??''),musicalKey:String(score?.k??''),ensemble:trackNames(score),assignment:meta?.task??(sameOld?old?.assignment:'')??''};if(meta?.sourceInfo?.length){doc.sourceName=meta.sourceInfo.map(x=>x.name).filter(Boolean).join(' + ');doc.sourceSlot=meta.sourceInfo.map(x=>x.slot).filter(Boolean).join(', ')||null}delete doc.midiData;delete doc.musicXMLData;delete doc.costUSD;delete doc.inputTokens;delete doc.outputTokens;download(JSON.stringify(doc,null,2),safeName(title)+'.clab');try{window.MCLCLAB?.applyDocument?.(doc,title+'.clab')}catch(_){ }setNote(`CLAB gespeichert: ${title}.`)}
function bindSave(){const btn=document.getElementById('clabSaveBtn');if(!btn||btn.dataset.v120==='1')return;btn.dataset.v120='1';btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();try{saveActiveClab()}catch(err){setNote(err?.message||String(err))}},true)}
function refreshBadge(){const b=document.getElementById('clabProjectBadge'),api=window.MCLMidiSlots,slot=activeSlot();if(!b||!api?.all||!slot)return;const item=(api.all()||[]).find(x=>Number(x.slot)===slot);if(!item)return;b.textContent=`CLAB: ${clean(item.score?.ti)||clean(item.name)||'Komposition'}`}
function start(){const messages=document.getElementById('messages');if(messages)new MutationObserver(scheduleSync).observe(messages,{childList:true});const slots=document.getElementById('midiSlots');if(slots){new MutationObserver(refreshBadge).observe(slots,{subtree:true,attributes:true,attributeFilter:['class']});slots.addEventListener('click',()=>setTimeout(refreshBadge,30))}bindSave();setTimeout(bindSave,150);setTimeout(bindSave,600);refreshBadge();document.querySelectorAll('[data-app-version]').forEach(el=>el.textContent='v'+VERSION)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();