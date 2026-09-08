(()=>{
'use strict';
if(window.__mclClabV1)return;
window.__mclClabV1=true;
const FORMAT='composition-lab-document',VERSION=1,APPLE_EPOCH=978307200;
const CHAT_KEY='music-chat-lab.chats.v1',ACTIVE_KEY='music-chat-lab.active-chat.v1';
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
let loadedDocument=null,loadedAt=0;
function appleDateNow(){return Date.now()/1000-APPLE_EPOCH;}
function safeName(v){return String(v||'Music Chat Lab').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim()||'Music Chat Lab';}
function parseScore(text){
  let s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<a)return null;
  try{const x=JSON.parse(s.slice(a,b+1));return Array.isArray(x?.tr)?x:null;}catch(_){return null;}
}
function chatState(){
  let chats=[];try{chats=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]')}catch(_){}
  const id=localStorage.getItem(ACTIVE_KEY);const chat=chats.find(c=>c.id===id)||chats[0]||null;return{chats,chat};
}
function latestScoreRecord(){
  const {chat}=chatState();if(!chat)return null;
  for(const m of [...(chat.messages||[])].reverse()){
    if(m.role!=='assistant'||m.isError||m.thinking)continue;
    const score=parseScore(m.text);if(score)return{score,createdAt:Number(m.createdAt)||0,message:m,chat};
  }
  return null;
}
function latestAssignment(){
  const {chat}=chatState();if(!chat)return'';
  const m=[...(chat.messages||[])].reverse().find(x=>x.role==='user'&&!x.isError&&!x.thinking);
  return String(m?.displayText||m?.text||'').replace(/\[MCL-(?:ENGINE14-SCORE|CLAB-SCORE)[\s\S]*$/i,'').trim();
}
function nativeProvider(v){const x=String(v||'');if(x==='google')return'gemini';return['gemini','anthropic','openai'].includes(x)?x:null;}
function mclProvider(v){return String(v||'')==='gemini'?'google':String(v||'');}
function activeProviderModel(){
  const {chat}=chatState();const p=document.getElementById('providerSelect'),m=document.getElementById('modelSelect');
  return{provider:nativeProvider(chat?.provider||p?.value),model:chat?.model||m?.value||null};
}
function scoreMeasures(score){
  let end=0;for(const tr of score?.tr||[])for(const n of tr.nt||[])if(Array.isArray(n))end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0));
  const ts=score?.ts||{n:4,d:4},beats=(Number(ts.n)||4)*(4/(Number(ts.d)||4));return String(Math.max(1,Math.ceil(end/Math.max(.25,beats))));
}
function ensemble(score){return (score?.tr||[]).map(t=>t.nm).filter(Boolean).join(', ');}
function currentScoreRecord(){const r=latestScoreRecord();if(r&&(!loadedDocument||r.createdAt>loadedAt))return r;if(loadedDocument?.score)return{score:clone(loadedDocument.score),createdAt:loadedAt};return r;}
function makeDocument(){
  const rec=currentScoreRecord();if(!rec?.score)throw new Error('Noch keine Komposition vorhanden.');
  const score=clone(rec.score),previous=loadedDocument?clone(loadedDocument):{};
  const sameScore=!!loadedDocument&&JSON.stringify(loadedDocument.score)===JSON.stringify(score);
  const pm=activeProviderModel(),changedFromLoaded=!!loadedDocument&&!sameScore;
  const doc={...previous,format:FORMAT,version:VERSION,savedAt:appleDateNow(),title:String(score.ti||previous.title||'Komposition'),score,
    concept:String(score.sm||previous.concept||''),provider:pm.provider,model:pm.provider?pm.model:null,
    measures:scoreMeasures(score),meter:`${score.ts?.n||4}/${score.ts?.d||4}`,tempo:String(score.bpm||96),musicalKey:String(score.k||''),
    ensemble:ensemble(score),assignment:latestAssignment()||String(previous.assignment||'')};
  if(changedFromLoaded){doc.sourceName=previous.title||previous.sourceName||null;doc.sourceScore=clone(previous.score);delete doc.costUSD;delete doc.inputTokens;delete doc.outputTokens;}
  delete doc.midiData;delete doc.musicXMLData;
  for(const k of Object.keys(doc))if(doc[k]===undefined)delete doc[k];
  loadedDocument=clone(doc);loadedAt=Date.now();renderBadge();return doc;
}
function download(text,name){const blob=new Blob([text],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}
function setNote(msg){const e=document.getElementById('composerNote');if(e)e.textContent=msg;}
function applyProvider(doc){
  const p=document.getElementById('providerSelect'),m=document.getElementById('modelSelect'),wanted=mclProvider(doc.provider);
  if(p&&wanted&&[...p.options].some(o=>o.value===wanted)){p.value=wanted;p.dispatchEvent(new Event('change'));}
  if(m&&doc.model&&[...m.options].some(o=>o.value===doc.model)){m.value=doc.model;m.dispatchEvent(new Event('change'));}
}
function putIntoMidiWorkspace(doc){
  const api=window.MCLMidiSlots;if(!api?.all||!api?.restoreState)return;
  try{
    const items=api.all().map(x=>clone(x)),sig=JSON.stringify(doc.score);
    const existing=items.find(x=>JSON.stringify(x.score)===sig);
    if(existing){api.restoreState(items,existing.slot);return;}
    const used=new Set(items.map(x=>Number(x.slot)));let slot=0;for(let i=1;i<=6;i++)if(!used.has(i)){slot=i;break;}
    if(!slot){setNote('CLAB geöffnet. Alle sechs MIDI-Speicherplätze sind belegt; der Score bleibt trotzdem als CLAB-Kontext aktiv.');return;}
    items.push({slot,name:doc.title||doc.score?.ti||'CLAB-Projekt',score:clone(doc.score),kind:'CLAB'});api.restoreState(items,slot);
  }catch(_){}
}
function applyDocument(doc,fileName=''){
  if(!doc||doc.format!==FORMAT)throw new Error('Keine gültige Composition-Lab-Datei.');
  if(Number(doc.version||0)!==VERSION)throw new Error(`CLAB-Version ${doc.version} wird noch nicht unterstützt.`);
  if(!doc.score||!Array.isArray(doc.score.tr))throw new Error('CLAB-Datei enthält keinen gültigen Score.');
  loadedDocument=clone(doc);loadedAt=Date.now();applyProvider(doc);putIntoMidiWorkspace(doc);renderBadge();setNote(`CLAB geöffnet: ${fileName||doc.title||doc.score.ti||'Komposition'}. Der Score steht im Player und dem Chat als musikalischer Kontext zur Verfügung.`);
}
async function openFile(file){try{applyDocument(JSON.parse(await file.text()),file.name);}catch(e){setNote(`CLAB konnte nicht geöffnet werden: ${e?.message||e}`);}}
function projectContext(){
  if(!loadedDocument)return'';
  const rec=currentScoreRecord();if(!rec?.score)return'';
  const score=rec.score,name=score.ti||loadedDocument.title||'CLAB-Projekt';
  return `\n\n[MCL-ENGINE14-SCORE name=${JSON.stringify(name)}]\n${JSON.stringify(score)}\n[/MCL-ENGINE14-SCORE]`;
}
function installContext(){
  const prior=window.MCLMidiWorkspaceContext;
  window.MCLMidiWorkspaceContext=function(){let base='';try{base=typeof prior==='function'?prior():'';}catch(_){}return String(base||'')+projectContext();};
}
function renderBadge(){const b=document.getElementById('clabProjectBadge');if(!b)return;const rec=currentScoreRecord();b.textContent=loadedDocument?`CLAB: ${rec?.score?.ti||loadedDocument.title||'Projekt'}`:'CLAB: kein Projekt geöffnet';}
function installUi(){
  if(document.getElementById('clabOpenBtn'))return;
  const composer=document.querySelector('.composer'),box=document.querySelector('.composer-box');if(!composer||!box)return;
  const bar=document.createElement('div');bar.className='clab-toolbar';bar.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0';
  bar.innerHTML='<button type="button" class="secondary-button" id="clabOpenBtn">CLAB öffnen</button><button type="button" class="secondary-button" id="clabSaveBtn">CLAB speichern</button><span id="clabProjectBadge" style="font-size:12px;opacity:.75"></span><input id="clabFileInput" type="file" accept=".clab,application/json" hidden>';
  composer.insertBefore(bar,box);renderBadge();
  const input=document.getElementById('clabFileInput');document.getElementById('clabOpenBtn').onclick=()=>{input.value='';input.click();};
  input.onchange=()=>{const f=input.files?.[0];if(f)openFile(f);};
  document.getElementById('clabSaveBtn').onclick=()=>{try{const d=makeDocument();download(JSON.stringify(d,null,2),safeName(d.title)+'.clab');setNote('CLAB-Datei gespeichert. API-Schlüssel und Chat-Verlauf sind nicht enthalten.');}catch(e){setNote(e?.message||String(e));}};
}
window.MCLCLAB={FORMAT,VERSION,applyDocument,makeDocument,getLoadedDocument:()=>clone(loadedDocument),getCurrentScore:()=>clone(currentScoreRecord()?.score||null)};
installContext();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installUi,{once:true});else installUi();
})();
