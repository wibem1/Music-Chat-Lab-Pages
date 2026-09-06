(() => {
  // v0.4.16 — Claude/Engine-14: short proposal, source reuse, downloadable diagnostics.
  const wrappedFetch = window.fetch.bind(window);
  const STORE = 'music-chat-lab.pending-compositions.v1';
  const DIAG = 'music-chat-lab.last-diagnostic.v1';
  const SYSTEM_PREFIX = `Du bist ein Kompositions- und Produktionsassistent für MIDI.\nErfinde selbständige, geschlossene Musik nach dem Auftrag des Nutzers. Achte auf Stimmführung, Dynamik (Velocity 1-127), Rhythmik und Artikulation.`;
  const TECHNICAL_PROMPT = `NOTATION UND AUSGABE:\n- "d" = Notierter Wert in Viertelnoten-Beats (0.125, 0.25, 0.333333, 0.5, 0.666667, 0.75, 1, 1.5, 2, 3, 4, 6, 8).\n- "g" = Gate/Klingdauer als Faktor (z.B. 0.95 = normal, 0.5 = staccato, 1.05 = legato).\n- "st" = System (0=Standard, 1=Rechte Hand / oberes System, 2=Linke Hand / unteres System).\n- Format: JSON mit folgender Struktur:\n{\n  "ti": "Titel",\n  "bpm": 96,\n  "ts": {"n": 4, "d": 4},\n  "k": "e minor",\n  "sm": "Kurze Zusammenfassung",\n  "tr": [{"nm":"Piano","ch":0,"pg":0,"nt":[[0.0,1.0,60,80,1]],"ct":[[0.0,64,0]]}]\n}\nnt-Array: [StartBeat, Dauer, Pitch, Velocity, Staff, Gate] (Gate ist optional, Standard 0.95).\nct-Array: [Beat, CC, Wert].\nGib ausschließlich valides JSON aus.`;
  const sourceRe = /\[MCL-ENGINE14-SCORE name=("(?:[^"\\]|\\.)*")\]\n([\s\S]*?)\n\[\/MCL-ENGINE14-SCORE\]/g;
  const compRe = /(komponier|erzeug|erstelle|variier|variation|fortsetz|verlänger|verkürz|bearbeit|arrangier|orchestrier|transformier|neues\s+stück|neue\s+komposition|kurzfassung|füge[^\n]{0,100}(?:stück|komposition|variation))/i;
  const yesRe = /^(ja|ja bitte|mach das|mache das|genau|einverstanden|okay|ok|los|bitte|so machen|ausführen|führe (das|ihn|sie) aus)[.!\s]*$/i;
  function load(){try{return JSON.parse(localStorage.getItem(STORE))||{}}catch{return{}}}
  function save(x){localStorage.setItem(STORE,JSON.stringify(x))}
  function id(){return Math.random().toString(36).slice(2,9)}
  function extract(text){const sources=[];let m;sourceRe.lastIndex=0;while((m=sourceRe.exec(text))){try{sources.push({name:JSON.parse(m[1]),score:JSON.parse(m[2])})}catch{}}sourceRe.lastIndex=0;const task=String(text||'').replace(/\n\n--- DATEIANHÄNGE ---\n?/g,'\n').replace(sourceRe,'').trim();return{task,sources}}
  function latestSources(messages,skipLastUser=false){let skipped=!skipLastUser;for(let i=messages.length-1;i>=0;i--){const m=messages[i];if(m.role!=='user'||typeof m.content!=='string')continue;if(!skipped){skipped=true;continue}const found=extract(m.content).sources;if(found.length)return found}return[]}
  function assignment(task,sources){let a=`Auftrag:\n${task}`;if(sources.length===1)a+=`\n\nVORHANDENES MATERIAL (${sources[0].name}):\n${JSON.stringify(sources[0].score)}`;else sources.forEach((s,i)=>a+=`\n\nVORHANDENES MATERIAL ${i+1} (${s.name}):\n${JSON.stringify(s.score)}`);return a}
  function sourceInfo(s){const tr=Array.isArray(s?.score?.tr)?s.score.tr:[];const notes=tr.reduce((n,t)=>n+(Array.isArray(t.nt)?t.nt.length:0),0);let end=0;tr.forEach(t=>(t.nt||[]).forEach(n=>{if(Array.isArray(n))end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0))}));const ts=s?.score?.ts||{};const bar=(Number(ts.n)||4)*(4/(Number(ts.d)||4));return{name:s.name,notes,beats:Number(end.toFixed(3)),bars:bar?Number((end/bar).toFixed(2)):null,bpm:s?.score?.bpm??null,meter:ts.n&&ts.d?`${ts.n}/${ts.d}`:null,key:s?.score?.k??null}}
  function diagnostic(stage,data){try{localStorage.setItem(DIAG,JSON.stringify({version:'0.4.16',timestamp:new Date().toISOString(),stage,...data},null,2))}catch{}}
  window.MCLDownloadDiagnostic=function(){const raw=localStorage.getItem(DIAG);if(!raw){alert('Noch keine Kompositionsdiagnose vorhanden.');return}const blob=new Blob([raw],{type:'application/json;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`Music-Chat-Lab-Diagnose-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)};
  function xhr(url,headers,body){return new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('POST',url,true);Object.entries(headers||{}).forEach(([k,v])=>x.setRequestHeader(k,v));x.onload=()=>{let d={};try{d=JSON.parse(x.responseText)}catch{};if(x.status>=200&&x.status<300)resolve(d);else reject(new Error(d?.error?.message||`API-Fehler ${x.status}`))};x.onerror=()=>reject(new Error('Failed to fetch'));x.send(JSON.stringify(body))})}
  async function claude(url,headers,model,system,user){return xhr(url,headers,{model,max_tokens:32000,output_config:{effort:'medium'},system,messages:[{role:'user',content:user}]})}
  function textOf(d){return(d.content||[]).filter(x=>x.type==='text').map(x=>x.text||'').join('').trim()}
  function response(text,model){return new Response(JSON.stringify({id:'mcl-proposal',type:'message',role:'assistant',model,content:[{type:'text',text}],stop_reason:'end_turn'}),{status:200,headers:{'content-type':'application/json'}})}
  function markerFrom(messages){for(let i=messages.length-1;i>=0;i--){if(messages[i].role!=='assistant')continue;const m=String(messages[i].content||'').match(/\[MCL-VORSCHLAG:([a-z0-9]+)\]/i);if(m)return m[1]}return null}
  function visibleProposal(pid,concept){return `Kompositionsvorschlag:\n\n${concept}\n\nWenn du damit einverstanden bist, antworte einfach mit „Ja“ oder „Mach das“. Änderungswünsche kannst du stattdessen direkt schreiben.\n\n[MCL-VORSCHLAG:${pid}]`}
  const shortIdea = `Formuliere einen kurzen musikalischen Gedanken/Impuls in höchstens drei kurzen Sätzen. Beschreibe nur die wesentliche kompositorische Idee, keinen detaillierten Ablauf oder technischen Bauplan.`;
  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:input?.url||'';
    if(!url.includes('api.anthropic.com/v1/messages')||typeof init.body!=='string')return wrappedFetch(input,init);
    try{
      const body=JSON.parse(init.body), msgs=Array.isArray(body.messages)?body.messages:[], last=[...msgs].reverse().find(m=>m.role==='user'&&typeof m.content==='string');
      if(!last)return wrappedFetch(input,init);
      const pendingId=markerFrom(msgs), pending=load();
      if(pendingId&&pending[pendingId]){
        const p=pending[pendingId], change=String(last.content||'').trim();
        if(yesRe.test(change)){
          const compPrompt=`${TECHNICAL_PROMPT}\n\nAUFTRAG:\n${p.assignment}\n\nDEIN KONZEPT:\n${p.concept}\n\nGib jetzt die fertige JSON-Partitur aus.`;
          diagnostic('final-composition-call',{model:body.model,userConfirmation:change,task:p.task,sourceOrigin:p.sourceOrigin,sources:p.sourceInfo,concept:p.concept,assignment:p.assignment,finalPrompt:compPrompt});
          const d=await claude(url,init.headers,body.model,SYSTEM_PREFIX,compPrompt);delete pending[pendingId];save(pending);return response(textOf(d),body.model);
        }
        const revise=`Überarbeite den folgenden musikalischen Gedanken/Impuls entsprechend dem Änderungswunsch des Nutzers. ${shortIdea}\n\nAUFTRAG:\n${p.assignment}\n\nBISHERIGER IMPULS:\n${p.concept}\n\nÄNDERUNGSWUNSCH:\n${change}`;
        const d=await claude(url,init.headers,body.model,SYSTEM_PREFIX,revise), concept=textOf(d);p.concept=concept;pending[pendingId]=p;save(pending);return response(visibleProposal(pendingId,concept),body.model);
      }
      if(!compRe.test(last.content))return wrappedFetch(input,init);
      let {task,sources}=extract(last.content), sourceOrigin='current-message';
      if(!sources.length){sources=latestSources(msgs,true);sourceOrigin=sources.length?'reused-from-chat':'none'}
      const a=assignment(task,sources);
      const conceptPrompt=`${shortIdea}\n\nAUFTRAG:\n${a}`;
      const d=await claude(url,init.headers,body.model,SYSTEM_PREFIX,conceptPrompt), concept=textOf(d), pid=id(), info=sources.map(sourceInfo);
      pending[pid]={assignment:a,concept,task,sourceOrigin,sourceInfo:info,createdAt:Date.now()};save(pending);diagnostic('proposal-created',{model:body.model,task,sourceOrigin,sources:info,concept,assignment:a});return response(visibleProposal(pid,concept),body.model);
    }catch(e){return new Response(JSON.stringify({error:{message:e?.message||String(e)}}),{status:500,headers:{'content-type':'application/json'}})}
  };
})();