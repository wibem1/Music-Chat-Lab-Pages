(()=>{
'use strict';
// MusicChatLab v1.1.22 — universal partial-edit workflow with app-side score reconstruction.
const wrappedFetch=window.fetch.bind(window);
const STORE='music-chat-lab.pending-openai-compositions.v1';
const DIAG='music-chat-lab.last-diagnostic.v1';
const SYSTEM_PREFIX='Du bist ein Kompositions- und Produktionsassistent für MIDI. Erfinde selbständige, geschlossene Musik nach dem Auftrag des Nutzers. Achte auf Stimmführung, Dynamik, Rhythmik und Artikulation. Bei der Bearbeitung vorhandenen Materials sollen dessen musikalische Identität, Form und Umfang angemessen berücksichtigt werden, sofern der Auftrag nichts anderes verlangt.';
const TECHNICAL_PROMPT=`NOTATION UND AUSGABE:
- Vollständige Partitur: valides JSON mit ti, bpm, ts, k, sm und tr.
- Track: nm, ch, pg, nt, optional ct.
- nt: [StartBeat, Dauer, Pitch, Velocity, Staff, Gate].
- ct: [Beat, CC, Wert].`;
const sourceRe=/\[MCL-ENGINE14-SCORE name=("(?:[^"\\]|\\.)*")\]\n([\s\S]*?)\n\[\/MCL-ENGINE14-SCORE\]/g;
const workspaceRe=/\n*--- MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---[\s\S]*?--- ENDE MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---\n*/g;
const shortIdea=window.MCLCompositionEdit?.conceptGuide||'Beginne mit „Auftrag verstanden:“ und gib den Auftrag kurz in eigenen Worten wieder. Formuliere danach in höchstens drei kurzen Sätzen die wesentliche kompositorische Idee. Nenne Tempo in BPM und eine Taktzahl nur, wenn sie aus den Daten eindeutig hervorgeht.';
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
function load(){try{return JSON.parse(localStorage.getItem(STORE))||{}}catch{return{}}}
function save(x){localStorage.setItem(STORE,JSON.stringify(x))}
function id(){return Math.random().toString(36).slice(2,9)}
function normalize(body){return(Array.isArray(body?.input)?body.input:[]).map(m=>({role:m.role==='assistant'?'assistant':'user',content:typeof m.content==='string'?m.content:(Array.isArray(m.content)?m.content.map(x=>x?.text||x?.input_text||x?.output_text||'').join(''):String(m.content||''))}))}
function extract(text){const sources=[];let m;sourceRe.lastIndex=0;while((m=sourceRe.exec(String(text||'')))){try{sources.push({name:JSON.parse(m[1]),score:JSON.parse(m[2])})}catch{}}sourceRe.lastIndex=0;const task=String(text||'').replace(sourceRe,'').replace(workspaceRe,'\n').replace(/\n\n--- DATEIANHÄNGE ---\n?/g,'\n').replace(/\n*\[MCL-VERSTAENDNISCHECK-V121\][\s\S]*$/,'').trim();return{task,sources}}
function workspaceSources(){try{return (window.MCLMidiWorkspaceSources?.()||[]).filter(x=>x?.score).map(x=>({slot:Number(x.slot)||null,name:x.name||x.score?.ti||'Stück',score:clone(x.score)}))}catch{return[]}}
function sameSource(a,b){try{return JSON.stringify(a?.score)===JSON.stringify(b?.score)}catch{return false}}
function mergeSources(...groups){const out=[];for(const g of groups)for(const s of(g||[]))if(s?.score&&!out.some(x=>sameSource(x,s)))out.push(s);return out}
function sourceInfo(s){const tr=Array.isArray(s?.score?.tr)?s.score.tr:[],ts=s?.score?.ts||{};let notes=0,end=0;tr.forEach(t=>(t.nt||[]).forEach(n=>{if(!Array.isArray(n))return;notes++;end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0))}));const hasMeter=Number(ts.n)>0&&Number(ts.d)>0,bar=hasMeter?Number(ts.n)*(4/Number(ts.d)):null;return{slot:s.slot??null,name:s.name,notes,bars:bar?Number((end/bar).toFixed(2)):null,beats:Number(end.toFixed(2)),bpm:s?.score?.bpm??null,meter:hasMeter?`${ts.n}/${ts.d}`:null,key:s?.score?.k??null}}
function catalogue(sources){return sources.map((s,i)=>{const x=sourceInfo(s);return `${i+1}: ${x.slot?`Speicherplatz ${x.slot} · `:''}${x.name} | ${x.bars??'?'} Takte | ${x.beats??'?'} Beats | ${x.bpm??'?'} BPM | ${x.meter??'?'} | Tonart ${x.key??'frei'} | ${x.notes} Noten`}).join('\n')}
function assignment(task,sources){let a=`Auftrag:\n${task}`;sources.forEach((s,i)=>a+=`\n\nVORHANDENES MATERIAL${sources.length>1?' '+(i+1):''} (${s.name}):\n${JSON.stringify(s.score)}`);return a}
function promptBase(a){return `MUSIKALISCHES MATERIAL UND AUFTRAG:\n${a}`}
function obviousPendingIntent(task){const t=String(task||'').trim().toLowerCase().replace(/[.!?]+$/,'').trim();if(/^(ja|ja bitte|mach das|mache das|genau|einverstanden|okay|ok|los|bitte|so machen|ausführen|führe (das|ihn|sie) aus)$/.test(t))return'CONFIRM';if(/^(nein|ablehnen|verwerfen|verwirf (das|ihn|sie)|nicht machen|abbrechen)$/.test(t))return'REJECT';return null}
function visible(pid,concept){return `Kompositionsidee:\n\n${concept}\n\nDu kannst jetzt:\n• mit „Ja“ oder „Mach das“ bestätigen,\n• mit „Ablehnen“ verwerfen,\n• oder deinen Änderungswunsch direkt schreiben.\n\n[MCL-VORSCHLAG:${pid}]`}
function proposalResponse(text,model){return new Response(JSON.stringify({id:'mcl-openai-proposal',object:'response',model,output_text:text,output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]}),{status:200,headers:{'content-type':'application/json'}})}
function outputText(d){if(typeof d?.output_text==='string')return d.output_text;return(d?.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('\n').trim()}
async function direct(url,headers,model,prompt){const h=new Headers(headers||{});const r=await wrappedFetch(url,{method:'POST',headers:h,body:JSON.stringify({model,input:[{role:'system',content:SYSTEM_PREFIX},{role:'user',content:prompt}],store:false})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`OpenAI API-Fehler ${r.status}`);const t=outputText(d);if(!t)throw new Error('OpenAI hat keine Textantwort geliefert.');return t}
function diagnostic(stage,data){try{localStorage.setItem(DIAG,JSON.stringify({version:'1.1.22',timestamp:new Date().toISOString(),stage,...data},null,2))}catch{}}
function parseScoreText(text){let s=String(text||'').trim();const f=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);if(f)s=f[1].trim();const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;try{const x=JSON.parse(s.slice(a,b+1));return x&&Array.isArray(x.tr)&&x.tr.some(t=>Array.isArray(t?.nt))?x:null}catch{return null}}
function materialize(text,sources){return window.MCLCompositionEdit?.materialize?.(text,sources)||parseScoreText(text)}
function findPendingId(messages,pending){for(let i=messages.length-1;i>=0;i--){if(messages[i].role!=='assistant')continue;const m=String(messages[i].content||'').match(/\[MCL-(?:OPENAI-)?VORSCHLAG:([a-z0-9]+)\]/i);if(m&&pending[m[1]])return m[1]}const recent=Object.entries(pending).filter(([,p])=>Date.now()-Number(p?.createdAt||0)<30*60*1000).sort((a,b)=>Number(b[1]?.createdAt||0)-Number(a[1]?.createdAt||0));return recent.length===1?recent[0][0]:null}
function sourcesForPending(p){if(Array.isArray(p?.sources)&&p.sources.length)return p.sources.map(clone);const ws=workspaceSources(),infos=Array.isArray(p?.sourceInfo)?p.sourceInfo:[];return infos.map(info=>ws.find(s=>(info.slot&&Number(s.slot)===Number(info.slot))||s.name===info.name)).filter(Boolean).map(clone)}
async function classifyIntent(url,headers,model,messages,hasPending){const latest=[...messages].reverse().find(m=>m.role==='user'),prior=[...messages].reverse().find(m=>m.role==='assistant'),task=extract(latest?.content||'').task,priorText=String(prior?.content||'').replace(/\[MCL-(?:OPENAI-)?VORSCHLAG:[a-z0-9]+\]/ig,'').slice(-1800);const choices=hasPending?'CONFIRM | REJECT | REVISE | COMPOSE | ANALYZE | DISCUSS':'COMPOSE | ANALYZE | DISCUSS';const prompt=`Ordne die aktuelle Nutzereingabe nach ihrer Bedeutung ein. Antworte nur mit einem der erlaubten Wörter: ${choices}.\n\nCOMPOSE = neue Musik erzeugen oder vorhandene Musik verändern.\nANALYZE = eine konkrete vorhandene Musik auf Noten-, Harmonie-, Rhythmus-, Form- oder Struktur-Ebene untersuchen, beurteilen oder vergleichen; dafür werden Partiturdaten benötigt.\nDISCUSS = allgemeines Gespräch oder Rückfrage ohne Bedarf an vollständigen Notendaten.\nCONFIRM = offenen Kompositionsvorschlag jetzt ausführen.\nREJECT = offenen Vorschlag verwerfen.\nREVISE = offenen Vorschlag vor Ausführung verändern.\nBei Mehrdeutigkeit DISCUSS.\n\nVorherige KI-Antwort:\n${priorText}\n\nAktuelle Nutzereingabe:\n${task}`;const raw=(await direct(url,headers,model,prompt)).trim().toUpperCase(),allowed=choices.split(' | ');return allowed.includes(raw)?raw:'DISCUSS'}
async function selectSources(url,headers,model,task,sources){if(!sources.length)return[];if(sources.length===1)return[sources[0]];const prompt=`Wähle aus dem folgenden Katalog ausschließlich die musikalischen Quellen aus, die für den aktuellen Auftrag tatsächlich gemeint oder erforderlich sind. Entscheide semantisch. Antworte nur mit den Katalognummern, kommasepariert, oder NONE.\n\nKATALOG:\n${catalogue(sources)}\n\nAUFTRAG:\n${task}`;const raw=(await direct(url,headers,model,prompt)).trim();if(/^NONE$/i.test(raw))return[];const nums=[...new Set((raw.match(/\d+/g)||[]).map(Number).filter(n=>n>=1&&n<=sources.length))];return nums.map(n=>sources[n-1])}
function appendSelected(body,sources){const extra=sources.length?`\n\n--- AUSGEWÄHLTES MUSIKMATERIAL ---\n${sources.map(s=>`[MCL-ENGINE14-SCORE name=${JSON.stringify(s.name)}]\n${JSON.stringify(s.score)}\n[/MCL-ENGINE14-SCORE]`).join('\n\n')}\n--- ENDE AUSGEWÄHLTES MUSIKMATERIAL ---`:'';const b=clone(body);for(let i=b.input.length-1;i>=0;i--){const m=b.input[i];if(m.role==='assistant')continue;if(typeof m.content==='string'){sourceRe.lastIndex=0;m.content=String(m.content).replace(sourceRe,'').trim()+extra;break}if(Array.isArray(m.content)){const txt=m.content.map(x=>x?.text||x?.input_text||x?.output_text||'').join('');sourceRe.lastIndex=0;m.content=String(txt).replace(sourceRe,'').trim()+extra;break}}return b}

window.fetch=async function(input,init={}){
 const url=typeof input==='string'?input:input?.url||'';
 if(!url.includes('api.openai.com/v1/responses')||typeof init.body!=='string')return wrappedFetch(input,init);
 try{
  const body=JSON.parse(init.body),msgs=normalize(body),last=[...msgs].reverse().find(m=>m.role==='user'),model=body.model||'';if(!last)return wrappedFetch(input,init);
  const pending=load(),pid=findPendingId(msgs,pending),hasPending=!!(pid&&pending[pid]),task=extract(last.content).task,shortcut=hasPending?obviousPendingIntent(task):null,intent=shortcut||await classifyIntent(url,init.headers,model,msgs,hasPending);
  diagnostic('intent-classified',{provider:'openai',model,intent,hasPending,pendingId:pid,userText:task});
  if(hasPending){
    const p=pending[pid],change=task,base=promptBase(p.assignment);
    if(intent==='REJECT'){delete pending[pid];save(pending);return proposalResponse('Kompositionsidee verworfen. Es wurde keine Komposition erzeugt.',model)}
    if(intent==='CONFIRM'){
      const editSources=sourcesForPending(p),protocol=window.MCLCompositionEdit?.protocol||'';
      const prompt=`${base}\n\nARBEITSSCHRITT: FERTIGE KOMPOSITION\n${TECHNICAL_PROMPT}\n\n${protocol}\n\nBESTÄTIGTE KOMPONITIONSIDEE:\n${p.concept}\n\nGib jetzt die fertige JSON-Partitur aus oder, wenn nur Teile vorhandenen Materials geändert/ergänzt werden, das PATCH-JSON gemäß Ausgabestrategie.`;
      diagnostic('final-composition-call',{provider:'openai',model,task:p.task,concept:p.concept,sources:p.sourceInfo,editSourceCount:editSources.length,confirmationShortcut:!!shortcut});
      let raw=await direct(url,init.headers,model,prompt),score=materialize(raw,editSources);
      if(!score){
        diagnostic('final-composition-retry',{provider:'openai',model,reason:'first response was not valid score or patch JSON'});
        raw=await direct(url,init.headers,model,`${prompt}\n\nDie vorige Antwort war kein gültiges Kompositionsergebnis. Antworte jetzt ausschließlich mit genau einem validen JSON-Objekt: entweder vollständige Partitur oder PATCH-JSON gemäß Ausgabestrategie. Kein Kommentar, keine Zusammenfassung, kein Markdown.`);
        score=materialize(raw,editSources);
      }
      if(!score){pending[pid]=p;save(pending);return proposalResponse('Die KI hat kein gültiges Kompositionsergebnis geliefert. Der Kompositionsauftrag bleibt erhalten. Bitte antworte erneut mit „Ja“, um es noch einmal zu versuchen.',model)}
      delete pending[pid];save(pending);diagnostic('final-composition-valid',{provider:'openai',model,task:p.task,resultMode:String(raw).includes('"mode"')?'patch':'score',tracks:score.tr?.length||0});
      return proposalResponse(JSON.stringify(score),model);
    }
    if(intent==='REVISE'){const revise=`${base}\n\nARBEITSSCHRITT: KOMPONITIONSIDEE ÜBERARBEITEN\n${shortIdea}\n\nBISHERIGE KOMPONITIONSIDEE:\n${p.concept}\n\nÄNDERUNGSWUNSCH:\n${change}`;const concept=await direct(url,init.headers,model,revise);p.concept=concept;pending[pid]=p;save(pending);return proposalResponse(visible(pid,concept),model)}
    if(intent==='COMPOSE'){delete pending[pid];save(pending)}
  }
  if(intent==='ANALYZE'){const current=extract(last.content).sources,candidates=mergeSources(current,workspaceSources()),selected=await selectSources(url,init.headers,model,task,candidates);diagnostic('analysis-sources',{provider:'openai',model,task,sources:selected.map(sourceInfo)});return wrappedFetch(input,{...init,body:JSON.stringify(appendSelected(body,selected))})}
  if(intent!=='COMPOSE')return wrappedFetch(input,init);
  const current=extract(last.content).sources,candidates=mergeSources(current,workspaceSources()),selected=await selectSources(url,init.headers,model,task,candidates),a=assignment(task,selected),base=promptBase(a),info=selected.map(sourceInfo),overview=info.length?`\n\nQUELLENÜBERSICHT:\n${catalogue(selected)}`:'',concept=await direct(url,init.headers,model,`${base}\n\nARBEITSSCHRITT: KOMPONITIONSIDEE\n${shortIdea}${overview}`),newId=id();
  pending[newId]={task,assignment:a,concept,sourceInfo:info,sources:selected.map(s=>({slot:s.slot??null,name:s.name,score:clone(s.score)})),createdAt:Date.now()};save(pending);diagnostic('proposal-created',{provider:'openai',model,task,candidateCount:candidates.length,sources:info,concept});return proposalResponse(visible(newId,concept),model);
 }catch(e){return new Response(JSON.stringify({error:{message:e?.message||String(e)}}),{status:500,headers:{'content-type':'application/json'}})}
};
})();