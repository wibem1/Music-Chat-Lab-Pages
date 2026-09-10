(()=>{
'use strict';
if(window.__mclSessionOrchestratorV12)return;
window.__mclSessionOrchestratorV12=true;

const VERSION='1.2.0';
const MEMORY_KEY='music-chat-lab.session-memory.v2';
const ACTIVE_CHAT_KEY='music-chat-lab.active-chat.v1';
const RECENT_MESSAGES=8;
const MAX_MEMORY_CHARS=900;
const MAX_LEGACY_CONTEXT_CHARS=4200;
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
const MEMORY_RE=/<MCL_MEMORY>\s*([\s\S]*?)\s*<\/MCL_MEMORY>/i;

function providerFor(url){
  const u=String(url||'');
  if(u.includes('api.anthropic.com/v1/messages'))return'anthropic';
  if(u.includes('api.openai.com/v1/responses'))return'openai';
  if(u.includes('generativelanguage.googleapis.com/')&&u.includes(':generateContent'))return'google';
  return null;
}
function modelFrom(provider,url,body){
  if(provider==='anthropic'||provider==='openai')return String(body?.model||'');
  const m=String(url).match(/\/models\/([^/:]+):generateContent/);return m?decodeURIComponent(m[1]):'';
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
function previousAssistantText(msgs){let sawUser=false;for(let i=msgs.length-1;i>=0;i--){if(msgs[i].role==='user'){sawUser=true;continue}if(sawUser&&msgs[i].role==='assistant')return msgs[i].text}return''}

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
function explicitSlots(text,sources){
  const valid=new Set(sources.map(x=>Number(x.slot))),out=[];
  const add=n=>{n=Number(n);if(valid.has(n)&&!out.includes(n))out.push(n)};
  for(const m of String(text||'').matchAll(/(?:speicher(?:platz)?|platz|slot)\s*(?:nr\.?\s*)?([1-6])/gi))add(m[1]);
  for(const m of String(text||'').matchAll(/(?:speicher(?:platz)?|platz|slot)\s*(?:nr\.?\s*)?([1-6])\s*(?:,|und|&|\/|bis)\s*(?:speicher(?:platz)?\s*)?([1-6])/gi)){add(m[1]);add(m[2])}
  return out;
}
function shortAffirmative(text){return /^(ja|ja bitte|ja, bitte|gern|gerne|okay|ok|mach das|mache das|bitte|los|genau|einverstanden|sehr gern|sehr gerne)[.!?\s]*$/i.test(String(text||'').trim())}
function musicalOffer(text){
  const t=String(text||'').toLowerCase();
  return /(möchtest du|soll ich|kann ich|willst du|wenn du möchtest|wenn du willst)[\s\S]{0,900}(erstell|komponier|überarbeit|variier|arrangier|harmonisier|fortsetz|änd|verbesser)/.test(t);
}
function needsCurrentScore(user,prev){
  const u=String(user||'').toLowerCase();
  if(shortAffirmative(u)&&musicalOffer(prev))return true;
  const noteWork=/(beurteil|analysier|vergleich|überarbeit|ueberarbeit|änder|aender|veränder|verbesser|variier|fortsetz|erweiter|kürz|kuerz|harmonisier|instrumentier|arrangier|transponier|melodiestimme|violinstimme|begleitung|noten|partitur|score|midi)/.test(u);
  const refersCurrent=/(dies|das|diese|dieses|aktuell|jetzt|vorhanden|vorlage|fassung|version|melodie|stimme|stück|stueck|komposition|wie .*vorgeschlagen|weiter|überarbeit|ueberarbeit)/.test(u);
  return noteWork&&refersCurrent&&!/(^|\b)(komponiere|erstelle|schreibe)\s+(?:mir\s+)?(?:ein|eine|einen)\s+(?:neues?|freie?s?)\b/.test(u);
}
function selectScores(user,prev,sources,active){
  const wanted=explicitSlots(user,sources);
  const continuation=shortAffirmative(user)||/(wie\s+(?:von\s+dir\s+)?vorgeschlagen|wie\s+besprochen|jetzt\s+komponiert|so\s+wie\s+besprochen|daraus|damit)/i.test(String(user||''));
  if(continuation)for(const n of explicitSlots(prev,sources))if(!wanted.includes(n))wanted.push(n);
  if(needsCurrentScore(user,prev)&&active&&!wanted.includes(active))wanted.unshift(active);
  if(/vergleich|welche.*besser|gegenüber|gegenueber/i.test(user)&&wanted.length<2){
    const candidates=sources.filter(x=>Number(x.slot)!==Number(active)).slice(-1);
    if(active&&!wanted.includes(active))wanted.unshift(active);
    for(const x of candidates)if(!wanted.includes(x.slot))wanted.push(x.slot);
  }
  return wanted.slice(0,3).map(n=>sources.find(x=>Number(x.slot)===Number(n))).filter(Boolean);
}
function scoreBlocks(selected){
  return selected.map(x=>`<MCL_SCORE slot="${x.slot}" name=${JSON.stringify(x.name)}>\n${JSON.stringify(x.score)}\n</MCL_SCORE>`).join('\n\n');
}

function systemPrompt(memory,legacy,catalogueText,selected){
  const selectedLine=selected.length?`Für diesen Zug sind vollständige Notendaten der Speicher ${selected.map(x=>x.slot).join(', ')} beigefügt.`:'Für diesen Zug wurden keine vollständigen Notendaten beigefügt.';
  return `Du bist Music Chat Lab, ein zusammenhängender Musik-Chat mit direkter MIDI-Handlungsfähigkeit. Behandle die Nachrichten als fortlaufendes Gespräch. Frage nicht erneut nach Informationen, die aus dem Gespräch, dem Gedächtnis oder dem Arbeitstisch hervorgehen.\n\nWICHTIG: Es gibt keinen getrennten Chat-, Analyse- oder Kompositionsmodus. Du entscheidest aus dem normalen Gespräch heraus selbst, ob du erklärst, analysierst, etwas vorschlägst oder tatsächlich Musik erzeugst/veränderst. Wenn der Nutzer ein zuvor von dir angebotenes musikalisches Vorhaben bestätigt (z. B. „ja“, „ja bitte“, „mach das“), gilt es als Auftrag zur Ausführung.\n\nMUSIKALISCHER ARBEITSTISCH (nur Katalog):\n${catalogueText}\n${selectedLine}\n\nVOLLSTÄNDIGE NOTENDATEN: Wenn <MCL_SCORE> im aktuellen Nutzertext vorhanden ist, verwende diese Daten direkt. Fordere sie nicht noch einmal an. Nicht beigefügte Speicher sind nur als Katalog bekannt.\n\nMIDI-AKTIONEN: Antworte normal in natürlicher Sprache. Nur wenn der Nutzer jetzt tatsächlich eine MIDI-Fassung erzeugen oder verändern lassen will, hänge am Ende genau eine maschinenlesbare Aktion an. Bevorzuge PATCH, wenn vorhandenes Material weitgehend erhalten bleibt.\nPATCH-Schema:\n<MCL_ACTION>{"type":"patch","baseSlot":2,"title":"Neuer Titel","summary":"Kurze Beschreibung","meta":{"bpm":74,"ts":{"n":4,"d":4},"k":"C major"},"ops":[{"op":"replace_track","name":"Violin","track":{"nm":"Violin","ch":1,"pg":40,"nt":[[0,1,72,70,0,1]],"ct":[]}}]}</MCL_ACTION>\nZulässige PATCH-Operationen: add_track, insert_track, replace_track, delete_track, replace_range. Für bestehende Spuren nutze index (0-basiert) oder den eindeutigen exakten Namen. replace_range verwendet globale Beat-Positionen start/end und ersetzt dort nur Ereignisse der betreffenden Spur. Unveränderte Teile werden von der App lokal aus dem Basisscore übernommen und dürfen nicht erneut ausgegeben werden.\nFür vollständig neue Musik ohne Basisscore:\n<MCL_ACTION>{"type":"new_score","score":{"ti":"Titel","bpm":96,"ts":{"n":4,"d":4},"k":"C major","sm":"Kurze Beschreibung","tr":[{"nm":"Piano","ch":0,"pg":0,"nt":[...],"ct":[]}]}}</MCL_ACTION>\nWenn ein vorhandener Score als Ganzes neu geschrieben werden muss, ist auch type="replace_score" mit baseSlot und score erlaubt.\nNotenformat nt=[StartBeat,Dauer,Pitch,Velocity,Staff,Gate], Controller ct=[Beat,CC,Wert]. Gib niemals eine MIDI-Aktion aus, wenn du nur diskutierst oder einen Vorschlag machst.\n\nGEDÄCHTNIS: Hänge an jede Antwort ganz am Ende ein kurzes verborgenes Gedächtnis an, maximal ${MAX_MEMORY_CHARS} Zeichen. Bewahre darin nur dauerhaften Gesprächskontext: aktuelles Ziel, wichtige Entscheidungen, Bedeutung der vorhandenen Fassungen und offene Angebote. Keine vollständigen Notenlisten. Format exakt:\n<MCL_MEMORY>...</MCL_MEMORY>\n\nBISHERIGES KOMPAKTGEDÄCHTNIS:\n${memory||'(noch keines)'}${legacy?`\n\nÄLTERER DIALOGAUSZUG (nur zur Initialisierung des Gedächtnisses):\n${legacy}`:''}`;
}

function compressMessages(msgs,memory){
  const keep=(msgs.length<=RECENT_MESSAGES||!memory)?Math.max(RECENT_MESSAGES,12):RECENT_MESSAGES;
  let start=Math.max(0,msgs.length-keep);
  if(start>0&&msgs[start]?.role==='assistant')start--;
  const out=msgs.slice(start);
  while(out.length&&out[0].role==='assistant')out.shift();
  return out;
}
function withCurrentContext(msgs,user,selected){
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
  if(provider==='anthropic')return(d?.content||[]).filter(x=>x?.type==='text').map(x=>x.text||'').join('\n').trim();
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
function parseAction(text){
  const m=String(text||'').match(ACTION_RE);if(!m)return null;
  let s=m[1].trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(s)}catch{return{__invalid:true,raw:s}}
}
function extractMemory(text){const m=String(text||'').match(MEMORY_RE);return m?m[1].trim():''}
function visibleText(text){return String(text||'').replace(ACTION_RE,'').replace(MEMORY_RE,'').replace(/\n{3,}/g,'\n\n').trim()}

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
function materializeAction(action,sources,prefix){
  if(!action||action.__invalid)return null;
  const type=String(action.type||'').toLowerCase();let score=null;
  if(type==='patch')score=applyPatch(action,sources);
  else if(type==='new_score'&&isScore(action.score))score=clone(action.score);
  else if(type==='replace_score'&&isScore(action.score))score=clone(action.score);
  if(!isScore(score))return null;
  if(!String(score.ti||'').trim())score.ti=String(action.title||'Neue Komposition').trim()||'Neue Komposition';
  if(!String(score.sm||'').trim())score.sm=String(action.summary||prefix||'MIDI-Komposition wurde erzeugt.').replace(/\s+/g,' ').trim().slice(0,500);
  return score;
}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:input?.url||'',provider=providerFor(url);
  if(!provider||typeof init.body!=='string')return innerFetch(input,init);
  let body;try{body=JSON.parse(init.body)}catch{return innerFetch(input,init)}
  const model=modelFrom(provider,url,body),all=messages(provider,body),user=currentUserText(all),prev=previousAssistantText(all);
  if(!user)return innerFetch(input,init);

  const sources=workspaceSources(),active=activeSlot(),selected=selectScores(user,prev,sources,active),memory=getMemory(),legacy=memory?'':compactOld(all);
  const recent=compressMessages(all,memory),contextual=withCurrentContext(recent,user,selected),system=systemPrompt(memory,legacy,catalogue(sources,active),selected);
  const requestBody=buildProviderBody(provider,body,contextual,system);

  const r=await innerFetch(input,{...init,body:JSON.stringify(requestBody)});
  const d=await r.clone().json().catch(()=>null);if(!d||!r.ok)return r;
  const raw=responseText(provider,d);if(!raw)return r;
  const mem=extractMemory(raw);if(mem)saveMemory(mem);
  const action=parseAction(raw),prefix=visibleText(raw);
  if(action){
    const score=materializeAction(action,selected,prefix);
    if(score)return jsonResponse(replaceResponseText(provider,d,JSON.stringify(score)),r.status,r.headers);
    const warning=`${prefix}${prefix?'\n\n':''}Die MIDI-Aktion konnte technisch nicht ausgeführt werden. Bitte formuliere den musikalischen Auftrag noch einmal; es wurde keine Datei verändert.`;
    return jsonResponse(replaceResponseText(provider,d,warning),r.status,r.headers);
  }
  return jsonResponse(replaceResponseText(provider,d,prefix||raw),r.status,r.headers);
};

window.MCLSessionV12={version:VERSION,getMemory,workspaceSources,selectScores};
})();