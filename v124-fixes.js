(()=>{
'use strict';
if(window.__mclV124Fixes)return;
window.__mclV124Fixes=true;

const VERSION='1.1.24';
const CHAT_KEY='music-chat-lab.chats.v1';
const ACTIVE_KEY='music-chat-lab.active-chat.v1';
const ASSIGNMENT_STORE='music-chat-lab.score-assignments.v1';
const PENDING_KEYS=['music-chat-lab.pending-compositions.v1','music-chat-lab.pending-openai-compositions.v1'];
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));

// 1) Universal edit contract: when source material exists, the model must
// explicitly declare PATCH or REPLACE_SCORE. A bare full score is rejected.
function installEditContract(){
  const api=window.MCLCompositionEdit;
  if(!api||api.__v124)return;
  api.__v124=true;
  const priorMaterialize=api.materialize?.bind(api);
  const parse=api.parseObject?.bind(api);
  const isScore=x=>!!x&&Array.isArray(x.tr)&&x.tr.some(t=>Array.isArray(t?.nt));

  api.protocol=`BEARBEITUNGS- UND AUSGABESTRATEGIE V1.1.24:\n- Entscheide ausschließlich aus dem freien Nutzerauftrag, was musikalisch erzeugt oder verändert werden soll. Die App trifft keine musikalische Entscheidung.\n- Sobald vorhandenes musikalisches Material als Ausgangspunkt verwendet wird, MUSST du den technischen Ergebnismodus ausdrücklich angeben. Eine nackte vollständige Partitur ist dann ungültig.\n- Wenn irgendein Teil des Ausgangsmaterials unverändert erhalten bleibt, MUSST du mode=\"patch\" verwenden und NUR die Änderungen ausgeben. Unveränderte Tracks und Bereiche dürfen NICHT erneut ausgegeben werden.\n- Wenn das vorhandene Material vollständig ersetzt bzw. als Ganzes neu gestaltet werden soll, verwende mode=\"replace_score\" und liefere die neue vollständige Partitur unter \"score\".\n- Nur bei vollständig neuer Musik ohne verwendetes Ausgangsmaterial darf die vollständige Partitur direkt ohne Modus ausgegeben werden.\n- Für den Nutzer entsteht nach einem Patch trotzdem wieder eine vollständige Partitur; die App setzt unverändertes Ausgangsmaterial und Änderungen deterministisch zusammen.\n\nPATCH-FORMAT:\n{\n  \"mode\":\"patch\",\n  \"base\":1,\n  \"ti\":\"Neuer Titel\",\n  \"sm\":\"Kurze Zusammenfassung\",\n  \"meta\":{\"bpm\":74,\"ts\":{\"n\":4,\"d\":4},\"k\":\"C major\"},\n  \"ops\":[\n    {\"op\":\"add_track\",\"track\":{\"nm\":\"Neue Spur\",\"ch\":1,\"pg\":40,\"nt\":[...],\"ct\":[...]}},\n    {\"op\":\"insert_track\",\"index\":0,\"track\":{...}},\n    {\"op\":\"replace_track\",\"index\":0,\"track\":{...}},\n    {\"op\":\"delete_track\",\"index\":0},\n    {\"op\":\"replace_range\",\"index\":0,\"start\":16,\"end\":32,\"nt\":[...],\"ct\":[...]}\n  ]\n}\nREPLACE-SCORE-FORMAT:\n{\"mode\":\"replace_score\",\"score\":{\"ti\":\"Titel\",\"bpm\":96,\"ts\":{\"n\":4,\"d\":4},\"k\":\"C major\",\"sm\":\"...\",\"tr\":[...]}}\n- \"base\" ist die Nummer des verwendeten Ausgangsmaterials, beginnend bei 1.\n- Track-\"index\" beginnt bei 0; alternativ darf ein eindeutiger exakter Trackname als \"name\" verwendet werden.\n- Bei replace_range sind start und end globale Beat-Positionen; nur Ereignisse mit Startposition in [start,end) werden ersetzt.\n- Nicht genannte Tracks, Bereiche und Metadaten bleiben beim Patch unverändert.\n- Antworte ausschließlich mit genau einem validen JSON-Objekt, ohne Markdown oder Kommentar.`;

  api.materialize=function(text,sources){
    const x=parse?parse(text):null;
    if(!x)return null;
    const hasSources=Array.isArray(sources)&&sources.some(s=>s?.score);
    if(x.mode==='replace_score')return isScore(x.score)?clone(x.score):null;
    if(x.mode==='patch')return priorMaterialize?priorMaterialize(text,sources||[]):null;
    if(hasSources&&isScore(x))return null; // forces the existing automatic retry
    if(isScore(x))return x;
    return priorMaterialize?priorMaterialize(text,sources||[]):null;
  };
}

// 2) Put the current musical object into the semantic dialogue context.
// This is state, not a musical rule: the AI still decides whether it is relevant.
function hasOpenProposal(){
  for(const key of PENDING_KEYS){
    try{const x=JSON.parse(localStorage.getItem(key)||'{}');if(x&&Object.keys(x).length)return true}catch(_){ }
  }
  return false;
}
function activeWorkspace(){
  try{
    const all=window.MCLMidiWorkspaceSources?.()||[];
    if(!all.length)return null;
    const b=document.querySelector('.mcl-midi-slot.active');
    if(!b)return all.length===1?all[0]:null;
    const slot=Number(b.dataset.slot)+1;
    return all.find(x=>Number(x?.slot)===slot&&x?.score)||null;
  }catch(_){return null}
}
function textOf(m){
  if(typeof m?.content==='string')return m.content;
  if(Array.isArray(m?.content))return m.content.map(x=>x?.text||x?.input_text||x?.output_text||'').join('');
  if(Array.isArray(m?.parts))return m.parts.map(x=>x?.text||'').join('');
  return'';
}
function appendState(body,provider,active){
  const slot=Number(active?.slot)||null,name=String(active?.name||active?.score?.ti||'aktuelle Komposition');
  const tag='[MCL-AKTUELLER-GEGENSTAND-V124]';
  const state=`\n\n${tag}\nTECHNISCHER DIALOGZUSTAND: Auf dem musikalischen Arbeitstisch ist aktuell ${slot?`Speicherplatz ${slot}, `:''}${JSON.stringify(name)} ausgewählt. Das bedeutet NICHT automatisch, dass dieses Stück für den aktuellen Auftrag benötigt wird. Wenn die aktuelle Nutzeraussage jedoch semantisch auf das gegenwärtige oder zuletzt erzeugte musikalische Ergebnis verweist, ist dies die primäre Referenz. Bei unabhängigen Fragen oder neuen Aufgaben ignoriere diesen Zustand. Entscheide dies semantisch, nicht anhand einzelner Schlüsselwörter.`;
  const b=clone(body);
  if(provider==='openai'&&Array.isArray(b.input)){
    for(let i=b.input.length-1;i>=0;i--){const m=b.input[i];if(m?.role!=='user')continue;const t=textOf(m);if(!t||t.includes(tag))break;m.content=typeof m.content==='string'?t+state:[{type:'input_text',text:t+state}];break}
  }else if(provider==='anthropic'&&Array.isArray(b.messages)){
    for(let i=b.messages.length-1;i>=0;i--){const m=b.messages[i];if(m?.role!=='user')continue;const t=textOf(m);if(!t||t.includes(tag))break;m.content=typeof m.content==='string'?t+state:[{type:'text',text:t+state}];break}
  }else if(provider==='google'&&Array.isArray(b.contents)){
    for(let i=b.contents.length-1;i>=0;i--){const m=b.contents[i];if(m?.role==='model')continue;const t=textOf(m);if(!t||t.includes(tag))break;m.parts=[{text:t+state}];break}
  }
  return b;
}
function installDialogueState(){
  if(window.__mclDialogueStateV124)return;
  window.__mclDialogueStateV124=true;
  const wrappedFetch=window.fetch.bind(window);
  window.fetch=function(input,init={}){
    const url=typeof input==='string'?input:input?.url||'';
    if(typeof init.body!=='string'||hasOpenProposal())return wrappedFetch(input,init);
    let provider=null;
    if(url.includes('api.openai.com/v1/responses'))provider='openai';
    else if(url.includes('api.anthropic.com/v1/messages'))provider='anthropic';
    else if(url.includes('generativelanguage.googleapis.com/')&&url.includes(':generateContent'))provider='google';
    if(!provider)return wrappedFetch(input,init);
    const active=activeWorkspace();if(!active?.score)return wrappedFetch(input,init);
    try{return wrappedFetch(input,{...init,body:JSON.stringify(appendState(JSON.parse(init.body),provider,active))})}catch(_){return wrappedFetch(input,init)}
  };
}

// 3) Keep the composition assignment attached to the generated score and
// make the visible CLAB save button use the corrected public makeDocument().
function activeChat(){
  try{const chats=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]'),id=localStorage.getItem(ACTIVE_KEY);return chats.find(c=>c.id===id)||chats[0]||null}catch(_){return null}
}
function parseScore(text){
  let s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;
  try{const x=JSON.parse(s.slice(a,b+1));return Array.isArray(x?.tr)?x:null}catch(_){return null}
}
function isConfirmation(s){return /^(ja|j|ok|okay|mach das|mache das|bitte|los|ausführen|ausfuehren|genau|einverstanden)[.!?]*$/i.test(String(s||'').trim())}
function cleanUser(m){return String(m?.displayText||m?.text||'').replace(/\[MCL-[\s\S]*$/i,'').trim()}
function fingerprint(score){
  const s=JSON.stringify(score||{});let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return `${s.length}:${(h>>>0).toString(16)}`;
}
function readAssignments(){try{return JSON.parse(localStorage.getItem(ASSIGNMENT_STORE)||'{}')||{}}catch{return{}}}
function writeAssignments(x){try{localStorage.setItem(ASSIGNMENT_STORE,JSON.stringify(x))}catch(_){}}
function findAssignmentForScore(score){
  const key=fingerprint(score),known=readAssignments();if(known[key])return known[key];
  const chat=activeChat(),messages=chat?.messages||[];let scoreIndex=-1;
  for(let i=messages.length-1;i>=0;i--){const m=messages[i];if(m?.role!=='assistant'||m?.isError||m?.thinking)continue;const s=parseScore(m.text);if(s&&fingerprint(s)===key){scoreIndex=i;break}}
  if(scoreIndex<0)return'';
  let proposal=-1;
  for(let i=scoreIndex-1;i>=0;i--){const m=messages[i];if(m?.role==='assistant'&&/\[MCL-(?:OPENAI-)?VORSCHLAG:[a-z0-9]+\]/i.test(String(m.text||''))){proposal=i;break}}
  const start=proposal>=0?proposal-1:scoreIndex-1;
  for(let i=start;i>=0;i--){const m=messages[i];if(m?.role!=='user'||m?.isError||m?.thinking)continue;const a=cleanUser(m);if(a&&!isConfirmation(a)){known[key]=a;writeAssignments(known);return a}}
  return'';
}
function installClabSave(){
  const api=window.MCLCLAB;if(!api?.makeDocument||api.__v124)return;
  api.__v124=true;
  const prior=api.makeDocument.bind(api);
  api.makeDocument=function(){const doc=prior();const a=findAssignmentForScore(doc?.score);if(a)doc.assignment=a;return doc};

  const bind=()=>{
    const btn=document.getElementById('clabSaveBtn');if(!btn||btn.dataset.v124==='1')return;
    btn.dataset.v124='1';
    btn.onclick=()=>{
      try{
        const d=api.makeDocument(),title=String(d.title||d.score?.ti||'Komposition').replace(/[\\/:*?"<>|]+/g,'_').trim()||'Komposition';
        const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=u;a.download=title+'.clab';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);
        const note=document.getElementById('composerNote');if(note)note.textContent='CLAB gespeichert: '+title+'.';
      }catch(e){const note=document.getElementById('composerNote');if(note)note.textContent=e?.message||String(e)}
    };
  };
  bind();setTimeout(bind,100);setTimeout(bind,500);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
}

installEditContract();
installDialogueState();
installClabSave();
document.querySelectorAll('[data-app-version]').forEach(el=>el.textContent='v'+VERSION);
})();
