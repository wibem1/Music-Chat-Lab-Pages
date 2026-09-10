(()=>{
'use strict';
if(window.__mclV125Fixes)return;
window.__mclV125Fixes=true;

const VERSION='1.1.25';
const STORE_STD='music-chat-lab.pending-compositions.v1';
const STORE_OAI='music-chat-lab.pending-openai-compositions.v1';
const DIAG='music-chat-lab.last-diagnostic.v1';
const innerFetch=window.fetch.bind(window);
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));

function providerFor(url){
  url=String(url||'');
  if(url.includes('api.openai.com/v1/responses'))return'openai';
  if(url.includes('api.anthropic.com/v1/messages'))return'anthropic';
  if(url.includes('generativelanguage.googleapis.com/')&&url.includes(':generateContent'))return'google';
  return null;
}
function modelFrom(provider,url,body){
  if(provider==='anthropic'||provider==='openai')return String(body?.model||'');
  const m=String(url).match(/\/models\/([^/:]+):generateContent/);
  return m?decodeURIComponent(m[1]):'';
}
function textOfMessage(m){
  if(typeof m?.content==='string')return m.content;
  if(Array.isArray(m?.content))return m.content.map(x=>x?.text||x?.input_text||x?.output_text||'').join('');
  if(Array.isArray(m?.parts))return m.parts.map(x=>x?.text||'').join('');
  return'';
}
function normalizedMessages(provider,body){
  if(provider==='anthropic')return(Array.isArray(body?.messages)?body.messages:[]).map(m=>({role:m.role,content:textOfMessage(m)}));
  if(provider==='openai')return(Array.isArray(body?.input)?body.input:[]).map(m=>({role:m.role,content:textOfMessage(m)}));
  return(Array.isArray(body?.contents)?body.contents:[]).map(m=>({role:m.role==='model'?'assistant':'user',content:textOfMessage(m)}));
}
function latestUserText(provider,body){
  const msgs=normalizedMessages(provider,body);
  for(let i=msgs.length-1;i>=0;i--)if(msgs[i].role==='user')return String(msgs[i].content||'').trim();
  return'';
}
function isConfirmation(s){
  const t=String(s||'').trim().toLowerCase().replace(/[.!?]+$/,'').trim();
  return /^(ja|j|ja bitte|ok|okay|mach das|mache das|bitte|los|ausführen|ausfuehren|genau|einverstanden|so machen)$/.test(t);
}
function responseText(provider,d){
  if(provider==='anthropic')return(d?.content||[]).filter(x=>x?.type==='text').map(x=>x.text||'').join('').trim();
  if(provider==='openai'){
    if(typeof d?.output_text==='string')return d.output_text.trim();
    return(d?.output||[]).flatMap(x=>x?.content||[]).map(x=>x?.text||'').join('\n').trim();
  }
  return(d?.candidates?.[0]?.content?.parts||[]).map(p=>p?.text||'').join('').trim();
}
function synthetic(provider,text,model){
  if(provider==='anthropic')return new Response(JSON.stringify({id:'mcl-v125',type:'message',role:'assistant',model,content:[{type:'text',text}],stop_reason:'end_turn'}),{status:200,headers:{'content-type':'application/json'}});
  if(provider==='openai')return new Response(JSON.stringify({id:'mcl-v125',object:'response',model,output_text:text,output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]}),{status:200,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text}]},finishReason:'STOP'}]}),{status:200,headers:{'content-type':'application/json'}});
}
function errorResponse(provider,message,model){
  if(provider==='google')return new Response(JSON.stringify({error:{message}}),{status:502,headers:{'content-type':'application/json'}});
  return synthetic(provider,message,model);
}
function loadStore(key){try{return JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{return{}}}
function saveStore(key,x){try{localStorage.setItem(key,JSON.stringify(x))}catch(_){}}
function pendingKey(provider){return provider==='openai'?STORE_OAI:STORE_STD}
function markerId(text){const m=String(text||'').match(/\[MCL-(?:OPENAI-)?VORSCHLAG:([a-z0-9]+)\]/i);return m?m[1]:null}
function findPending(provider,body){
  const key=pendingKey(provider),store=loadStore(key),msgs=normalizedMessages(provider,body);
  for(let i=msgs.length-1;i>=0;i--){
    if(msgs[i].role!=='assistant')continue;
    const pid=markerId(msgs[i].content);if(pid&&store[pid])return{key,store,pid,p:store[pid]};
  }
  const recent=Object.entries(store).filter(([,p])=>Date.now()-Number(p?.createdAt||0)<30*60*1000).sort((a,b)=>Number(b[1]?.createdAt||0)-Number(a[1]?.createdAt||0));
  return recent.length===1?{key,store,pid:recent[0][0],p:recent[0][1]}:null;
}
function findPendingById(provider,pid){
  const key=pendingKey(provider),store=loadStore(key);return pid&&store[pid]?{key,store,pid,p:store[pid]}:null;
}
function sourceSummary(p){
  const infos=Array.isArray(p?.sourceInfo)?p.sourceInfo:[];
  if(!infos.length)return'Keine ausgewählte musikalische Quelle.';
  return infos.map((x,i)=>`${i+1}. ${x?.slot?`Speicherplatz ${x.slot}: `:''}${x?.name||'Quelle'} (${x?.notes??'?'} Noten, ${x?.beats??'?'} Beats)`).join('\n');
}
function cleanTask(s){return String(s||'').replace(/\n\[MCL-AKTUELLER-GEGENSTAND-V124\][\s\S]*$/,'').trim()}
function diag(stage,data){
  try{localStorage.setItem(DIAG,JSON.stringify({version:VERSION,timestamp:new Date().toISOString(),stage,...data},null,2))}catch(_){ }
}

function xhrJson(url,headers,body,provider,timeoutMs){
  return new Promise((resolve,reject)=>{
    const x=new XMLHttpRequest();x.open('POST',url,true);x.timeout=timeoutMs;
    try{const h=new Headers(headers||{});h.forEach((v,k)=>x.setRequestHeader(k,v))}catch(_){if(headers)Object.entries(headers).forEach(([k,v])=>x.setRequestHeader(k,v))}
    x.onload=()=>{let d={};try{d=JSON.parse(x.responseText||'{}')}catch{};if(x.status>=200&&x.status<300)resolve(d);else reject(new Error(d?.error?.message||`API-Fehler ${x.status}`))};
    x.onerror=()=>reject(new Error(provider==='google'?'Netzwerkzugriff zur Google-API fehlgeschlagen. Bitte Verbindung/VPN prüfen und erneut versuchen.':'Failed to fetch'));
    x.ontimeout=()=>reject(new Error('Die Anfrage hat zu lange gedauert und wurde beendet.'));
    x.send(JSON.stringify(body));
  });
}
async function direct(provider,url,headers,model,prompt,{maxTokens=12000,timeoutMs=300000}={}){
  if(provider==='anthropic'){
    const d=await xhrJson(url,headers,{model,max_tokens:maxTokens,output_config:{effort:'medium'},system:'Du bist ein Kompositions- und Produktionsassistent für MIDI. Folge dem bestätigten technischen Änderungsvertrag exakt.',messages:[{role:'user',content:prompt}]},provider,timeoutMs);
    return responseText(provider,d);
  }
  if(provider==='openai'){
    const d=await xhrJson(url,headers,{model,input:[{role:'system',content:'Du bist ein Kompositions- und Produktionsassistent für MIDI. Folge dem bestätigten technischen Änderungsvertrag exakt.'},{role:'user',content:prompt}],store:false,max_output_tokens:maxTokens},provider,timeoutMs);
    return responseText(provider,d);
  }
  const d=await xhrJson(url,headers,{systemInstruction:{parts:[{text:'Du bist ein Kompositions- und Produktionsassistent für MIDI. Folge dem bestätigten technischen Änderungsvertrag exakt.'}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:maxTokens}},provider,timeoutMs);
  return responseText(provider,d);
}
function parseObject(text){
  let s=String(text||'').trim();const f=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);if(f)s=f[1].trim();
  const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;
  try{return JSON.parse(s.slice(a,b+1))}catch{return null}
}
function materialize(text,sources){return window.MCLCompositionEdit?.materialize?.(text,sources||[])||null}
function pendingSources(p){
  if(Array.isArray(p?.sources)&&p.sources.length)return p.sources.map(clone);
  try{
    const ws=window.MCLMidiWorkspaceSources?.()||[],infos=Array.isArray(p?.sourceInfo)?p.sourceInfo:[];
    return infos.map(info=>ws.find(s=>(info?.slot&&Number(s?.slot)===Number(info.slot))||s?.name===info?.name)).filter(Boolean).map(clone);
  }catch{return[]}
}

async function createContract(provider,url,headers,model,p){
  const prompt=`TECHNISCHE ÄNDERUNGSENTSCHEIDUNG\n\nDu hast zu einem freien musikalischen Auftrag bereits die unten stehende Kompositionsidee formuliert. Lege nun nur den technischen Ergebnismodus fest. Das ist keine neue musikalische Entscheidung.\n\nErlaubt sind:\nPATCH = mindestens ein Teil einer ausgewählten vorhandenen Quelle soll im Ergebnis exakt unverändert erhalten bleiben; nur Änderungen/Ergänzungen werden ausgegeben.\nREPLACE_SCORE = vorhandene Quelle(n) werden als Ausgangsmaterial benutzt, aber das Ergebnis ersetzt den Ausgangsscore als Ganzes; nichts muss technisch unverändert übernommen werden.\nNEW_SCORE = es wird ohne ausgewählte musikalische Quelle vollständig neue Musik erzeugt.\n\nBei PATCH wähle zusätzlich die Quelle, die als unveränderter Basisscore dient. Nummerierung gemäß Quellenliste.\n\nAntworte ausschließlich als JSON in genau einer dieser Formen:\n{"mode":"PATCH","base":1}\n{"mode":"REPLACE_SCORE","base":1}\n{"mode":"NEW_SCORE","base":null}\n\nAUFTRAG:\n${cleanTask(p?.task||'')}\n\nDEINE KOMPONITIONSIDEE:\n${p?.concept||''}\n\nAUSGEWÄHLTE QUELLEN:\n${sourceSummary(p)}`;
  const raw=await direct(provider,url,headers,model,prompt,{maxTokens:250,timeoutMs:90000});
  const x=parseObject(raw),mode=String(x?.mode||'').toUpperCase();
  if(!['PATCH','REPLACE_SCORE','NEW_SCORE'].includes(mode))throw new Error('Technischer Änderungsvertrag konnte nicht bestimmt werden.');
  let base=x?.base==null?null:Math.trunc(Number(x.base));
  const n=Array.isArray(p?.sourceInfo)?p.sourceInfo.length:0;
  if(mode==='NEW_SCORE')base=null;
  else if(!(base>=1&&base<=Math.max(1,n)))base=n?1:null;
  return{mode,base,model,createdAt:Date.now()};
}
async function ensureContract(provider,url,headers,model,rec){
  if(rec?.p?.editContract&&['PATCH','REPLACE_SCORE','NEW_SCORE'].includes(String(rec.p.editContract.mode||'').toUpperCase()))return rec.p.editContract;
  const c=await createContract(provider,url,headers,model,rec.p);
  rec.p.editContract=c;rec.store[rec.pid]=rec.p;saveStore(rec.key,rec.store);
  diag('v125-contract-created',{provider,model,pendingId:rec.pid,task:cleanTask(rec.p?.task||''),concept:rec.p?.concept||'',sources:rec.p?.sourceInfo||[],editContract:c});
  return c;
}

function patchPrompt(p,c){
  const base=Math.max(1,Math.trunc(Number(c?.base)||1));
  return `VERBINDLICHER TECHNISCHER VERTRAG: PATCH\nDer technische Modus wurde aus deinem eigenen Verständnis des Auftrags bestimmt und vom Nutzer zusammen mit der Kompositionsidee bestätigt. Interpretiere den Modus jetzt NICHT neu.\n\n- Gib ausschließlich ein PATCH-JSON aus.\n- Verwende base=${base}.\n- Gib nur musikalische Änderungen oder Ergänzungen aus.\n- Unveränderte Tracks, unveränderte Bereiche und deren Noten dürfen NICHT erneut ausgegeben werden.\n- Die App setzt den Patch danach deterministisch mit dem Basisscore zum vollständigen Stück zusammen.\n- Triff keine zusätzlichen musikalischen Einschränkungen.\n\nPATCH-FORMAT:\n{"mode":"patch","base":${base},"ti":"Titel","sm":"Kurze Zusammenfassung","meta":{},"ops":[{"op":"add_track","track":{"nm":"Neue Spur","ch":1,"pg":40,"nt":[...],"ct":[...]}}]}\nWeitere zulässige Operationen: insert_track, replace_track, delete_track, replace_range. Bei replace_track/delete_track/replace_range darf index (ab 0) oder ein eindeutiger exakter Trackname verwendet werden. Bei replace_range sind start/end globale Beat-Positionen. Nicht genannte Teile bleiben unverändert.\n\nNOTATION:\nnt = [StartBeat,Dauer,Pitch,Velocity,Staff,Gate], ct = [Beat,CC,Wert].\n\nAUFTRAG UND MUSIKMATERIAL:\n${p.assignment}\n\nBESTÄTIGTE KOMPONITIONSIDEE:\n${p.concept}\n\nAntworte ausschließlich mit genau einem validen JSON-Objekt, ohne Markdown oder Kommentar.`;
}
function fullPrompt(p,c){
  const kind=c?.mode==='NEW_SCORE'?'NEW_SCORE':'REPLACE_SCORE';
  return `VERBINDLICHER TECHNISCHER VERTRAG: ${kind}\nDer technische Modus wurde aus deinem eigenen Verständnis des Auftrags bestimmt und vom Nutzer zusammen mit der Kompositionsidee bestätigt. Interpretiere den Modus jetzt NICHT neu.\n\nGib eine vollständige Partitur aus. Format: {"ti":"Titel","bpm":96,"ts":{"n":4,"d":4},"k":"C major","sm":"...","tr":[...]}. Track: nm,ch,pg,nt,optional ct. nt=[StartBeat,Dauer,Pitch,Velocity,Staff,Gate], ct=[Beat,CC,Wert].\n\nAUFTRAG UND MUSIKMATERIAL:\n${p.assignment}\n\nBESTÄTIGTE KOMPONITIONSIDEE:\n${p.concept}\n\nAntworte ausschließlich mit genau einem validen JSON-Objekt, ohne Markdown oder Kommentar.`;
}
function validateMode(raw,c){
  const x=parseObject(raw);if(!x)return false;
  const mode=String(c?.mode||'').toUpperCase();
  if(mode==='PATCH')return String(x?.mode||'').toLowerCase()==='patch';
  return Array.isArray(x?.tr)&&x.tr.some(t=>Array.isArray(t?.nt));
}
async function runConfirmed(provider,url,headers,model,rec){
  const c=await ensureContract(provider,url,headers,model,rec),sources=pendingSources(rec.p),isPatch=c.mode==='PATCH';
  const prompt=isPatch?patchPrompt(rec.p,c):fullPrompt(rec.p,c);
  diag('v125-final-composition-call',{provider,model,pendingId:rec.pid,task:cleanTask(rec.p?.task||''),sources:rec.p?.sourceInfo||[],editContract:c,editSourceCount:sources.length});
  let raw=await direct(provider,url,headers,model,prompt,{maxTokens:isPatch?12000:32000,timeoutMs:isPatch?300000:360000});
  if(!validateMode(raw,c)){
    diag('v125-final-composition-retry',{provider,model,pendingId:rec.pid,editContract:c,reason:'response violated confirmed result mode'});
    const retry=`${prompt}\n\nKORREKTUR: Deine vorige Antwort hat den bestätigten technischen Modus ${c.mode} verletzt oder war kein valides JSON. Gib jetzt exakt den bestätigten Modus aus. ${isPatch?'Keine vollständige Partitur und keine unveränderten Ausgangsspuren ausgeben.':'Eine vollständige Partitur ausgeben.'}`;
    raw=await direct(provider,url,headers,model,retry,{maxTokens:isPatch?12000:32000,timeoutMs:isPatch?300000:360000});
  }
  if(!validateMode(raw,c))throw new Error(`Die KI hat den bestätigten technischen Modus ${c.mode} nicht eingehalten.`);
  let score;
  if(isPatch)score=materialize(raw,sources);
  else score=parseObject(raw);
  if(!score||!Array.isArray(score.tr))throw new Error('Die KI hat kein gültiges Kompositionsergebnis geliefert.');
  delete rec.store[rec.pid];saveStore(rec.key,rec.store);
  diag('v125-final-composition-valid',{provider,model,pendingId:rec.pid,task:cleanTask(rec.p?.task||''),editContract:c,resultMode:c.mode,tracks:score.tr.length,outputCharacters:String(raw).length});
  return synthetic(provider,JSON.stringify(score),model);
}

async function maybeAttachContract(provider,url,headers,model,response){
  try{
    const d=await response.clone().json(),txt=responseText(provider,d),pid=markerId(txt);if(!pid)return response;
    const rec=findPendingById(provider,pid);if(!rec)return response;
    await ensureContract(provider,url,headers,model,rec);
  }catch(e){
    diag('v125-contract-error',{provider,model,error:e?.message||String(e)});
  }
  return response;
}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:input?.url||'',provider=providerFor(url);
  if(!provider||typeof init.body!=='string')return innerFetch(input,init);
  let body={};try{body=JSON.parse(init.body)}catch{return innerFetch(input,init)}
  const model=modelFrom(provider,url,body),user=latestUserText(provider,body),rec=findPending(provider,body);
  if(rec&&isConfirmation(cleanTask(user))){
    try{return await runConfirmed(provider,url,init.headers,model,rec)}
    catch(e){
      rec.store[rec.pid]=rec.p;saveStore(rec.key,rec.store);
      const msg=e?.message||String(e);diag('v125-final-composition-error',{provider,model,pendingId:rec.pid,task:cleanTask(rec.p?.task||''),editContract:rec.p?.editContract||null,error:msg});
      return errorResponse(provider,`${msg}\n\nDer Kompositionsauftrag bleibt erhalten. Du kannst mit „Ja“ erneut versuchen oder die Kompositionsidee ändern.`,model);
    }
  }
  const r=await innerFetch(input,init);
  if(!r.ok)return r;
  return maybeAttachContract(provider,url,init.headers,model,r);
};

document.querySelectorAll('[data-app-version]').forEach(el=>el.textContent='v'+VERSION);
})();
