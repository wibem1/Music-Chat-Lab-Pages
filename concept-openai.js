(()=>{
'use strict';
// MusicChatLab v1.0.26 — semantic intent routing + concept approval for OpenAI Responses API.
const wrappedFetch=window.fetch.bind(window);
const STORE='music-chat-lab.pending-openai-compositions.v1';
const DIAG='music-chat-lab.last-diagnostic.v1';
const SYSTEM_PREFIX='Du bist ein Kompositions- und Produktionsassistent für MIDI. Erfinde selbständige, geschlossene Musik nach dem Auftrag des Nutzers. Achte auf Stimmführung, Dynamik, Rhythmik und Artikulation. Bei der Bearbeitung vorhandenen Materials sollen dessen musikalische Identität, Form und Umfang angemessen berücksichtigt werden, sofern der Auftrag nichts anderes verlangt.';
const TECHNICAL_PROMPT=`NOTATION UND AUSGABE:\n- Format: valides JSON mit ti, bpm, ts, k, sm und tr.\n- Track: nm, ch, pg, nt, optional ct.\n- nt: [StartBeat, Dauer, Pitch, Velocity, Staff, Gate].\n- ct: [Beat, CC, Wert].\nGib ausschließlich valides JSON aus.`;
const sourceRe=/\[MCL-ENGINE14-SCORE name=("(?:[^"\\]|\\.)*")\]\n([\s\S]*?)\n\[\/MCL-ENGINE14-SCORE\]/g;
const workspaceRe=/\n*--- MUSIKALISCHER ARBEITSTISCH ---[\s\S]*?--- ENDE MUSIKALISCHER ARBEITSTISCH ---\n*/g;
const shortIdea='Formuliere einen kurzen musikalischen Gedanken/Impuls in höchstens drei kurzen Sätzen. Beschreibe nur die wesentliche kompositorische Idee, keinen detaillierten Ablauf oder technischen Bauplan. Nenne geplante Länge in Takten und Tempo in BPM. Bei vorhandenem Material dienen Umfang und Tempo als Ausgangspunkt; Abweichungen sollen im Vorschlag sichtbar sein.';
function load(){try{return JSON.parse(localStorage.getItem(STORE))||{}}catch{return{}}}
function save(x){localStorage.setItem(STORE,JSON.stringify(x))}
function id(){return Math.random().toString(36).slice(2,9)}
function normalize(body){return(Array.isArray(body?.input)?body.input:[]).map(m=>({role:m.role==='assistant'?'assistant':'user',content:typeof m.content==='string'?m.content:(Array.isArray(m.content)?m.content.map(x=>x?.text||x?.input_text||x?.output_text||'').join(''):String(m.content||''))}))}
function marker(messages){let i=-1;for(let n=messages.length-1;n>=0;n--){if(messages[n].role==='user'){i=n;break}}if(i<=0)return null;const p=messages[i-1];if(p?.role!=='assistant')return null;return String(p.content||'').match(/\[MCL-(?:OPENAI-)?VORSCHLAG:([a-z0-9]+)\]/i)?.[1]||null}
function extract(text){const sources=[];let m;sourceRe.lastIndex=0;while((m=sourceRe.exec(String(text||'')))){try{sources.push({name:JSON.parse(m[1]),score:JSON.parse(m[2])})}catch{}}sourceRe.lastIndex=0;const task=String(text||'').replace(sourceRe,'').replace(workspaceRe,'\n').replace(/\n\n--- DATEIANHÄNGE ---\n?/g,'\n').trim();return{task,sources}}
function assignment(task,sources){let a=`Auftrag:\n${task}`;sources.forEach((s,i)=>a+=`\n\nVORHANDENES MATERIAL${sources.length>1?' '+(i+1):''} (${s.name}):\n${JSON.stringify(s.score)}`);return a}
function visible(pid,concept){return `Kompositionsidee:\n\n${concept}\n\nDu kannst jetzt:\n• mit „Ja“ oder „Mach das“ bestätigen,\n• mit „Ablehnen“ verwerfen,\n• oder deinen Änderungswunsch direkt schreiben.\n\n[MCL-VORSCHLAG:${pid}]`}
function proposalResponse(text,model){return new Response(JSON.stringify({id:'mcl-openai-proposal',object:'response',model,output_text:text,output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]}),{status:200,headers:{'content-type':'application/json'}})}
function outputText(d){if(typeof d?.output_text==='string')return d.output_text;return(d?.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('\n').trim()}
async function direct(url,headers,model,prompt){const h=new Headers(headers||{});const r=await wrappedFetch(url,{method:'POST',headers:h,body:JSON.stringify({model,input:[{role:'system',content:SYSTEM_PREFIX},{role:'user',content:prompt}],store:false})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`OpenAI API-Fehler ${r.status}`);const t=outputText(d);if(!t)throw new Error('OpenAI hat keine Textantwort geliefert.');return t}
function diagnostic(stage,data){try{localStorage.setItem(DIAG,JSON.stringify({version:'1.0.26',timestamp:new Date().toISOString(),stage,...data},null,2))}catch{}}
async function classifyIntent(url,headers,model,messages,hasPending){
 const latest=[...messages].reverse().find(m=>m.role==='user');
 const prior=[...messages].reverse().find(m=>m.role==='assistant');
 const {task}=extract(latest?.content||'');
 const priorText=String(prior?.content||'').replace(/\[MCL-(?:OPENAI-)?VORSCHLAG:[a-z0-9]+\]/ig,'').slice(-2500);
 const choices=hasPending?'CONFIRM | REJECT | REVISE | COMPOSE | DISCUSS':'COMPOSE | DISCUSS';
 const prompt=`Ordne die aktuelle Nutzereingabe nach ihrer Bedeutung ein, nicht nach einzelnen Schlüsselwörtern.\n\nMögliche Ausgabe: ${choices}.\n\nRegeln:\n- COMPOSE: Der Nutzer möchte tatsächlich neue Musik erzeugen oder vorhandene Musik verändern, fortsetzen, variieren, arrangieren, synthetisieren oder sonst musikalisch bearbeiten lassen.\n- DISCUSS: Der Nutzer möchte sprechen, fragen, analysieren, beurteilen, vergleichen, erklären, kritisieren oder Ideen erörtern, ohne dass jetzt Musik erzeugt oder verändert werden soll. Ein musikalisches Wort wie „Synthese“, „Variation“ oder „Komposition“ allein bedeutet NICHT COMPOSE.\n- CONFIRM (nur bei offenem Vorschlag): Der Nutzer bestätigt, dass die vorgeschlagene Komposition jetzt ausgeführt werden soll.\n- REJECT (nur bei offenem Vorschlag): Der Nutzer verwirft oder stoppt den Vorschlag.\n- REVISE (nur bei offenem Vorschlag): Der Nutzer möchte die vorgeschlagene Kompositionsidee ändern, bevor Musik erzeugt wird.\n- COMPOSE bleibt auch bei offenem Vorschlag möglich: Wähle COMPOSE, wenn die aktuelle Nachricht einen neuen, eigenständigen Kompositionsauftrag erteilt, statt nur den offenen Vorschlag zu bestätigen oder zu überarbeiten.\n- Bei Mehrdeutigkeit wähle DISCUSS; dann kann die KI im normalen Gespräch nachfragen.\n\nVorherige KI-Antwort (gekürzt):\n${priorText}\n\nAktuelle Nutzereingabe:\n${task}\n\nAntworte ausschließlich mit genau einem der erlaubten Wörter.`;
 const raw=(await direct(url,headers,model,prompt)).trim().toUpperCase();
 const allowed=hasPending?['CONFIRM','REJECT','REVISE','COMPOSE','DISCUSS']:['COMPOSE','DISCUSS'];
 return allowed.includes(raw)?raw:'DISCUSS';
}
window.fetch=async function(input,init={}){
 const url=typeof input==='string'?input:input?.url||'';
 if(!url.includes('api.openai.com/v1/responses')||typeof init.body!=='string')return wrappedFetch(input,init);
 try{
  const body=JSON.parse(init.body),msgs=normalize(body),last=[...msgs].reverse().find(m=>m.role==='user'),model=body.model||'';
  if(!last)return wrappedFetch(input,init);
  const pending=load(),pid=marker(msgs),hasPending=!!(pid&&pending[pid]);
  const intent=await classifyIntent(url,init.headers,model,msgs,hasPending);
  diagnostic('intent-classified',{provider:'openai',model,intent,hasPending,userText:extract(last.content).task});
  if(hasPending){
   const p=pending[pid],change=extract(last.content).task;
   if(intent==='REJECT'){delete pending[pid];save(pending);return proposalResponse('Kompositionsidee verworfen. Es wurde keine Komposition erzeugt.',model)}
   if(intent==='CONFIRM'){
    const prompt=`${TECHNICAL_PROMPT}\n\nAUFTRAG:\n${p.assignment}\n\nBESTÄTIGTE KOMPONITIONSIDEE:\n${p.concept}\n\nGib jetzt die fertige JSON-Partitur aus.`;
    diagnostic('final-composition-call',{provider:'openai',model,task:p.task,concept:p.concept,assignment:p.assignment});delete pending[pid];save(pending);
    return proposalResponse(await direct(url,init.headers,model,prompt),model);
   }
   if(intent==='REVISE'){
    const revise=`Überarbeite die folgende Kompositionsidee entsprechend dem Änderungswunsch. ${shortIdea}\n\nAUFTRAG:\n${p.assignment}\n\nBISHERIGE KOMPONITIONSIDEE:\n${p.concept}\n\nÄNDERUNGSWUNSCH:\n${change}`;
    const concept=await direct(url,init.headers,model,revise);p.concept=concept;pending[pid]=p;save(pending);return proposalResponse(visible(pid,concept),model);
   }
   if(intent!=='COMPOSE')return wrappedFetch(input,init);
   delete pending[pid];save(pending);
  }
  if(intent!=='COMPOSE')return wrappedFetch(input,init);
  const {task,sources}=extract(last.content),a=assignment(task,sources);
  const concept=await direct(url,init.headers,model,`${shortIdea}\n\nAUFTRAG:\n${a}`),newId=id();
  pending[newId]={task,assignment:a,concept,createdAt:Date.now()};save(pending);diagnostic('proposal-created',{provider:'openai',model,task,sources:sources.map(s=>s.name),concept,assignment:a});
  return proposalResponse(visible(newId,concept),model);
 }catch(e){return new Response(JSON.stringify({error:{message:e?.message||String(e)}}),{status:500,headers:{'content-type':'application/json'}})}
};
})();
