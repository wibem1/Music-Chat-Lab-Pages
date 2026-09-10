(()=>{
'use strict';
if(window.__mclCompositionControllerV120)return;
window.__mclCompositionControllerV120=true;

const VERSION='1.2.0';
const STORE='music-chat-lab.composition-session.v2';
const DIAG='music-chat-lab.last-diagnostic.v1';
const nativeFetch=window.fetch.bind(window);
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const sourceRe=/\[MCL-ENGINE14-SCORE name=("(?:[^"\\]|\\.)*")\]\n([\s\S]*?)\n\[\/MCL-ENGINE14-SCORE\]/g;
const workspaceRe=/\n*--- MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---[\s\S]*?--- ENDE MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---\n*/g;
const SYSTEM='Du bist ein Kompositions- und Produktionsassistent für symbolische Musik. Entscheide musikalisch selbständig aus dem freien Auftrag des Nutzers. Die App macht keine stilistischen oder musikalischen Sonderregeln. Wenn vorhandenes Material nur teilweise verändert wird, müssen nicht genannte Teile exakt erhalten bleiben.';
const TECHNICAL=`NOTATION UND AUSGABE:\n- Vollständige Partitur: valides JSON mit ti, bpm, ts, k, sm und tr.\n- Track: nm, ch, pg, nt, optional ct.\n- nt: [StartBeat, Dauer, Pitch, Velocity, Staff, Gate].\n- ct: [Beat, CC, Wert].`;

let activeControllers=new Set();
function loadState(){try{return JSON.parse(localStorage.getItem(STORE))||{pending:{}}}catch{return{pending:{}}}}
function saveState(s){localStorage.setItem(STORE,JSON.stringify(s))}
function diagnostic(stage,data){try{localStorage.setItem(DIAG,JSON.stringify({version:VERSION,timestamp:new Date().toISOString(),stage,...data},null,2))}catch{}}
function id(){return Math.random().toString(36).slice(2,9)}
function hash(v){let h=2166136261,s=JSON.stringify(v);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16)}
function textOf(m){
  if(typeof m?.content==='string')return m.content;
  if(Array.isArray(m?.content))return m.content.map(x=>x?.text||x?.input_text||x?.output_text||'').join('');
  if(Array.isArray(m?.parts))return m.parts.map(x=>x?.text||'').join('');
  return'';
}
function extract(text){
  const sources=[];let m;sourceRe.lastIndex=0;
  while((m=sourceRe.exec(String(text||'')))){try{sources.push({name:JSON.parse(m[1]),score:JSON.parse(m[2])})}catch{}}
  sourceRe.lastIndex=0;
  const task=String(text||'').replace(sourceRe,'').replace(workspaceRe,'\n').replace(/\n\n--- DATEIANHÄNGE ---\n?/g,'\n').trim();
  return{task,sources};
}
function workspaceSources(){try{return(window.MCLMidiWorkspaceSources?.()||[]).filter(x=>x?.score).map(x=>({slot:Number(x.slot)||null,name:x.name||x.score?.ti||'Stück',score:clone(x.score)}))}catch{return[]}}
function sameSource(a,b){try{return JSON.stringify(a?.score)===JSON.stringify(b?.score)}catch{return false}}
function mergeSources(...groups){const out=[];for(const g of groups)for(const s of(g||[]))if(s?.score&&!out.some(x=>sameSource(x,s)))out.push(s);return out}
function sourceInfo(s){
  const tr=Array.isArray(s?.score?.tr)?s.score.tr:[],ts=s?.score?.ts||{};let notes=0,end=0;
  tr.forEach(t=>(t.nt||[]).forEach(n=>{if(Array.isArray(n)){notes++;end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0))}}));
  const meter=Number(ts.n)>0&&Number(ts.d)>0?`${ts.n}/${ts.d}`:null;
  const beatsPerBar=meter?Number(ts.n)*(4/Number(ts.d)):null;
  return{slot:s.slot??null,name:s.name,notes,beats:Number(end.toFixed(2)),bars:beatsPerBar?Number((end/beatsPerBar).toFixed(2)):null,bpm:s?.score?.bpm??null,meter,key:s?.score?.k??null,revision:hash(s.score)};
}
function catalogue(sources){return sources.map((s,i)=>{const x=sourceInfo(s);return`${i+1}: ${x.slot?`Speicherplatz ${x.slot} · `:''}${x.name} | ${x.bars??'?'} Takte | ${x.beats} Beats | ${x.bpm??'?'} BPM | ${x.meter??'?'} | Tonart ${x.key??'frei'} | ${x.notes} Noten`}).join('\n')}
function scoreBlocks(sources){return sources.map((s,i)=>`VORHANDENES MATERIAL ${i+1} (${s.name}):\n${JSON.stringify(s.score)}`).join('\n\n')}
function parseObject(text){let s=String(text||'').trim();const f=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);if(f)s=f[1].trim();const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;try{return JSON.parse(s.slice(a,b+1))}catch{return null}}
function materialize(text,sources){return window.MCLCompositionEdit?.materialize?.(text,sources)||null}
function obviousIntent(task){const s=String(task||'').trim().toLowerCase().replace(/[.!?]+$/,'').trim();if(/^(ja|ja bitte|mach das|mache das|genau|einverstanden|okay|ok|los|bitte|so machen|ausführen|ausfuehren|führe das aus)$/.test(s))return'CONFIRM';if(/^(nein|ablehnen|verwerfen|abbrechen|nicht machen|lass es|lasse es)$/.test(s))return'REJECT';return null}

function providerOf(url){if(url.includes('api.anthropic.com/v1/messages'))return'anthropic';if(url.includes('api.openai.com/v1/responses'))return'openai';if(url.includes('generativelanguage.googleapis.com/')&&url.includes(':generateContent'))return'google';return null}
function modelOf(provider,body,url){if(provider==='anthropic'||provider==='openai')return body.model||'';const m=String(url).match(/\/models\/([^/:]+):generateContent/);return m?decodeURIComponent(m[1]):''}
function normalize(provider,body){
  if(provider==='anthropic')return(Array.isArray(body.messages)?body.messages:[]).map(m=>({role:m.role==='assistant'?'assistant':'user',content:textOf(m)}));
  if(provider==='openai')return(Array.isArray(body.input)?body.input:[]).map(m=>({role:m.role==='assistant'?'assistant':'user',content:textOf(m)}));
  return(Array.isArray(body.contents)?body.contents:[]).map(m=>({role:m.role==='model'?'assistant':'user',content:textOf(m)}));
}
function response(provider,text,model){
  if(provider==='anthropic')return new Response(JSON.stringify({id:'mcl-v120',type:'message',role:'assistant',model,content:[{type:'text',text}],stop_reason:'end_turn'}),{status:200,headers:{'content-type':'application/json'}});
  if(provider==='openai')return new Response(JSON.stringify({id:'mcl-v120',object:'response',model,output_text:text,output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]}),{status:200,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text}]},finishReason:'STOP'}]}),{status:200,headers:{'content-type':'application/json'}});
}
function outputText(provider,d){if(provider==='anthropic')return(d.content||[]).filter(x=>x.type==='text').map(x=>x.text||'').join('').trim();if(provider==='openai'){if(typeof d?.output_text==='string')return d.output_text;return(d?.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('\n').trim()}return(d.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('\n').trim()}
async function transport(input,init){const controller=new AbortController();activeControllers.add(controller);let relay;const originalSignal=init?.signal;if(originalSignal){if(originalSignal.aborted)controller.abort();else{relay=()=>controller.abort();originalSignal.addEventListener('abort',relay,{once:true})}}try{return await nativeFetch(input,{...init,signal:controller.signal})}finally{activeControllers.delete(controller);if(originalSignal&&relay)originalSignal.removeEventListener('abort',relay)}}
function abortAll(reason){for(const c of[...activeControllers])try{c.abort()}catch{};const n=document.getElementById('composerNote');if(n&&reason)n.textContent=reason}
window.MCLAbortRunningRequest=abortAll;

async function direct(provider,url,headers,model,prompt){
  let body;
  if(provider==='anthropic')body={model,max_tokens:8192,system:SYSTEM,messages:[{role:'user',content:prompt}]};
  else if(provider==='openai')body={model,input:[{role:'system',content:SYSTEM},{role:'user',content:prompt}],store:false};
  else body={systemInstruction:{parts:[{text:SYSTEM}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:8192}};
  const r=await transport(url,{method:'POST',headers,body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`API-Fehler ${r.status}`);const t=outputText(provider,d);if(!t)throw new Error('Die KI hat keine verwertbare Antwort geliefert.');return t;
}
async function classify(provider,url,headers,model,msgs,hasPending){
  const latest=[...msgs].reverse().find(m=>m.role==='user'),prior=[...msgs].reverse().find(m=>m.role==='assistant');
  const task=extract(latest?.content||'').task,priorText=String(prior?.content||'').replace(/\[MCL-VORSCHLAG:[a-z0-9]+\]/ig,'').slice(-1200);
  const choices=hasPending?'CONFIRM | REJECT | REVISE | COMPOSE | ANALYZE | DISCUSS':'COMPOSE | ANALYZE | DISCUSS';
  const prompt=`Ordne die aktuelle Nutzereingabe nach ihrer Bedeutung ein. Antworte nur mit einem dieser Wörter: ${choices}.\nCOMPOSE = neue Musik erzeugen oder vorhandene Musik verändern.\nANALYZE = konkrete Musik untersuchen, beurteilen oder vergleichen.\nDISCUSS = allgemeines Gespräch, Erklärung oder Rückfrage.\nCONFIRM = offenen Kompositionsvorschlag ausführen.\nREJECT = offenen Vorschlag verwerfen.\nREVISE = offenen Vorschlag ändern.\nBei Mehrdeutigkeit DISCUSS.\n\nVorherige KI-Antwort:\n${priorText}\n\nAktuelle Eingabe:\n${task}`;
  const raw=(await direct(provider,url,headers,model,prompt)).trim().toUpperCase();return choices.split(' | ').includes(raw)?raw:'DISCUSS';
}
function findPendingId(msgs,pending){for(let i=msgs.length-1;i>=0;i--){if(msgs[i].role!=='assistant')continue;const m=String(msgs[i].content||'').match(/\[MCL-VORSCHLAG:([a-z0-9]+)\]/i);if(m&&pending[m[1]])return m[1]}const recent=Object.entries(pending).filter(([,p])=>Date.now()-Number(p?.createdAt||0)<60*60*1000).sort((a,b)=>Number(b[1]?.createdAt||0)-Number(a[1]?.createdAt||0));return recent.length===1?recent[0][0]:null}
function visibleProposal(pid,c){return`Kompositionsvorschlag:\n\nAuftrag verstanden: ${c.understanding}\n\n${c.concept}\n\nWenn du damit einverstanden bist, antworte einfach mit „Ja“ oder „Mach das“. Änderungswünsche kannst du direkt schreiben.\n\n[MCL-VORSCHLAG:${pid}]`}
function normalizeContract(x,sourceCount){if(!x||typeof x!=='object')return null;const mode=String(x.mode||'').toUpperCase();if(!['NEW','PATCH','REPLACE'].includes(mode))return null;const sourceNumbers=[...new Set((Array.isArray(x.sourceNumbers)?x.sourceNumbers:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=sourceCount))];if(mode!=='NEW'&&!sourceNumbers.length)return null;const understanding=String(x.understanding||'').trim(),concept=String(x.concept||'').trim();if(!understanding||!concept)return null;return{mode,understanding,concept,sourceNumbers,preserve:String(x.preserve||'').trim()}}
async function makeContract(provider,url,headers,model,task,sources,previous=null,change=''){
  const cat=sources.length?catalogue(sources):'(kein vorhandenes Material)';
  const prompt=previous?`Überarbeite den bestehenden Kompositionsvertrag anhand des Änderungswunsches. Antworte ausschließlich mit JSON.\n\nBISHERIGER VERTRAG:\n${JSON.stringify(previous)}\n\nÄNDERUNGSWUNSCH:\n${change}\n\nQUELLENKATALOG:\n${cat}\n\nJSON-SCHEMA:\n{"mode":"NEW|PATCH|REPLACE","understanding":"kurze Wiedergabe des Auftrags","concept":"höchstens drei kurze Sätze musikalische Idee","sourceNumbers":[1],"preserve":"was unverändert bleiben muss, sonst leer"}`:`Erzeuge einen knappen Kompositionsvertrag aus dem freien Nutzerauftrag. Entscheide selbst, ob neue Musik entsteht (NEW), vorhandenes Material teilweise verändert/ergänzt wird (PATCH) oder vollständig ersetzt/grundlegend neu gestaltet wird (REPLACE). PATCH bedeutet: nicht genannte Teile des Ausgangsmaterials bleiben exakt unverändert. Wähle nur tatsächlich benötigte Quellen. Keine musikalischen Zusatzregeln erfinden. Antworte ausschließlich mit JSON.\n\nAUFTRAG:\n${task}\n\nQUELLENKATALOG:\n${cat}\n\nJSON-SCHEMA:\n{"mode":"NEW|PATCH|REPLACE","understanding":"kurze Wiedergabe des Auftrags","concept":"höchstens drei kurze Sätze musikalische Idee","sourceNumbers":[1],"preserve":"was unverändert bleiben muss, sonst leer"}`;
  const raw=await direct(provider,url,headers,model,prompt),c=normalizeContract(parseObject(raw),sources.length);if(!c)throw new Error('Die KI hat keinen gültigen Kompositionsvertrag geliefert.');return c;
}
async function selectForAnalysis(provider,url,headers,model,task,sources){if(!sources.length)return[];if(sources.length===1)return[sources[0]];const raw=await direct(provider,url,headers,model,`Wähle für die Analyse nur die benötigten Quellen. Antworte nur mit Katalognummern, kommasepariert, oder NONE.\n\nKATALOG:\n${catalogue(sources)}\n\nAUFTRAG:\n${task}`);if(/^NONE$/i.test(raw.trim()))return[];const nums=[...new Set((raw.match(/\d+/g)||[]).map(Number).filter(n=>n>=1&&n<=sources.length))];return nums.map(n=>sources[n-1])}
function appendSources(provider,body,sources){if(!sources.length)return body;const extra=`\n\n--- AUSGEWÄHLTES MUSIKMATERIAL ---\n${sources.map(s=>`[MCL-ENGINE14-SCORE name=${JSON.stringify(s.name)}]\n${JSON.stringify(s.score)}\n[/MCL-ENGINE14-SCORE]`).join('\n\n')}\n--- ENDE AUSGEWÄHLTES MUSIKMATERIAL ---`;const b=clone(body);if(provider==='anthropic'){for(let i=b.messages.length-1;i>=0;i--)if(b.messages[i].role==='user'&&typeof b.messages[i].content==='string'){sourceRe.lastIndex=0;b.messages[i].content=b.messages[i].content.replace(sourceRe,'').trim()+extra;break}}else if(provider==='openai'){for(let i=b.input.length-1;i>=0;i--)if(b.input[i].role!=='assistant'){const txt=textOf(b.input[i]);sourceRe.lastIndex=0;b.input[i].content=txt.replace(sourceRe,'').trim()+extra;break}}else{for(let i=b.contents.length-1;i>=0;i--)if(b.contents[i].role!=='model'){const txt=textOf(b.contents[i]);sourceRe.lastIndex=0;b.contents[i].parts=[{text:txt.replace(sourceRe,'').trim()+extra}];break}}return b}
async function executeContract(provider,url,headers,model,p){
  const c=p.contract,sources=p.sources||[];
  const protocol=c.mode==='PATCH'?(window.MCLCompositionEdit?.protocol||''):'Antworte ausschließlich mit einer vollständigen validen JSON-Partitur.';
  const modeRule=c.mode==='PATCH'?'Du MUSST PATCH-JSON verwenden. Gib unveränderte Teile nicht erneut aus.':c.mode==='REPLACE'?'Gib eine vollständige neue Partitur aus. Das vorhandene Material dient als Ausgangspunkt, aber es wird als Ganzes ersetzt.':'Gib eine vollständige neue Partitur aus.';
  const prompt=`AUSFÜHRUNG EINES BEREITS BESTÄTIGTEN KOMPONITIONSVERTRAGS. Interpretiere den Auftrag nicht neu und ändere den Umfang nicht.\n\nVERTRAG:\n${JSON.stringify(c)}\n\n${TECHNICAL}\n\n${modeRule}\n\n${protocol}\n\n${sources.length?scoreBlocks(sources):''}`;
  const raw=await direct(provider,url,headers,model,prompt),score=materialize(raw,sources);if(!score)throw new Error('Die KI hat kein gültiges Kompositionsergebnis geliefert. Der bestätigte Auftrag bleibt erhalten.');return{raw,score};
}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:input?.url||'',provider=providerOf(url);
  if(!provider||typeof init.body!=='string')return transport(input,init);
  try{
    const body=JSON.parse(init.body),model=modelOf(provider,body,url),msgs=normalize(provider,body),last=[...msgs].reverse().find(m=>m.role==='user');if(!last)return transport(input,init);
    const state=loadState();state.pending=state.pending||{};const pendingId=findPendingId(msgs,state.pending),pending=pendingId?state.pending[pendingId]:null;const task=extract(last.content).task;const shortcut=pending?obviousIntent(task):null;const intent=shortcut||await classify(provider,url,init.headers,model,msgs,!!pending);
    diagnostic('intent',{provider,model,intent,pendingId,userText:task});

    if(pending){
      if(intent==='REJECT'){delete state.pending[pendingId];saveState(state);return response(provider,'Kompositionsvorschlag verworfen. Es wurde keine Komposition erzeugt.',model)}
      if(intent==='REVISE'){const all=mergeSources(pending.sources||[],workspaceSources());const contract=await makeContract(provider,url,init.headers,model,pending.originalTask,all,pending.contract,task);const selected=contract.sourceNumbers.map(n=>all[n-1]).filter(Boolean).map(clone);pending.contract=contract;pending.sources=selected;pending.sourceRevisions=selected.map(s=>sourceInfo(s).revision);pending.createdAt=Date.now();state.pending[pendingId]=pending;saveState(state);diagnostic('contract-revised',{provider,model,pendingId,contract});return response(provider,visibleProposal(pendingId,contract),model)}
      if(intent==='CONFIRM'){
        const revisions=(pending.sources||[]).map(s=>sourceInfo(s).revision);if(JSON.stringify(revisions)!==JSON.stringify(pending.sourceRevisions||[]))throw new Error('Das Ausgangsmaterial des bestätigten Auftrags stimmt nicht mehr mit dem gespeicherten Stand überein. Bitte den Auftrag neu formulieren.');
        const result=await executeContract(provider,url,init.headers,model,pending);delete state.pending[pendingId];saveState(state);diagnostic('executed',{provider,model,pendingId,mode:pending.contract.mode,tracks:result.score.tr?.length||0});return response(provider,JSON.stringify(result.score),model)
      }
      if(intent==='COMPOSE'){delete state.pending[pendingId];saveState(state)}
    }

    const current=extract(last.content).sources,candidates=mergeSources(current,workspaceSources());
    if(intent==='ANALYZE'){const selected=await selectForAnalysis(provider,url,init.headers,model,task,candidates);diagnostic('analysis',{provider,model,sources:selected.map(sourceInfo)});const next=appendSources(provider,body,selected);return transport(input,{...init,body:JSON.stringify(next)})}
    if(intent==='DISCUSS')return transport(input,init);
    if(intent==='COMPOSE'){
      const contract=await makeContract(provider,url,init.headers,model,task,candidates);const selected=contract.sourceNumbers.map(n=>candidates[n-1]).filter(Boolean).map(clone);const pid=id();state.pending[pid]={createdAt:Date.now(),provider,model,originalTask:task,contract,sources:selected,sourceRevisions:selected.map(s=>sourceInfo(s).revision)};saveState(state);diagnostic('contract-created',{provider,model,pendingId:pid,contract,sources:selected.map(sourceInfo)});return response(provider,visibleProposal(pid,contract),model)
    }
    return transport(input,init);
  }catch(e){diagnostic('controller-error',{message:e?.message||String(e)});throw e}
};

window.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('providerSelect')?.addEventListener('change',()=>abortAll('Laufende Anfrage wurde beim Anbieterwechsel abgebrochen.'),{capture:true});
  document.getElementById('modelSelect')?.addEventListener('change',()=>abortAll('Laufende Anfrage wurde beim Modellwechsel abgebrochen.'),{capture:true});
});
})();