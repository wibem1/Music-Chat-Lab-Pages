(()=>{
'use strict';
if(window.__mclCompositionStateV120)return;
window.__mclCompositionStateV120=true;

const CHAT_KEY='music-chat-lab.chats.v1',ACTIVE_KEY='music-chat-lab.active-chat.v1',APPLE_EPOCH=978307200;
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x)),clean=s=>String(s||'').trim();

function currentChat(){try{const chats=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]'),id=localStorage.getItem(ACTIVE_KEY);return chats.find(c=>c.id===id)||chats[0]||null}catch{return null}}
function parseScore(text){let s=String(text||'').trim();const f=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);if(f)s=f[1].trim();const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;try{const x=JSON.parse(s.slice(a,b+1));return x&&Array.isArray(x.tr)&&x.tr.some(t=>Array.isArray(t.nt))?x:null}catch{return null}}
function latestGenerated(){const c=currentChat();if(!c)return null;for(const m of[...(c.messages||[])].reverse()){if(m.role!=='assistant'||m.isError||m.thinking)continue;const score=parseScore(m.text);if(score)return{message:m,score}}return null}
function coreSignature(score){try{const x=clone(score);delete x.ti;return JSON.stringify(x)}catch{return''}}
function providerLabel(p){return p==='anthropic'?'Claude':p==='google'||p==='gemini'?'Gemini':p==='openai'?'OpenAI':'KI'}
function ensureTitle(score,message){let title=clean(score?.ti);if(title)return title;title=`Neue Komposition von ${providerLabel(message?.provider)}`;score.ti=title;return title}
function activeSlotNumber(){const b=document.querySelector('.mcl-midi-slot.active');return b?Number(b.dataset.slot)+1:0}

function syncGeneratedResult(rec){
  const api=window.MCLMidiSlots;if(!api?.all||!api?.restoreState||!rec?.score)return;
  const score=clone(rec.score),title=ensureTitle(score,rec.message),core=coreSignature(score),items=api.all().map(x=>clone(x));
  let hit=items.find(x=>coreSignature(x.score)===core);
  if(hit){hit.score=score;hit.name=title;hit.kind='KI';api.restoreState(items,hit.slot);return}
  const used=new Set(items.map(x=>Number(x.slot))),free=[1,2,3,4,5,6].find(n=>!used.has(n));
  if(free){items.push({slot:free,name:title,kind:'KI',score});api.restoreState(items,free)}
}
let lastGeneratedId=latestGenerated()?.message?.id||null,syncTimer=null;
function scheduleGeneratedSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>{const r=latestGenerated(),id=r?.message?.id||null;if(!id||id===lastGeneratedId)return;lastGeneratedId=id;setTimeout(()=>syncGeneratedResult(r),160)},60)}

function scoreMeasures(score){let end=0;for(const tr of score?.tr||[])for(const n of tr.nt||[])if(Array.isArray(n))end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0));const ts=score?.ts||{n:4,d:4},beats=(Number(ts.n)||4)*(4/(Number(ts.d)||4));return String(Math.max(1,Math.ceil(end/Math.max(.25,beats))))}
function ensemble(score){return(score?.tr||[]).map(t=>t.nm).filter(Boolean).join(', ')}
function latestAssignment(){const c=currentChat();if(!c)return'';const m=[...(c.messages||[])].reverse().find(x=>x.role==='user'&&!x.isError&&!x.thinking);return String(m?.displayText||m?.text||'').replace(/\[MCL-(?:ENGINE14-SCORE|CLAB-SCORE)[\s\S]*$/i,'').trim()}
function activeProviderModel(){const p=document.getElementById('providerSelect')?.value||'',m=document.getElementById('modelSelect')?.value||null;return{provider:p==='google'?'gemini':p||null,model:m}}
function safeName(v){return String(v||'Komposition').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim()||'Komposition'}
function download(text,name){const blob=new Blob([text],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function setNote(msg){const e=document.getElementById('composerNote');if(e&&e.textContent!==msg)e.textContent=msg}

function saveActiveClab(){
  const api=window.MCLMidiSlots;if(!api?.all)throw new Error('Der MIDI-Arbeitstisch ist nicht verfügbar.');
  const slot=activeSlotNumber();if(!slot)throw new Error('Kein Stück auf dem Arbeitstisch markiert.');
  const item=(api.all()||[]).find(x=>Number(x.slot)===slot&&x.score);if(!item)throw new Error('Der markierte Speicherplatz enthält keine Komposition.');
  const score=clone(item.score),title=clean(score.ti)||clean(item.name)||'Komposition';score.ti=title;
  const old=window.MCLCLAB?.getLoadedDocument?.()||null,same=!!old&&JSON.stringify(old.score)===JSON.stringify(score),pm=activeProviderModel();
  const doc={...(same&&old?clone(old):{}),format:'composition-lab-document',version:1,savedAt:Date.now()/1000-APPLE_EPOCH,title,score,concept:String(score.sm||(same?old?.concept:'')||''),provider:pm.provider,model:pm.provider?pm.model:null,measures:scoreMeasures(score),meter:`${score.ts?.n||4}/${score.ts?.d||4}`,tempo:String(score.bpm||96),musicalKey:String(score.k||''),ensemble:ensemble(score),assignment:latestAssignment()};
  if(old&&!same){doc.sourceName=old.title||old.sourceName||null;doc.sourceScore=clone(old.score)}
  delete doc.midiData;delete doc.musicXMLData;delete doc.costUSD;delete doc.inputTokens;delete doc.outputTokens;
  download(JSON.stringify(doc,null,2),safeName(title)+'.clab');
  try{window.MCLCLAB?.applyDocument?.(doc,title+'.clab')}catch{}
  setNote(`CLAB gespeichert: ${title}. Gespeichert wurde Speicher ${slot}, die aktuell markierte Komposition.`)
}
function installClabSaveGuard(){document.addEventListener('click',e=>{const b=e.target?.closest?.('#clabSaveBtn');if(!b)return;e.preventDefault();e.stopImmediatePropagation();try{saveActiveClab()}catch(err){setNote(err?.message||String(err))}},true)}
function refreshClabLabel(){const b=document.getElementById('clabProjectBadge'),api=window.MCLMidiSlots,slot=activeSlotNumber();if(!b||!api?.all||!slot)return;const item=(api.all()||[]).find(x=>Number(x.slot)===slot);if(!item)return;const next=`CLAB: ${clean(item.score?.ti)||clean(item.name)||'Komposition'}`;if(b.textContent!==next)b.textContent=next}
function start(){installClabSaveGuard();const messages=document.getElementById('messages');if(messages)new MutationObserver(scheduleGeneratedSync).observe(messages,{subtree:false,childList:true});const slots=document.getElementById('midiSlots');if(slots){new MutationObserver(refreshClabLabel).observe(slots,{subtree:true,attributes:true,attributeFilter:['class']});slots.addEventListener('click',()=>setTimeout(refreshClabLabel,30))}refreshClabLabel()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();