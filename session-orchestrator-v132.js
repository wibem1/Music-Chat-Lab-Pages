(()=>{
'use strict';
if(window.__mclSessionOrchestratorV132)return;
window.__mclSessionOrchestratorV132=true;

const VERSION='1.3.2';
const MEMORY_KEY='music-chat-lab.session-memory.v3';
const ACTIVE_CHAT_KEY='music-chat-lab.active-chat.v1';
const RECENT_MESSAGES=8;
const MAX_MEMORY_CHARS=900;
const MAX_LEGACY_CONTEXT_CHARS=4200;
const MAX_SCORE_REQUESTS=3;
const innerFetch=window.fetch.bind(window);
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));

const SCORE_RE=/\[MCL-ENGINE14-SCORE name=("(?:[^"\\]|\\.)*")\]\n[\s\S]*?\n\[\/MCL-ENGINE14-SCORE\]/g;
const LEGACY_BLOCKS=[
  /\n*--- MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---[\s\S]*?--- ENDE MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---\n*/g,
  /\n*--- AUSGEWÄHLTES MUSIKMATERIAL ---[\s\S]*?--- ENDE AUSGEWÄHLTES MUSIKMATERIAL ---\n*/g,
  /\n*--- AUTOMATISCH BEREITGESTELLTES MUSIKMATERIAL ---[\s\S]*?--- ENDE AUTOMATISCH BEREITGESTELLTES MUSIKMATERIAL ---\n*/g
];
const INTERNAL_RE=/\n*\[MCL-(?:DIALOG-OFFER-ACCEPTED|FORTSETZUNG-V123|AKTUELLER-GEGENSTAND-V124|DIALOGKONTEXT-V126)\][\s\S]*$/i;
const ACTION_RE=/<MCL_ACTION>\s*([\s\S]*?)\s*<\/MCL_ACTION>/i;
const NEED_RE=/<MCL_NEED>\s*([\s\S]*?)\s*<\/MCL_NEED>/i;
const MEMORY_RE=/<MCL_MEMORY>\s*([\s\S]*?)\s*<\/MCL_MEMORY>/i;

function providerFor(url){
  const u=String(url||'');
  if(u.includes('api.anthropic.com/v1/messages'))return'anthropic';
  if(u.includes('api.openai.com/v1/responses'))return'openai';
  if(u.includes('generativelanguage.googleapis.com/')&&u.includes(':generateContent'))return'google';
  return null;
}
function textOf(m){
  if(typeof m?.content==='string')return m.content;
  if(Array.isArray(m?.content))return m.content.map(x=>x?.text||x?.input_text||x?.output_text||'').join('');
  if(Array.isArray(m?.parts))return m.parts.map(x=>x?.text||'').join('');
  return'';
}
function roleOf(provider,m){
  if(provider==='google')return m?.role==='model'?'assistant':'user';
  return m?.role==='assistant'?'assistant':'user';
}
function rawMessages(provider,body){
  if(provider==='anthropic')return Array.isArray(body?.messages)?body.messages:[];
  if(provider==='openai')return Array.isArray(body?.input)?body.input.filter(x=>x?.role==='user'||x?.role==='assistant'):[];
  return Array.isArray(body?.contents)?body.contents:[];
}
function cleanLegacy(text){
  let s=String(text||'');
  s=s.replace(SCORE_RE,'');SCORE_RE.lastIndex=0;
  for(const re of LEGACY_BLOCKS)s=s.replace(re,'\n');
  s=s.replace(INTERNAL_RE,'').replace(/\n*\[MCL-(?:OPENAI-)?VORSCHLAG:[a-z0-9]+\]\s*/ig,'\n');
  return s.replace(/\n{3,}/g,'\n\n').trim();
}
function messages(provider,body){
  return rawMessages(provider,body).map(m=>({role:roleOf(provider,m),text:cleanLegacy(textOf(m))})).filter(m=>m.text);
}
function currentUserText(msgs){for(let i=msgs.length-1;i>=0;i--)if(msgs[i].role==='user')return msgs[i].text;return''}

function readMemory(){
  try{const all=JSON.parse(localStorage.getItem(MEMORY_KEY)||'{}')||{};return{all,id:localStorage.getItem(ACTIVE_CHAT_KEY)||'default'}}catch{return{all:{},id:'default'}}
}
function getMemory(){const x=readMemory();return String(x.all[x.id]||'').slice(0,MAX_MEMORY_CHARS)}
function saveMemory(text){
  const mem=String(text||'').replace(/\s+/g,' ').trim().slice(0,MAX_MEMORY_CHARS);if(!mem)return;
  try{const x=readMemory();x.all[x.id]=mem;localStorage.setItem(MEMORY_KEY,JSON.stringify(x.all))}catch(_){ }
}
function compactOld(msgs){
  if(msgs.length<=RECENT_MESSAGES)return'';
  const old=msgs.slice(0,-RECENT_MESSAGES),parts=[];let chars=0;
  for(const m of old){
    let t=m.text.replace(/\s+/g,' ').trim();
    if(t.length>520)t=t.slice(0,340)+' … '+t.slice(-140);
    const line=`${m.role==='user'?'Nutzer':'KI'}: ${t}`;
    if(chars+line.length>MAX_LEGACY_CONTEXT_CHARS)break;
    parts.push(line);chars+=line.length+1;
  }
  return parts.join('\n');
}

function workspaceSources(){
  try{return(window.MCLMidiWorkspaceSources?.()||window.MCLMidiSlots?.all?.()||[]).filter(x=>x?.score?.tr?.length).map(x=>({slot:Number(x.slot),name:x.name||x.score?.ti||`Stück ${x.slot}`,kind:x.kind||'',score:clone(x.score)}))}catch{return[]}
}
function activeSlot(){
  try{const b=document.querySelector('.mcl-midi-slot.active');return b?Number(b.dataset.slot)+1:null}catch{return null}
}
function scoreInfo(x){
  const s=x.score||{},tr=Array.isArray(s.tr)?s.tr:[],ts=s.ts||{};let notes=0,end=0;
  tr.forEach(t=>(t.nt||[]).forEach(n=>{if(!Array.isArray(n))return;notes++;end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0))}));
  const n=Number(ts.n)||null,d=Number(ts.d)||null,bar=n&&d?n*(4/d):null;
  return{slot:x.slot,name:x.name,kind:x.kind,tracks:tr.map(t=>t.nm||'Spur').join(', '),notes,bars:bar?Number((end/bar).toFixed(2)):null,beats:Number(end.toFixed(2)),bpm:s.bpm??null,meter:n&&d?`${n}/${d}`:null,key:s.k||null};
}
function catalogue(sources,active){
  if(!sources.length)return'Keine MIDI-Fassung im Arbeitstisch.';
  return sources.map(x=>{const i=scoreInfo(x);return `Speicher ${i.slot}${i.slot===active?' [AKTIV]':''}: ${i.name} | Spuren: ${i.tracks||'?'} | ${i.notes} Noten | ${i.bars??'?'} Takte | ${i.bpm??'?'} BPM | ${i.meter??'?'} | ${i.key??'Tonart offen'}`}).join('\n');
}
function scoreBlocks(selected){
  return selected.map(x=>`<MCL_SCORE slot="${x.slot}" name=${JSON.stringify(x.name)}>\n${JSON.stringify(x.score)}\n</MCL_SCORE>`).join('\n\n');
}
function sourcesForSlots(slots,sources){
  const out=[];
  for(const n of slots){const src=sources.find(x=>Number(x.slot)===Number(n));if(src&&!out.includes(src))out.push(src)}
  return out.slice(0,MAX_SCORE_REQUESTS);
}

function systemPrompt(memory,legacy,catalogueText,active,provided){
  const providedLine=provided.length?`Für diesen Zug sind die vollständigen Notendaten von Speicher ${provided.map(x=>x.slot).join(', ')} beigefügt.`:'Für diesen Zug sind zunächst keine vollständigen Notendaten beigefügt.';
  return `Du bist Music Chat Lab, ein zusammenhängender Musik-Chat mit direkter MIDI-Handlungsfähigkeit. Behandle den Dialog als fortlaufendes Gespräch. Die App interpretiert die Sprache des Nutzers nicht anhand von Schlüsselwörtern; du selbst entscheidest musikalisch und semantisch, was gemeint ist.\n\nMUSIKALISCHER ARBEITSTISCH (KATALOG):\n${catalogueText}\nAktiver Speicher: ${active??'keiner'}.\n${providedLine}\n\nNOTENDATEN BEI BEDARF: Wenn du für die aktuelle Antwort vollständige Notendaten aus einem oder mehreren Speichern brauchst und sie noch nicht als <MCL_SCORE> beigefügt sind, antworte ausschließlich mit genau einem Maschinenblock und fordere alle benötigten Speicher in einem Schritt an:\n<MCL_NEED>{"slots":[1,3]}</MCL_NEED>\nMaximal ${MAX_SCORE_REQUESTS} Speicher. Diese Anforderung wird von der App verborgen und automatisch erfüllt; sie ist keine Antwort an den Nutzer. Fordere keine Speicher an, wenn der Katalog für die Aufgabe genügt. Wenn <MCL_SCORE> vorhanden ist, verwende diese Daten direkt und fordere sie nicht erneut an.\n\nMIDI-AKTIONEN: Antworte normal in natürlicher Sprache. Nur wenn jetzt tatsächlich eine MIDI-Fassung erzeugt oder verändert werden soll, hänge am Ende genau eine <MCL_ACTION> an. Die Entscheidung, welche Aktion passt, triffst du aus dem Gespräch heraus.\n\n1) Vorhandenes Material teilweise verändern oder um neue komponierte Spuren ergänzen: PATCH. Unveränderte Teile niemals erneut ausgeben.\n<MCL_ACTION>{"type":"patch","baseSlot":1,"title":"Neuer Titel","summary":"Kurze Beschreibung","meta":{"bpm":74,"ts":{"n":4,"d":4},"k":"C major"},"ops":[{"op":"add_track","track":{"nm":"Violin","ch":1,"pg":40,"nt":[[0,1,72,70,0,1]],"ct":[]}}]}</MCL_ACTION>\nZulässige PATCH-Operationen: add_track, insert_track, replace_track, delete_track, replace_range. Für bestehende Spuren nutze index (0-basiert) oder den eindeutigen exakten Namen. replace_range benutzt globale Beat-Positionen start/end.\n\n2) Bereits vorhandene Spuren oder ganze vorhandene Speicher nur technisch zusammenführen, ohne neue Noten zu erfinden: MERGE. Diese Aktion ist billig, weil die App die vorhandenen Noten lokal übernimmt. Verwende exakte Spurennamen aus dem Katalog bzw. den bereitgestellten Scores. Wenn tracks fehlt, werden alle Spuren des betreffenden Speichers übernommen.\n<MCL_ACTION>{"type":"merge","sources":[{"slot":1,"tracks":["Piano right","Piano left"]},{"slot":3,"tracks":["Violin"]}],"title":"Gemeinsame Fassung","summary":"Klavier und vorhandene Violine zusammengeführt."}</MCL_ACTION>\n\n3) Vollständig neue Musik ohne vorhandenen Basisscore: NEW_SCORE.\n<MCL_ACTION>{"type":"new_score","score":{"ti":"Titel","bpm":96,"ts":{"n":4,"d":4},"k":"C major","sm":"Kurze Beschreibung","tr":[{"nm":"Piano","ch":0,"pg":0,"nt":[...],"ct":[]}]}}</MCL_ACTION>\n\n4) Nur wenn ein vorhandener Score wirklich als Ganzes neu geschrieben werden muss: REPLACE_SCORE mit baseSlot und score.\n\nNotenformat nt=[StartBeat,Dauer,Pitch,Velocity,Staff,Gate], Controller ct=[Beat,CC,Wert]. Gib keine MIDI-Aktion aus, wenn du nur diskutierst, analysierst oder einen Vorschlag machst.\n\nGESPRÄCHSFORTSETZUNG: Wenn der Nutzer ein zuvor von dir angebotenes musikalisches Vorhaben bestätigt, verstehe die Bestätigung aus dem bisherigen Dialog. Es gibt keinen separaten DISCUSS/ANALYZE/COMPOSE-Router.\n\nGEDÄCHTNIS: Hänge an jede normale, endgültige Antwort ganz am Ende ein kurzes verborgenes Gedächtnis an, maximal ${MAX_MEMORY_CHARS} Zeichen. Bewahre nur dauerhaften Gesprächskontext: aktuelles Ziel, wichtige Entscheidungen, Bedeutung vorhandener Fassungen und offene Angebote. Keine vollständigen Notenlisten. Format exakt:\n<MCL_MEMORY>...</MCL_MEMORY>\n\nBISHERIGES KOMPAKTGEDÄCHTNIS:\n${memory||'(noch keines)'}${legacy?`\n\nÄLTERER DIALOGAUSZUG (nur zur Initialisierung des Gedächtnisses):\n${legacy}`:''}`;
}

function compressMessages(msgs,memory){
  const keep=(msgs.length<=RECENT_MESSAGES||!memory)?Math.max(RECENT_MESSAGES,12):RECENT_MESSAGES;
  let start=Math.max(0,msgs.length-keep);
  if(start>0&&msgs[start]?.role==='assistant')start--;
  const out=msgs.slice(start);
  while(out.length&&out[0].role==='assistant')out.shift();
  return out;
}
function withScores(msgs,user,selected){
  const out=msgs.map(x=>({...x}));
  for(let i=out.length-1;i>=0;i--){if(out[i].role!=='user')continue;out[i].text=`${cleanLegacy(user)}${selected.length?`\n\n${scoreBlocks(selected)}`:''}`.trim();break}
  return out;
}
function buildProviderBody(provider,body,msgs,system){
  const b=clone(body);
  if(provider==='anthropic'){
    b.system=system;b.messages=msgs.map(m=>({role:m.role,content:m.text}));
    b.thinking={type:'disabled'};delete b.output_config;
    b.max_tokens=Math.max(Number(b.max_tokens)||4096,12000);
  }else if(provider==='openai'){
    b.input=[{role:'system',content:system},...msgs.map(m=>({role:m.role,content:m.text}))];b.store=false;
  }else{
    b.systemInstruction={parts:[{text:system}]};b.contents=msgs.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.text}]}));
    b.generationConfig={...(b.generationConfig||{}),maxOutputTokens:Math.max(Number(b.generationConfig?.maxOutputTokens)||8192,12000)};
  }
  return b;
}

function responseText(provider,d){
  if(provider==='anthropic')return(d?.content||[]).filter(x=>x?.type==='text').map(x=>x.text||'').join('').trim();
  if(provider==='openai'){
    if(typeof d?.output_text==='string'&&d.output_text.trim())return d.output_text.trim();
    return(d?.output||[]).flatMap(x=>x?.content||[]).filter(x=>x?.type==='output_text'||x?.type==='text').map(x=>x?.text||'').join('\n').trim();
  }
  return(d?.candidates?.[0]?.content?.parts||[]).map(x=>x?.text||'').join('\n').trim();
}
function replaceResponseText(provider,d,text){
  const x=clone(d)||{};
  if(provider==='anthropic')x.content=[{type:'text',text}];
  else if(provider==='openai'){
    x.output_text=text;x.output=[{type:'message',role:'assistant',content:[{type:'output_text',text}]}];
  }else{
    x.candidates=x.candidates?.length?x.candidates:[{}];x.candidates[0]={...(x.candidates[0]||{}),content:{role:'model',parts:[{text}]}};
  }
  return x;
}
function jsonResponse(data,status=200,headers){
  const h=new Headers(headers||{});h.set('content-type','application/json');
  return new Response(JSON.stringify(data),{status,headers:h});
}
function parseJsonBlock(text,re){
  const m=String(text||'').match(re);if(!m)return null;
  let s=m[1].trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(s)}catch{return{__invalid:true,raw:s}}
}
function parseAction(text){return parseJsonBlock(text,ACTION_RE)}
function parseNeed(text){
  const x=parseJsonBlock(text,NEED_RE);if(!x||x.__invalid||!Array.isArray(x.slots))return null;
  const slots=[];for(const n of x.slots){const v=Number(n);if(Number.isInteger(v)&&v>=1&&v<=6&&!slots.includes(v))slots.push(v)}
  return slots.slice(0,MAX_SCORE_REQUESTS);
}
function extractMemory(text){const m=String(text||'').match(MEMORY_RE);return m?m[1].trim():''}
function visibleText(text){return String(text||'').replace(ACTION_RE,'').replace(NEED_RE,'').replace(MEMORY_RE,'').replace(/\n{3,}/g,'\n\n').trim()}
function incompleteInternal(text){
  const s=String(text||'');
  if(s.includes('<MCL_ACTION>')&&!s.includes('</MCL_ACTION>'))return'MIDI-Aktion';
  if(s.includes('<MCL_NEED>')&&!s.includes('</MCL_NEED>'))return'Notendaten-Anforderung';
  return'';
}
function safeIncompleteText(raw,kind){
  const marker=kind==='MIDI-Aktion'?'<MCL_ACTION>':'<MCL_NEED>';
  const prefix=String(raw||'').split(marker)[0].replace(MEMORY_RE,'').trim();
  return `${prefix}${prefix?'\n\n':''}Die interne ${kind} wurde unvollständig übertragen und deshalb verworfen. Es wurde keine Datei verändert.`;
}

function isScore(x){return !!x&&Array.isArray(x.tr)&&x.tr.some(t=>Array.isArray(t?.nt))}
function validTrack(t){return !!t&&typeof t==='object'&&Array.isArray(t.nt)}
function trackIndex(score,op){
  if(Number.isInteger(op?.index))return op.index;
  if(typeof op?.name==='string'){
    const hits=(score.tr||[]).map((t,i)=>t?.nm===op.name?i:-1).filter(i=>i>=0);if(hits.length===1)return hits[0];
  }
  return-1;
}
function sortEvents(a){return(a||[]).slice().sort((x,y)=>(Number(x?.[0])||0)-(Number(y?.[0])||0))}
function applyPatch(action,sources){
  const slot=Number(action?.baseSlot),src=sources.find(x=>Number(x.slot)===slot);if(!src||!isScore(src.score)||!Array.isArray(action?.ops))return null;
  const score=clone(src.score);
  if(typeof action.title==='string'&&action.title.trim())score.ti=action.title.trim();
  if(typeof action.summary==='string'&&action.summary.trim())score.sm=action.summary.trim();
  if(action.meta&&typeof action.meta==='object')for(const k of['bpm','ts','k'])if(Object.prototype.hasOwnProperty.call(action.meta,k))score[k]=clone(action.meta[k]);
  for(const op of action.ops){
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
      const tr=clone(score.tr[ix]);tr.nt=sortEvents((tr.nt||[]).filter(n=>{const t=Number(n?.[0]);return!(Number.isFinite(t)&&t>=start&&t<end)}).concat(clone(op.nt)));
      if(Array.isArray(op.ct))tr.ct=sortEvents((tr.ct||[]).filter(c=>{const t=Number(c?.[0]);return!(Number.isFinite(t)&&t>=start&&t<end)}).concat(clone(op.ct)));
      score.tr[ix]=tr;continue;
    }
    return null;
  }
  if(!String(score.ti||'').trim())score.ti='Neue Komposition';
  return score;
}
function trackSignature(t){
  try{return JSON.stringify({nm:t?.nm||'',ch:t?.ch??null,pg:t?.pg??null,nt:t?.nt||[],ct:t?.ct||[]})}catch{return''}
}
function mergeAction(action,sources){
  if(!Array.isArray(action?.sources)||!action.sources.length)return null;
  let score=null;const tracks=[];const seen=new Set();
  for(const spec of action.sources){
    const src=sources.find(x=>Number(x.slot)===Number(spec?.slot));if(!src||!isScore(src.score))return null;
    if(!score)score=clone(src.score);
    let chosen=src.score.tr||[];
    if(Array.isArray(spec.tracks)&&spec.tracks.length){
      const names=new Set(spec.tracks.map(String));chosen=chosen.filter(t=>names.has(String(t?.nm||'')));
      if(chosen.length!==names.size)return null;
    }
    for(const t of chosen){const sig=trackSignature(t);if(seen.has(sig))continue;tracks.push(clone(t));seen.add(sig)}
  }
  if(!score||!tracks.length)return null;
  score.tr=tracks;
  if(typeof action.title==='string'&&action.title.trim())score.ti=action.title.trim();
  else if(!String(score.ti||'').trim())score.ti='Gemeinsame Fassung';
  if(typeof action.summary==='string'&&action.summary.trim())score.sm=action.summary.trim();
  else score.sm='Vorhandene Spuren wurden lokal zusammengeführt.';
  return score;
}
function materializeAction(action,sources,prefix){
  if(!action||action.__invalid)return null;
  const type=String(action.type||'').toLowerCase();let score=null;
  if(type==='patch')score=applyPatch(action,sources);
  else if(type==='merge')score=mergeAction(action,sources);
  else if(type==='new_score'&&isScore(action.score))score=clone(action.score);
  else if(type==='replace_score'&&isScore(action.score))score=clone(action.score);
  if(!isScore(score))return null;
  if(!String(score.ti||'').trim())score.ti=String(action.title||'Neue Komposition').trim()||'Neue Komposition';
  if(!String(score.sm||'').trim())score.sm=String(action.summary||prefix||'MIDI-Komposition wurde erzeugt.').replace(/\s+/g,' ').trim().slice(0,500);
  return score;
}

async function runProvider(input,init,provider,body,msgs,system){
  const requestBody=buildProviderBody(provider,body,msgs,system);
  const r=await innerFetch(input,{...init,body:JSON.stringify(requestBody)});
  const d=await r.clone().json().catch(()=>null);
  return{r,d,raw:d&&r.ok?responseText(provider,d):''};
}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:input?.url||'',provider=providerFor(url);
  if(!provider||typeof init.body!=='string')return innerFetch(input,init);
  let body;try{body=JSON.parse(init.body)}catch{return innerFetch(input,init)}
  const all=messages(provider,body),user=currentUserText(all);if(!user)return innerFetch(input,init);

  const sources=workspaceSources(),active=activeSlot(),memory=getMemory(),legacy=memory?'':compactOld(all),recent=compressMessages(all,memory);
  let provided=[];
  let contextual=withScores(recent,user,provided);
  let system=systemPrompt(memory,legacy,catalogue(sources,active),active,provided);
  let first=await runProvider(input,init,provider,body,contextual,system);
  if(!first.d||!first.r.ok)return first.r;
  if(!first.raw)return first.r;

  const firstIncomplete=incompleteInternal(first.raw);
  if(firstIncomplete)return jsonResponse(replaceResponseText(provider,first.d,safeIncompleteText(first.raw,firstIncomplete)),first.r.status,first.r.headers);

  const need=parseNeed(first.raw);
  let result=first;
  if(need?.length){
    provided=sourcesForSlots(need,sources);
    if(provided.length!==need.length){
      const text='Die angeforderten Notendaten sind im musikalischen Arbeitstisch nicht vollständig verfügbar.';
      return jsonResponse(replaceResponseText(provider,first.d,text),first.r.status,first.r.headers);
    }
    contextual=withScores(recent,user,provided);
    system=systemPrompt(memory,legacy,catalogue(sources,active),active,provided);
    result=await runProvider(input,init,provider,body,contextual,system);
    if(!result.d||!result.r.ok)return result.r;
    if(!result.raw)return result.r;
    const secondIncomplete=incompleteInternal(result.raw);
    if(secondIncomplete)return jsonResponse(replaceResponseText(provider,result.d,safeIncompleteText(result.raw,secondIncomplete)),result.r.status,result.r.headers);
    if(parseNeed(result.raw)?.length){
      const text='Die KI fordert nach der Bereitstellung erneut Notendaten an. Der Vorgang wurde beendet, um unnötige API-Kosten zu vermeiden.';
      return jsonResponse(replaceResponseText(provider,result.d,text),result.r.status,result.r.headers);
    }
  }

  const mem=extractMemory(result.raw);if(mem)saveMemory(mem);
  const action=parseAction(result.raw),prefix=visibleText(result.raw);
  if(action){
    const score=materializeAction(action,sources,prefix);
    if(score)return jsonResponse(replaceResponseText(provider,result.d,JSON.stringify(score)),result.r.status,result.r.headers);
    const warning=`${prefix}${prefix?'\n\n':''}Die MIDI-Aktion konnte technisch nicht ausgeführt werden. Es wurde keine Datei verändert.`;
    return jsonResponse(replaceResponseText(provider,result.d,warning),result.r.status,result.r.headers);
  }
  return jsonResponse(replaceResponseText(provider,result.d,prefix||result.raw),result.r.status,result.r.headers);
};

window.MCLSessionV132={version:VERSION,getMemory,workspaceSources,materializeAction};
})();
