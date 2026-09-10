(()=>{
'use strict';
if(window.__mclCompositionArchitectureV1136)return;
window.__mclCompositionArchitectureV1136=true;

const VERSION='1.1.36';
const STORE='music-chat-lab.pending-compositions.v2';
const LEGACY_STORES=['music-chat-lab.pending-compositions.v1','music-chat-lab.pending-openai-compositions.v1'];
const DIAG='music-chat-lab.last-diagnostic.v1';
const baseFetch=window.fetch.bind(window);
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));

const SOURCE_RE=/\[MCL-ENGINE14-SCORE name=("(?:[^"\\]|\\.)*")\]\n([\s\S]*?)\n\[\/MCL-ENGINE14-SCORE\]/g;
const WORKSPACE_RE=/\n*--- MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---[\s\S]*?--- ENDE MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---\n*/g;
const SELECTED_RE=/\n*--- AUSGEWÄHLTES MUSIKMATERIAL ---[\s\S]*?--- ENDE AUSGEWÄHLTES MUSIKMATERIAL ---\n*/g;
const AUTO_RE=/\n*--- AUTOMATISCH BEREITGESTELLTES MUSIKMATERIAL ---[\s\S]*?--- ENDE AUTOMATISCH BEREITGESTELLTES MUSIKMATERIAL ---\n*/g;
const INTERNAL_RE=/\n*\[MCL-(?:FORTSETZUNG-V123|AKTUELLER-GEGENSTAND-V124|DIALOGKONTEXT-V126)\][\s\S]*$/i;

const MUSICAL_SYSTEM=`Du bist ein Kompositionsassistent für MIDI. Folge dem freien musikalischen Auftrag des Nutzers. Triff musikalische Entscheidungen selbständig. Die App gibt keine stilistischen oder kompositorischen Sonderregeln vor.`;
const ROUTER_SYSTEM=`Du ordnest Musik-Chat-Anfragen semantisch ein. Entscheide nach Bedeutung und Gesprächszusammenhang, nicht nach einzelnen Schlüsselwörtern.`;

function providerFor(url){
  const u=String(url||'');
  if(u.includes('api.openai.com/v1/responses'))return'openai';
  if(u.includes('api.anthropic.com/v1/messages'))return'anthropic';
  if(u.includes('generativelanguage.googleapis.com/')&&u.includes(':generateContent'))return'google';
  return null;
}
function modelFrom(provider,url,body){
  if(provider==='openai'||provider==='anthropic')return String(body?.model||'');
  const m=String(url).match(/\/models\/([^/:]+):generateContent/);
  return m?decodeURIComponent(m[1]):'';
}
function textOf(m){
  if(typeof m?.content==='string')return m.content;
  if(Array.isArray(m?.content))return m.content.map(x=>x?.text||x?.input_text||x?.output_text||'').join('');
  if(Array.isArray(m?.parts))return m.parts.map(x=>x?.text||'').join('');
  return'';
}
function messagesFor(provider,body){
  if(provider==='openai')return(Array.isArray(body?.input)?body.input:[]).map(m=>({role:m?.role==='assistant'?'assistant':'user',content:textOf(m)}));
  if(provider==='anthropic')return(Array.isArray(body?.messages)?body.messages:[]).map(m=>({role:m?.role==='assistant'?'assistant':'user',content:textOf(m)}));
  return(Array.isArray(body?.contents)?body.contents:[]).map(m=>({role:m?.role==='model'?'assistant':'user',content:textOf(m)}));
}
function responseText(provider,d){
  if(provider==='anthropic')return(d?.content||[]).filter(x=>x?.type==='text').map(x=>x.text||'').join('').trim();
  if(provider==='openai'){
    if(typeof d?.output_text==='string'&&d.output_text.trim())return d.output_text.trim();
    return(d?.output||[]).flatMap(x=>x?.content||[]).map(x=>x?.text||'').join('\n').trim();
  }
  return(d?.candidates?.[0]?.content?.parts||[]).map(p=>p?.text||'').join('').trim();
}
function synthetic(provider,text,model){
  if(provider==='anthropic')return new Response(JSON.stringify({id:'mcl-architecture',type:'message',role:'assistant',model,content:[{type:'text',text}],stop_reason:'end_turn'}),{status:200,headers:{'content-type':'application/json'}});
  if(provider==='openai')return new Response(JSON.stringify({id:'mcl-architecture',object:'response',model,output_text:text,output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]}),{status:200,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text}]},finishReason:'STOP'}]}),{status:200,headers:{'content-type':'application/json'}});
}
function errorResponse(provider,message){
  return new Response(JSON.stringify({error:{message:String(message||'Unbekannter Fehler')}}),{status:provider==='google'?502:500,headers:{'content-type':'application/json'}});
}
async function direct(provider,url,headers,model,system,prompt,maxTokens=1200){
  let body;
  if(provider==='anthropic')body={model,max_tokens:maxTokens,system,messages:[{role:'user',content:prompt}]};
  else if(provider==='openai')body={model,input:[{role:'system',content:system},{role:'user',content:prompt}],store:false,max_output_tokens:maxTokens};
  else body={systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:maxTokens}};
  const r=await baseFetch(url,{method:'POST',headers:new Headers(headers||{}),body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d?.error?.message||`API-Fehler ${r.status}`);
  const t=responseText(provider,d);
  if(!t)throw new Error('Die KI hat keine Textantwort geliefert.');
  return t;
}

function parseObject(text){
  let s=String(text||'').trim();
  const f=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);if(f)s=f[1].trim();
  const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;
  try{return JSON.parse(s.slice(a,b+1))}catch{return null}
}
function isScore(x){return !!x&&Array.isArray(x.tr)&&x.tr.some(t=>Array.isArray(t?.nt))}
function trackIndex(score,op){
  if(Number.isInteger(op?.index))return op.index;
  if(typeof op?.name==='string'){
    const hits=(score.tr||[]).map((t,i)=>t?.nm===op.name?i:-1).filter(i=>i>=0);
    if(hits.length===1)return hits[0];
  }
  return -1;
}
function validTrack(t){return !!t&&typeof t==='object'&&Array.isArray(t.nt)}
function sortEvents(a){return(a||[]).slice().sort((x,y)=>(Number(x?.[0])||0)-(Number(y?.[0])||0))}
function applyPatch(patch,sources){
  if(!patch||String(patch.mode||'').toLowerCase()!=='patch'||!Array.isArray(patch.ops))return null;
  const base=Math.max(1,Math.trunc(Number(patch.base)||1))-1;
  const src=sources?.[base]?.score;if(!isScore(src))return null;
  const score=clone(src);
  if(typeof patch.ti==='string'&&patch.ti.trim())score.ti=patch.ti.trim();
  if(typeof patch.sm==='string')score.sm=patch.sm;
  if(patch.meta&&typeof patch.meta==='object')for(const k of['bpm','ts','k'])if(Object.prototype.hasOwnProperty.call(patch.meta,k))score[k]=clone(patch.meta[k]);
  for(const op of patch.ops){
    if(!op||typeof op.op!=='string')return null;
    if(op.op==='add_track'){
      if(!validTrack(op.track))return null;score.tr.push(clone(op.track));continue;
    }
    if(op.op==='insert_track'){
      if(!validTrack(op.track))return null;const at=Math.max(0,Math.min(score.tr.length,Math.trunc(Number(op.index)||0)));score.tr.splice(at,0,clone(op.track));continue;
    }
    const ix=trackIndex(score,op);if(ix<0||ix>=score.tr.length)return null;
    if(op.op==='replace_track'){
      if(!validTrack(op.track))return null;score.tr[ix]=clone(op.track);continue;
    }
    if(op.op==='delete_track'){score.tr.splice(ix,1);continue;}
    if(op.op==='replace_range'){
      const start=Number(op.start),end=Number(op.end);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Array.isArray(op.nt))return null;
      const tr=clone(score.tr[ix]);
      tr.nt=sortEvents((tr.nt||[]).filter(n=>{const t=Number(n?.[0]);return!(Number.isFinite(t)&&t>=start&&t<end)}).concat(clone(op.nt)));
      if(Array.isArray(op.ct))tr.ct=sortEvents((tr.ct||[]).filter(c=>{const t=Number(c?.[0]);return!(Number.isFinite(t)&&t>=start&&t<end)}).concat(clone(op.ct)));
      score.tr[ix]=tr;continue;
    }
    return null;
  }
  if(!String(score.ti||'').trim())score.ti='Neue Komposition';
  return score;
}
function materialize(text,sources){
  const x=parseObject(text);if(!x)return null;
  if(String(x.mode||'').toLowerCase()==='patch')return applyPatch(x,sources||[]);
  if(String(x.mode||'').toLowerCase()==='replace_score'&&isScore(x.score))return x.score;
  return isScore(x)?x:null;
}
window.MCLCompositionEdit={parseObject,materialize,applyPatch};

function extract(text){
  const raw=String(text||''),sources=[];let m;SOURCE_RE.lastIndex=0;
  while((m=SOURCE_RE.exec(raw))){try{const score=JSON.parse(m[2]);if(isScore(score))sources.push({name:JSON.parse(m[1]),score})}catch(_){}}
  SOURCE_RE.lastIndex=0;
  const task=raw.replace(SOURCE_RE,'').replace(AUTO_RE,'\n').replace(SELECTED_RE,'\n').replace(WORKSPACE_RE,'\n').replace(/\n\n--- DATEIANHÄNGE ---\n?/g,'\n').replace(INTERNAL_RE,'').replace(/\n*\[MCL-VORSCHLAG:[a-z0-9]+\]\s*$/i,'').replace(/\n{3,}/g,'\n\n').trim();
  return{task,sources};
}
function workspaceSources(){
  try{return(window.MCLMidiWorkspaceSources?.()||[]).filter(x=>isScore(x?.score)).map(x=>({slot:Number(x.slot)||null,name:x.name||x.score?.ti||'Stück',score:clone(x.score)}))}catch{return[]}
}
function sameSource(a,b){try{return JSON.stringify(a?.score)===JSON.stringify(b?.score)}catch{return false}}
function mergeSources(...groups){const out=[];for(const g of groups)for(const s of(g||[]))if(isScore(s?.score)&&!out.some(x=>sameSource(x,s)))out.push(clone(s));return out}
function sourceInfo(s){
  const tr=s?.score?.tr||[],ts=s?.score?.ts||{};let notes=0,end=0;
  tr.forEach(t=>(t.nt||[]).forEach(n=>{if(!Array.isArray(n))return;notes++;end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0))}));
  const hasMeter=Number(ts.n)>0&&Number(ts.d)>0,bar=hasMeter?Number(ts.n)*(4/Number(ts.d)):null;
  return{slot:s.slot??null,name:s.name||s.score?.ti||'Stück',notes,bars:bar?Number((end/bar).toFixed(2)):null,beats:Number(end.toFixed(2)),bpm:s.score?.bpm??null,meter:hasMeter?`${ts.n}/${ts.d}`:null,key:s.score?.k??null};
}
function activeSourceIndex(sources){
  try{
    const b=document.querySelector('.mcl-midi-slot.active');if(!b)return null;
    const slot=Number(b.dataset.slot)+1;
    const i=sources.findIndex(s=>Number(s?.slot)===slot);return i>=0?i+1:null;
  }catch{return null}
}
function catalogue(sources,activeIndex=null){
  return sources.map((s,i)=>{const x=sourceInfo(s),active=i+1===activeIndex?' [AKTUELL AUSGEWÄHLT]':'';return `${i+1}: ${x.slot?`Speicherplatz ${x.slot} · `:''}${x.name}${active} | ${x.bars??'?'} Takte | ${x.beats??'?'} Beats | ${x.bpm??'?'} BPM | ${x.meter??'?'} | Tonart ${x.key??'frei'} | ${x.notes} Noten`}).join('\n');
}
function assignment(task,sources){
  let a=`Auftrag:\n${task}`;
  sources.forEach((s,i)=>a+=`\n\nVORHANDENES MATERIAL${sources.length>1?' '+(i+1):''} (${s.name||s.score?.ti||'Stück'}):\n${JSON.stringify(s.score)}`);
  return a;
}
function scoreBlocks(sources){return sources.map(s=>`[MCL-ENGINE14-SCORE name=${JSON.stringify(s.name||s.score?.ti||'Stück')}]\n${JSON.stringify(s.score)}\n[/MCL-ENGINE14-SCORE]`).join('\n\n')}

function readStore(key){try{return JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{return{}}}
function writeStore(key,x){try{localStorage.setItem(key,JSON.stringify(x))}catch(_){}}
function pendingStores(){return[STORE,...LEGACY_STORES]}
function markerId(text){const m=String(text||'').match(/\[MCL-(?:OPENAI-)?VORSCHLAG:([a-z0-9]+)\]/i);return m?m[1]:null}
function findPending(messages){
  for(let i=messages.length-1;i>=0;i--){
    if(messages[i].role!=='assistant')continue;
    const pid=markerId(messages[i].content);if(!pid)continue;
    for(const key of pendingStores()){const store=readStore(key);if(store[pid])return{key,store,pid,p:store[pid]}}
  }
  const recent=[];
  for(const key of pendingStores())for(const [pid,p] of Object.entries(readStore(key)))if(Date.now()-Number(p?.createdAt||0)<30*60*1000)recent.push({key,pid,p});
  recent.sort((a,b)=>Number(b.p?.createdAt||0)-Number(a.p?.createdAt||0));
  if(recent.length===1){const r=recent[0];return{...r,store:readStore(r.key)}}
  return null;
}
function savePending(rec){rec.store[rec.pid]=rec.p;writeStore(rec.key,rec.store)}
function deletePending(rec){delete rec.store[rec.pid];writeStore(rec.key,rec.store)}
function newPending(p){const pid=Math.random().toString(36).slice(2,9),store=readStore(STORE);store[pid]=p;writeStore(STORE,store);return pid}
function pendingSources(p){
  if(Array.isArray(p?.sources)&&p.sources.some(s=>isScore(s?.score)))return p.sources.filter(s=>isScore(s?.score)).map(clone);
  const ws=workspaceSources(),infos=Array.isArray(p?.sourceInfo)?p.sourceInfo:[];
  return infos.map(info=>ws.find(s=>(info?.slot&&Number(s?.slot)===Number(info.slot))||s?.name===info?.name)).filter(Boolean).map(clone);
}
function diagnostic(stage,data){try{localStorage.setItem(DIAG,JSON.stringify({version:VERSION,timestamp:new Date().toISOString(),architecture:'unified-v1',stage,...data},null,2))}catch(_){}}

function obviousPendingIntent(task){
  const t=String(task||'').trim().toLowerCase().replace(/[.!?]+$/,'').trim();
  if(/^(ja|j|ja bitte|ok|okay|mach das|mache das|bitte|los|ausführen|ausfuehren|genau|einverstanden|so machen)$/.test(t))return'CONFIRM';
  if(/^(nein|n|ablehnen|verwerfen|abbrechen|lass es|lasse es|nicht machen)$/.test(t))return'REJECT';
  return null;
}
function forcedComposeTask(task){
  return /^\s*\[MCL-DIALOG-OFFER-ACCEPTED\]/i.test(String(task||''));
}
async function route(provider,url,headers,model,task,previous,candidates,activeIndex,hasPending){
  const choices=hasPending?'CONFIRM | REJECT | REVISE | COMPOSE | ANALYZE | DISCUSS':'COMPOSE | ANALYZE | DISCUSS';
  const prompt=`Ordne die aktuelle Nutzereingabe ein und wähle zugleich nur die musikalischen Quellen, die dafür tatsächlich benötigt werden.\n\nINTENTS: ${choices}\nCOMPOSE = neue Musik erzeugen oder vorhandene Musik musikalisch verändern.\nANALYZE = konkrete Musik anhand ihrer tatsächlichen Noten-, Harmonie-, Rhythmus-, Form- oder Struktur-Daten untersuchen, beurteilen oder vergleichen.\nDISCUSS = allgemeines Gespräch oder Erklärung ohne Bedarf an vollständigen Notendaten.\nCONFIRM = offenen Kompositionsvorschlag ausführen.\nREJECT = offenen Vorschlag verwerfen.\nREVISE = offenen Kompositionsvorschlag vor der Ausführung ändern.\nDie aktuell markierte Quelle ist nur Dialogzustand, keine automatische Vorgabe. Bezieht sich der Nutzer aber inhaltlich auf „dieses Stück“, „die Fassung“, „das Ergebnis“ o.ä., ist die markierte Quelle die primäre Referenz.\nBei echter Mehrdeutigkeit DISCUSS.\n\nQUELLENKATALOG:\n${candidates.length?catalogue(candidates,activeIndex):'Keine musikalische Quelle vorhanden.'}\n\nVORHERIGE KI-ANTWORT:\n${String(previous||'').replace(/\[MCL-(?:OPENAI-)?VORSCHLAG:[a-z0-9]+\]/ig,'').slice(-1600)}\n\nAKTUELLE NUTZEREINGABE:\n${task}\n\nAntworte ausschließlich als JSON: {"intent":"...","sources":[1,2]}. sources enthält nur Katalognummern; bei keiner benötigten Quelle [].`;
  const raw=await direct(provider,url,headers,model,ROUTER_SYSTEM,prompt,500),x=parseObject(raw);
  const allowed=choices.split(' | '),intent=String(x?.intent||'').toUpperCase();
  const nums=[...new Set((Array.isArray(x?.sources)?x.sources:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=candidates.length))];
  return{intent:allowed.includes(intent)?intent:'DISCUSS',sources:nums.map(n=>candidates[n-1]),sourceNumbers:nums};
}

function normalizeContract(raw,sourceCount){
  let mode=String(raw?.resultMode||raw?.mode||'').toUpperCase();
  if(!sourceCount)mode='NEW_SCORE';
  else if(mode==='NEW_SCORE')mode='REPLACE_SCORE';
  if(!['PATCH','REPLACE_SCORE','NEW_SCORE'].includes(mode))mode=sourceCount?'REPLACE_SCORE':'NEW_SCORE';
  let base=raw?.base==null?null:Math.trunc(Number(raw.base));
  if(mode==='NEW_SCORE')base=null;
  else if(!(base>=1&&base<=sourceCount))base=1;
  return{mode,base};
}
function proposalText(pid,proposal){return `Kompositionsvorschlag:\n\n${String(proposal||'').trim()}\n\nWenn du damit einverstanden bist, antworte einfach mit „Ja“ oder „Mach das“. Änderungswünsche kannst du stattdessen direkt schreiben.\n\n[MCL-VORSCHLAG:${pid}]`}
async function createProposal(provider,url,headers,model,task,sources,previousProposal=''){
  const a=assignment(task,sources),revision=previousProposal?`\n\nBISHERIGER KOMPONITIONSVORSCHLAG:\n${previousProposal}\nÜberarbeite ihn entsprechend dem aktuellen Auftrag.`:'';
  const prompt=`Erledige zwei getrennte Dinge.\n\n1. MUSIKALISCHER VORSCHLAG: Verstehe den freien Auftrag musikalisch und formuliere einen knappen Kompositionsvorschlag. Beginne den Text mit „Auftrag verstanden:“ und gib in einem kurzen Satz wieder, was erzeugt oder verändert werden soll. Danach höchstens drei kurze Sätze mit dem wesentlichen musikalischen Gedanken. Kein detaillierter Bauplan. Nenne Tempo in BPM. Eine Taktzahl nur, wenn sie aus den vorhandenen Daten eindeutig hervorgeht.\n\n2. TECHNISCHER ERGEBNISMODUS: Diese Entscheidung darf den musikalischen Vorschlag nicht einschränken. PATCH bedeutet: mindestens ein Teil einer ausgewählten Ausgangsquelle soll im Ergebnis exakt unverändert erhalten bleiben. REPLACE_SCORE bedeutet: vorhandenes Material wird verwendet, aber das Ergebnis ersetzt den Ausgangsscore als Ganzes. NEW_SCORE bedeutet: vollständig neue Musik ohne verwendete Ausgangsquelle. Bei PATCH oder REPLACE_SCORE nenne mit base die primäre Quelle, beginnend bei 1.\n\n${a}${revision}\n\nAntworte ausschließlich als JSON: {"proposal":"Auftrag verstanden: ...","resultMode":"PATCH|REPLACE_SCORE|NEW_SCORE","base":1}.`;
  let raw=await direct(provider,url,headers,model,MUSICAL_SYSTEM,prompt,1200),x=parseObject(raw);
  if(!x||!String(x.proposal||'').trim()){
    raw=await direct(provider,url,headers,model,MUSICAL_SYSTEM,`${prompt}\n\nKORREKTUR: Die vorige Antwort war nicht im verlangten JSON-Format. Gib jetzt ausschließlich das eine JSON-Objekt aus.`,1200);x=parseObject(raw);
  }
  if(!x||!String(x.proposal||'').trim())throw new Error('Die KI hat keinen gültigen Kompositionsvorschlag geliefert.');
  return{proposal:String(x.proposal).trim(),contract:normalizeContract(x,sources.length),assignment:a};
}
async function ensureLegacyContract(provider,url,headers,model,p,sources){
  const c=p?.editContract||p?.contract;
  if(c&&['PATCH','REPLACE_SCORE','NEW_SCORE'].includes(String(c.mode||'').toUpperCase()))return normalizeContract({resultMode:c.mode,base:c.base},sources.length);
  const prompt=`Bestimme ausschließlich den technischen Ergebnismodus für den bereits bestätigten musikalischen Auftrag. PATCH = Teile der primären Ausgangsquelle bleiben exakt unverändert. REPLACE_SCORE = vorhandenes Material wird verwendet, aber der Score als Ganzes neu ausgegeben. NEW_SCORE = keine Ausgangsquelle wird verwendet.\n\nAUFTRAG:\n${p?.task||''}\n\nKOMPONITIONSVORSCHLAG:\n${p?.concept||p?.proposal||''}\n\nQUELLEN:\n${sources.length?catalogue(sources):'Keine'}\n\nAntworte nur als JSON: {"resultMode":"PATCH|REPLACE_SCORE|NEW_SCORE","base":1}.`;
  const x=parseObject(await direct(provider,url,headers,model,ROUTER_SYSTEM,prompt,250));
  return normalizeContract(x,sources.length);
}

function patchPrompt(p,contract,sources){
  const base=Math.max(1,Math.trunc(Number(contract.base)||1));
  return `VERBINDLICHER TECHNISCHER MODUS: PATCH\nDieser Modus ist nur eine Ausgabetechnik und keine zusätzliche musikalische Vorgabe.\n- Gib ausschließlich ein PATCH-JSON aus.\n- Verwende base=${base}.\n- Gib nur Änderungen oder Ergänzungen aus; unveränderte Teile des Basisscores dürfen nicht erneut ausgegeben werden.\n- Die App setzt den Patch deterministisch mit dem Basisscore zur vollständigen Komposition zusammen.\n- Die neue Komposition muss im Feld "ti" einen eigenen, nichtleeren musikalischen Titel erhalten, sofern der Nutzer nicht ausdrücklich denselben Titel verlangt.\n\nPATCH-FORMAT:\n{"mode":"patch","base":${base},"ti":"Titel","sm":"Kurze Zusammenfassung","meta":{"bpm":74,"ts":{"n":4,"d":4},"k":"C major"},"ops":[{"op":"add_track","track":{"nm":"Neue Spur","ch":1,"pg":40,"nt":[...],"ct":[...]}}]}\nZulässige Operationen: add_track, insert_track, replace_track, delete_track, replace_range. Track-index beginnt bei 0; alternativ darf ein eindeutiger exakter Trackname als name verwendet werden. Bei replace_range sind start/end globale Beat-Positionen; nur Ereignisse mit Startposition in [start,end) werden ersetzt. Nicht genannte Teile und Metadaten bleiben unverändert.\nNOTATION: nt=[StartBeat,Dauer,Pitch,Velocity,Staff,Gate], ct=[Beat,CC,Wert].\n\n${p.assignment||assignment(p.task||'',sources)}\n\nBESTÄTIGTER KOMPONITIONSVORSCHLAG:\n${p.proposal||p.concept||''}\n\nAntworte ausschließlich mit genau einem validen JSON-Objekt, ohne Markdown oder Kommentar.`;
}
function fullPrompt(p,contract,sources){
  return `VERBINDLICHER TECHNISCHER MODUS: ${contract.mode}\nDieser Modus ist nur eine Ausgabetechnik und keine zusätzliche musikalische Vorgabe. Gib jetzt die vollständige fertige Partitur als valides JSON aus.\nFormat: {"ti":"Titel","bpm":96,"ts":{"n":4,"d":4},"k":"C major","sm":"Kurze Zusammenfassung","tr":[...]}. Track: nm,ch,pg,nt,optional ct. nt=[StartBeat,Dauer,Pitch,Velocity,Staff,Gate], ct=[Beat,CC,Wert].\nDie neue Komposition muss im Feld "ti" einen eigenen, nichtleeren musikalischen Titel erhalten, sofern der Nutzer nicht ausdrücklich denselben Titel verlangt.\n\n${p.assignment||assignment(p.task||'',sources)}\n\nBESTÄTIGTER KOMPONITIONSVORSCHLAG:\n${p.proposal||p.concept||''}\n\nAntworte ausschließlich mit genau einem validen JSON-Objekt, ohne Markdown oder Kommentar.`;
}
function validateResult(raw,contract){
  const x=parseObject(raw);if(!x)return false;
  if(contract.mode==='PATCH')return String(x.mode||'').toLowerCase()==='patch'&&String(x.ti||'').trim()&&Math.max(1,Math.trunc(Number(x.base)||1))===Math.max(1,Math.trunc(Number(contract.base)||1));
  const score=String(x.mode||'').toLowerCase()==='replace_score'?x.score:x;
  return isScore(score)&&!!String(score.ti||'').trim();
}
async function runFinal(provider,url,headers,model,rec){
  const sources=pendingSources(rec.p),contract=await ensureLegacyContract(provider,url,headers,model,rec.p,sources);
  rec.p.contract=contract;savePending(rec);
  const isPatch=contract.mode==='PATCH',prompt=isPatch?patchPrompt(rec.p,contract,sources):fullPrompt(rec.p,contract,sources),maxTokens=isPatch?16000:32000;
  diagnostic('final-composition-call',{provider,model,pendingId:rec.pid,task:rec.p.task||'',sources:sources.map(sourceInfo),contract});
  let raw=await direct(provider,url,headers,model,MUSICAL_SYSTEM,prompt,maxTokens);
  if(!validateResult(raw,contract)){
    diagnostic('final-composition-retry',{provider,model,pendingId:rec.pid,contract,reason:'invalid or wrong result mode'});
    raw=await direct(provider,url,headers,model,MUSICAL_SYSTEM,`${prompt}\n\nKORREKTUR: Die vorige Antwort war kein valides Ergebnis im verbindlichen Modus ${contract.mode}. Gib jetzt exakt das verlangte JSON aus.`,maxTokens);
  }
  if(!validateResult(raw,contract))throw new Error(`Die KI hat kein gültiges Kompositionsergebnis im Modus ${contract.mode} geliefert.`);
  const score=materialize(raw,sources);if(!isScore(score))throw new Error('Die KI hat kein gültiges Kompositionsergebnis geliefert.');
  if(!String(score.ti||'').trim())throw new Error('Die erzeugte Komposition hat keinen gültigen Titel.');
  deletePending(rec);
  diagnostic('final-composition-valid',{provider,model,pendingId:rec.pid,task:rec.p.task||'',contract,tracks:score.tr.length,outputCharacters:String(raw).length});
  return synthetic(provider,JSON.stringify(score),model);
}

function appendSelected(provider,body,sources){
  const extra=sources.length?`\n\n--- AUSGEWÄHLTES MUSIKMATERIAL ---\n${scoreBlocks(sources)}\n--- ENDE AUSGEWÄHLTES MUSIKMATERIAL ---`:'';
  const clean=t=>String(t||'').replace(SOURCE_RE,'').replace(AUTO_RE,'\n').replace(SELECTED_RE,'\n').replace(WORKSPACE_RE,'\n').trim()+extra;
  const b=clone(body);
  if(provider==='openai'&&Array.isArray(b.input)){
    for(let i=b.input.length-1;i>=0;i--){const m=b.input[i];if(m?.role==='assistant')continue;const t=textOf(m);if(!t)continue;m.content=typeof m.content==='string'?clean(t):[{type:'input_text',text:clean(t)}];break}
  }else if(provider==='anthropic'&&Array.isArray(b.messages)){
    for(let i=b.messages.length-1;i>=0;i--){const m=b.messages[i];if(m?.role!=='user')continue;const t=textOf(m);if(!t)continue;m.content=typeof m.content==='string'?clean(t):[{type:'text',text:clean(t)}];break}
  }else if(provider==='google'&&Array.isArray(b.contents)){
    for(let i=b.contents.length-1;i>=0;i--){const m=b.contents[i];if(m?.role==='model')continue;const t=textOf(m);if(!t)continue;m.parts=[{text:clean(t)}];break}
  }
  SOURCE_RE.lastIndex=0;return b;
}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:input?.url||'',provider=providerFor(url);
  if(!provider||typeof init.body!=='string')return baseFetch(input,init);
  let body;try{body=JSON.parse(init.body)}catch{return baseFetch(input,init)}
  const model=modelFrom(provider,url,body),msgs=messagesFor(provider,body),last=[...msgs].reverse().find(m=>m.role==='user');
  if(!last)return baseFetch(input,init);
  const extracted=extract(last.content),task=extracted.task,previous=[...msgs].reverse().find(m=>m.role==='assistant')?.content||'',pending=findPending(msgs),shortcut=pending?obviousPendingIntent(task):null;
  const candidates=mergeSources(extracted.sources,workspaceSources(),pending?pendingSources(pending.p):[]),activeIndex=activeSourceIndex(candidates),forcedCompose=forcedComposeTask(task);
  try{
    let decision=shortcut?{intent:shortcut,sources:[],sourceNumbers:[]}:await route(provider,url,init.headers,model,task,previous,candidates,activeIndex,!!pending);
    if(forcedCompose&&!pending)decision={...decision,intent:'COMPOSE'};
    diagnostic('route',{provider,model,intent:decision.intent,forcedIntent:forcedCompose&&!pending?'COMPOSE':null,userText:task,hasPending:!!pending,candidateCount:candidates.length,selectedSources:decision.sources.map(sourceInfo),activeIndex});

    if(pending){
      if(decision.intent==='REJECT'){
        deletePending(pending);return synthetic(provider,'Kompositionsidee verworfen. Es wurde keine Komposition erzeugt.',model);
      }
      if(decision.intent==='CONFIRM')return await runFinal(provider,url,init.headers,model,pending);
      if(decision.intent==='REVISE'){
        const keep=pendingSources(pending.p),chosen=decision.sources.length?decision.sources:keep,revisions=Array.isArray(pending.p.revisions)?pending.p.revisions:[];
        revisions.push(task);const original=String(pending.p.originalTask||pending.p.task||'').trim(),effective=[original,...revisions].filter(Boolean).join('\nÄnderungswunsch: ');
        const made=await createProposal(provider,url,init.headers,model,effective,chosen,pending.p.proposal||pending.p.concept||'');
        pending.p={...pending.p,originalTask:original||task,task:effective,revisions,proposal:made.proposal,concept:made.proposal,assignment:made.assignment,contract:made.contract,editContract:made.contract,sourceInfo:chosen.map(sourceInfo),sources:chosen.map(clone),createdAt:Date.now()};savePending(pending);
        diagnostic('proposal-revised',{provider,model,pendingId:pending.pid,task:effective,sources:chosen.map(sourceInfo),contract:made.contract,proposal:made.proposal});
        return synthetic(provider,proposalText(pending.pid,made.proposal),model);
      }
      if(decision.intent==='COMPOSE')deletePending(pending);
    }

    if(decision.intent==='ANALYZE'){
      diagnostic('analysis-sources',{provider,model,task,sources:decision.sources.map(sourceInfo)});
      return baseFetch(input,{...init,body:JSON.stringify(appendSelected(provider,body,decision.sources))});
    }
    if(decision.intent!=='COMPOSE')return baseFetch(input,init);

    const made=await createProposal(provider,url,init.headers,model,task,decision.sources),createdAt=Date.now();
    const pid=newPending({originalTask:task,task,revisions:[],proposal:made.proposal,concept:made.proposal,assignment:made.assignment,contract:made.contract,editContract:made.contract,sourceInfo:decision.sources.map(sourceInfo),sources:decision.sources.map(clone),createdAt});
    diagnostic('proposal-created',{provider,model,pendingId:pid,task,candidateCount:candidates.length,sources:decision.sources.map(sourceInfo),contract:made.contract,proposal:made.proposal});
    return synthetic(provider,proposalText(pid,made.proposal),model);
  }catch(e){
    const message=e?.name==='AbortError'?'Laufende Anfrage wurde abgebrochen.':e?.message||String(e);
    diagnostic('architecture-error',{provider,model,userText:task,error:message});
    return errorResponse(provider,message);
  }
};

window.MCLDownloadDiagnostic=function(){
  const raw=localStorage.getItem(DIAG);if(!raw){alert('Noch keine Kompositionsdiagnose vorhanden.');return}
  const blob=new Blob([raw],{type:'application/json;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=u;a.download=`Music-Chat-Lab-Diagnose-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
};
})();