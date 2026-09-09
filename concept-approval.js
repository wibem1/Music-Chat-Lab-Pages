(() => {
  'use strict';
  // v1.1.17 — validate final score JSON, retry once on prose, preserve pending proposal on failure.
  const wrappedFetch = window.fetch.bind(window);
  const STORE = 'music-chat-lab.pending-compositions.v1';
  const DIAG = 'music-chat-lab.last-diagnostic.v1';
  const SYSTEM_PREFIX = `Du bist ein Kompositions- und Produktionsassistent für MIDI.\nErfinde selbständige, geschlossene Musik nach dem Auftrag des Nutzers. Achte auf Stimmführung, Dynamik (Velocity 1-127), Rhythmik und Artikulation. Bei der Bearbeitung vorhandenen Materials sollen dessen musikalische Identität, Form und Umfang angemessen berücksichtigt werden, sofern der Auftrag nichts anderes verlangt.`;
  const TECHNICAL_PROMPT = `NOTATION UND AUSGABE:\n- "d" = Notierter Wert in Viertelnoten-Beats.\n- "g" = Gate/Klingdauer als Faktor.\n- "st" = System (0=Standard, 1=Rechte Hand / oberes System, 2=Linke Hand / unteres System).\n- Format: JSON mit ti, bpm, ts, k, sm und tr.\n- nt: [StartBeat, Dauer, Pitch, Velocity, Staff, Gate].\n- ct: [Beat, CC, Wert].\nGib ausschließlich valides JSON aus.`;
  const sourceRe = /\[MCL-ENGINE14-SCORE name=("(?:[^"\\]|\\.)*")\]\n([\s\S]*?)\n\[\/MCL-ENGINE14-SCORE\]/g;
  const workspaceRe = /\n*--- MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---[\s\S]*?--- ENDE MUSIKALISCHER ARBEITSTISCH(?: \(KATALOG\))? ---\n*/g;
  const shortIdea = `Formuliere einen kurzen musikalischen Gedanken/Impuls in höchstens drei kurzen Sätzen. Beschreibe nur die wesentliche kompositorische Idee, keinen detaillierten Ablauf oder technischen Bauplan. Nenne im Vorschlag ausdrücklich die geplante Länge in Takten und das geplante Tempo in BPM.`;

  function load(){try{return JSON.parse(localStorage.getItem(STORE))||{}}catch{return{}}}
  function save(x){localStorage.setItem(STORE,JSON.stringify(x))}
  function id(){return Math.random().toString(36).slice(2,9)}
  function clone(x){return x==null?x:JSON.parse(JSON.stringify(x))}
  function extract(text){
    const sources=[];let m;sourceRe.lastIndex=0;
    while((m=sourceRe.exec(String(text||'')))){try{sources.push({name:JSON.parse(m[1]),score:JSON.parse(m[2])})}catch{}}
    sourceRe.lastIndex=0;
    const task=String(text||'').replace(sourceRe,'').replace(workspaceRe,'\n').replace(/\n\n--- DATEIANHÄNGE ---\n?/g,'\n').trim();
    return {task,sources};
  }
  function workspaceSources(){try{return (window.MCLMidiWorkspaceSources?.()||[]).filter(x=>x?.score).map(x=>({slot:Number(x.slot)||null,name:x.name||x.score?.ti||'Stück',score:clone(x.score)}))}catch{return[]}}
  function sameSource(a,b){try{return JSON.stringify(a?.score)===JSON.stringify(b?.score)}catch{return false}}
  function mergeSources(...groups){const out=[];for(const g of groups)for(const s of(g||[]))if(s?.score&&!out.some(x=>sameSource(x,s)))out.push(s);return out}
  function sourceInfo(s){const tr=Array.isArray(s?.score?.tr)?s.score.tr:[],ts=s?.score?.ts||{};let notes=0,end=0;tr.forEach(t=>(t.nt||[]).forEach(n=>{if(!Array.isArray(n))return;notes++;end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0))}));const bar=(Number(ts.n)||4)*(4/(Number(ts.d)||4));return{slot:s.slot??null,name:s.name,notes,bars:bar?Number((end/bar).toFixed(2)):null,bpm:s?.score?.bpm??null,meter:ts.n&&ts.d?`${ts.n}/${ts.d}`:null,key:s?.score?.k??null}}
  function catalogue(sources){return sources.map((s,i)=>{const x=sourceInfo(s);return `${i+1}: ${x.slot?`Speicherplatz ${x.slot} · `:''}${x.name} | ${x.bars??'?'} Takte | ${x.bpm??'?'} BPM | ${x.meter??'?'} | Tonart ${x.key??'frei'} | ${x.notes} Noten`}).join('\n')}
  function assignment(task,sources){let a=`Auftrag:\n${task}`;sources.forEach((s,i)=>a+=`\n\nVORHANDENES MATERIAL${sources.length>1?' '+(i+1):''} (${s.name}):\n${JSON.stringify(s.score)}`);return a}
  function visibleProposal(pid,concept){return `Kompositionsvorschlag:\n\n${concept}\n\nWenn du damit einverstanden bist, antworte einfach mit „Ja“ oder „Mach das“. Änderungswünsche kannst du stattdessen direkt schreiben.\n\n[MCL-VORSCHLAG:${pid}]`}
  function diagnostic(stage,data){try{localStorage.setItem(DIAG,JSON.stringify({version:'1.1.17',timestamp:new Date().toISOString(),stage,...data},null,2))}catch{}}
  window.MCLDownloadDiagnostic=function(){const raw=localStorage.getItem(DIAG);if(!raw){alert('Noch keine Kompositionsdiagnose vorhanden.');return}const blob=new Blob([raw],{type:'application/json;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`Music-Chat-Lab-Diagnose-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)};

  function xhr(url,headers,body,provider){return new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('POST',url,true);x.timeout=180000;Object.entries(headers||{}).forEach(([k,v])=>x.setRequestHeader(k,v));x.onload=()=>{let d={};try{d=JSON.parse(x.responseText)}catch{};if(x.status>=200&&x.status<300)resolve(d);else reject(new Error(d?.error?.message||`API-Fehler ${x.status}`))};x.onerror=()=>reject(new Error(provider==='google'?'Netzwerkzugriff zur Google-API fehlgeschlagen. Bitte Verbindung/VPN prüfen und erneut versuchen.':'Failed to fetch'));x.ontimeout=()=>reject(new Error('Die Anfrage hat zu lange gedauert und wurde beendet.'));x.send(JSON.stringify(body))})}
  async function claude(url,headers,model,system,user){return xhr(url,headers,{model,max_tokens:32000,output_config:{effort:'medium'},system,messages:[{role:'user',content:user}]},'anthropic')}
  async function gemini(url,headers,system,user){return xhr(url,headers,{systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig:{maxOutputTokens:32768}},'google')}
  function anthropicText(d){return(d.content||[]).filter(x=>x.type==='text').map(x=>x.text||'').join('').trim()}
  function googleText(d){return(d.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim()}
  function providerResponse(provider,text,model){if(provider==='google')return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text}]},finishReason:'STOP'}]}),{status:200,headers:{'content-type':'application/json'}});return new Response(JSON.stringify({id:'mcl-proposal',type:'message',role:'assistant',model,content:[{type:'text',text}],stop_reason:'end_turn'}),{status:200,headers:{'content-type':'application/json'}})}
  function normalizeRequest(provider,body){if(provider==='anthropic')return(Array.isArray(body.messages)?body.messages:[]).filter(m=>typeof m.content==='string').map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.content}));return(Array.isArray(body.contents)?body.contents:[]).map(m=>({role:m.role==='model'?'assistant':'user',content:(m.parts||[]).map(p=>p.text||'').join('')}))}
  function modelFrom(provider,body,url){if(provider==='anthropic')return body.model||'';const m=String(url).match(/\/models\/([^/:]+):generateContent/);return m?decodeURIComponent(m[1]):''}
  async function direct(provider,url,headers,model,prompt){if(provider==='google'){const d=await gemini(url,headers,SYSTEM_PREFIX,prompt);return googleText(d)}const d=await claude(url,headers,model,SYSTEM_PREFIX,prompt);return anthropicText(d)}
  function parseScoreText(text){let s=String(text||'').trim();const f=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);if(f)s=f[1].trim();const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)return null;try{const x=JSON.parse(s.slice(a,b+1));return x&&Array.isArray(x.tr)&&x.tr.some(t=>Array.isArray(t?.nt))?x:null}catch{return null}}
  function obviousPendingIntent(task){const s=String(task||'').trim().toLowerCase().replace(/[.!?]+$/,'').trim();if(/^(ja|j|ok|okay|mach das|mache das|bitte|los|ausführen|ausfuehren)$/.test(s))return'CONFIRM';if(/^(nein|n|verwerfen|abbrechen|lass es|lasse es)$/.test(s))return'REJECT';return null}

  function findPendingId(messages,pending){
    for(let i=messages.length-1;i>=0;i--){if(messages[i].role!=='assistant')continue;const m=String(messages[i].content||'').match(/\[MCL-VORSCHLAG:([a-z0-9]+)\]/i);if(m&&pending[m[1]])return m[1]}
    const recent=Object.entries(pending).filter(([,p])=>Date.now()-Number(p?.createdAt||0)<30*60*1000).sort((a,b)=>Number(b[1]?.createdAt||0)-Number(a[1]?.createdAt||0));
    return recent.length===1?recent[0][0]:null;
  }
  async function classifyIntent(provider,url,headers,model,msgs,hasPending){
    const latest=[...msgs].reverse().find(m=>m.role==='user'),previous=[...msgs].reverse().find(m=>m.role==='assistant');
    const task=extract(latest?.content||'').task,priorText=String(previous?.content||'').replace(/\[MCL-VORSCHLAG:[a-z0-9]+\]/ig,'').slice(-1800);
    const choices=hasPending?'CONFIRM | REJECT | REVISE | COMPOSE | ANALYZE | DISCUSS':'COMPOSE | ANALYZE | DISCUSS';
    const prompt=`Ordne die aktuelle Nutzereingabe nach ihrer Bedeutung ein. Antworte nur mit einem der erlaubten Wörter: ${choices}.\n\nCOMPOSE = neue Musik erzeugen oder vorhandene Musik verändern.\nANALYZE = eine konkrete vorhandene Musik auf Noten-, Harmonie-, Rhythmus-, Form- oder Struktur-Ebene untersuchen, beurteilen oder vergleichen; dafür werden Partiturdaten benötigt.\nDISCUSS = allgemeines Gespräch, Erklärung oder Rückfrage, für die keine vollständigen Notendaten benötigt werden.\nCONFIRM = einen offenen Kompositionsvorschlag jetzt ausführen.\nREJECT = offenen Vorschlag verwerfen.\nREVISE = offenen Vorschlag vor der Ausführung verändern.\nBei Mehrdeutigkeit DISCUSS.\n\nVorherige KI-Antwort:\n${priorText}\n\nAktuelle Nutzereingabe:\n${task}`;
    const raw=(await direct(provider,url,headers,model,prompt)).trim().toUpperCase(),allowed=choices.split(' | ');
    return allowed.includes(raw)?raw:'DISCUSS';
  }
  async function selectSources(provider,url,headers,model,task,sources){
    if(!sources.length)return[];if(sources.length===1)return[sources[0]];
    const prompt=`Wähle aus dem folgenden Katalog ausschließlich die musikalischen Quellen aus, die für den aktuellen Auftrag tatsächlich gemeint bzw. erforderlich sind. Entscheide semantisch aus dem Auftrag und dem Gesprächszusammenhang. Antworte nur mit den Katalognummern, kommasepariert, oder NONE, wenn keine Quelle benötigt wird.\n\nKATALOG:\n${catalogue(sources)}\n\nAUFTRAG:\n${task}`;
    const raw=(await direct(provider,url,headers,model,prompt)).trim();if(/^NONE$/i.test(raw))return[];
    const nums=[...new Set((raw.match(/\d+/g)||[]).map(Number).filter(n=>n>=1&&n<=sources.length))];return nums.map(n=>sources[n-1]);
  }
  function scoreBlocks(sources){return sources.map(s=>`[MCL-ENGINE14-SCORE name=${JSON.stringify(s.name)}]\n${JSON.stringify(s.score)}\n[/MCL-ENGINE14-SCORE]`).join('\n\n')}
  function appendSelected(provider,body,sources){
    const extra=sources.length?`\n\n--- AUSGEWÄHLTES MUSIKMATERIAL ---\n${scoreBlocks(sources)}\n--- ENDE AUSGEWÄHLTES MUSIKMATERIAL ---`:'';
    const clean=t=>String(t||'').replace(sourceRe,'').trim()+extra;sourceRe.lastIndex=0;
    const b=clone(body);
    if(provider==='anthropic'&&Array.isArray(b.messages)){for(let i=b.messages.length-1;i>=0;i--)if(b.messages[i].role==='user'&&typeof b.messages[i].content==='string'){b.messages[i].content=clean(b.messages[i].content);break}}
    if(provider==='google'&&Array.isArray(b.contents)){for(let i=b.contents.length-1;i>=0;i--)if(b.contents[i].role!=='model'){b.contents[i].parts=[{text:clean((b.contents[i].parts||[]).map(p=>p.text||'').join(''))}];break}}
    return b;
  }

  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:input?.url||'';
    const provider=url.includes('api.anthropic.com/v1/messages')?'anthropic':url.includes('generativelanguage.googleapis.com/')&&url.includes(':generateContent')?'google':null;
    if(!provider||typeof init.body!=='string')return wrappedFetch(input,init);
    try{
      const body=JSON.parse(init.body),msgs=normalizeRequest(provider,body),last=[...msgs].reverse().find(m=>m.role==='user'&&typeof m.content==='string'),model=modelFrom(provider,body,url);if(!last)return wrappedFetch(input,init);
      const pending=load(),pendingId=findPendingId(msgs,pending),hasPending=!!(pendingId&&pending[pendingId]),task=extract(last.content).task;
      const intent=(hasPending&&obviousPendingIntent(task))||await classifyIntent(provider,url,init.headers,model,msgs,hasPending);
      diagnostic('intent-classified',{provider,model,intent,hasPending,pendingId,userText:task});
      if(hasPending){
        const p=pending[pendingId],change=task;
        if(intent==='REJECT'){delete pending[pendingId];save(pending);return providerResponse(provider,'Kompositionsidee verworfen. Es wurde keine Komposition erzeugt.',model)}
        if(intent==='CONFIRM'){
          const compPrompt=`${TECHNICAL_PROMPT}\n\nAUFTRAG:\n${p.assignment}\n\nDEIN KONZEPT:\n${p.concept}\n\nGib jetzt die fertige JSON-Partitur aus.`;
          diagnostic('final-composition-call',{provider,model,userConfirmation:change,task:p.task,sources:p.sourceInfo,concept:p.concept});
          let result=await direct(provider,url,init.headers,model,compPrompt);
          if(!parseScoreText(result)){
            diagnostic('final-composition-retry',{provider,model,reason:'first response was not valid score JSON'});
            const retryPrompt=`${TECHNICAL_PROMPT}\n\nAUFTRAG:\n${p.assignment}\n\nDEIN KONZEPT:\n${p.concept}\n\nDie vorige Antwort war KEINE gültige Partitur. Erzeuge jetzt die vollständige Komposition. Antworte ausschließlich mit einem einzigen vollständigen JSON-Objekt im verlangten Partiturformat. Kein Kommentar, keine Zusammenfassung, kein Markdown. Das JSON muss ein Array "tr" enthalten und darin Notenarrays "nt".`;
            result=await direct(provider,url,init.headers,model,retryPrompt);
          }
          if(!parseScoreText(result)){
            pending[pendingId]=p;save(pending);
            diagnostic('final-composition-invalid',{provider,model,task:p.task});
            return providerResponse(provider,'Die KI hat keine gültige JSON-Partitur geliefert. Der Kompositionsauftrag bleibt erhalten. Bitte antworte erneut mit „Ja“, um es noch einmal zu versuchen.',model);
          }
          delete pending[pendingId];save(pending);
          diagnostic('final-composition-valid',{provider,model,task:p.task});
          return providerResponse(provider,result,model);
        }
        if(intent==='REVISE'){
          const revise=`Überarbeite den folgenden musikalischen Gedanken entsprechend dem Änderungswunsch. ${shortIdea}\n\nAUFTRAG:\n${p.assignment}\n\nBISHERIGER IMPULS:\n${p.concept}\n\nÄNDERUNGSWUNSCH:\n${change}`;
          const concept=await direct(provider,url,init.headers,model,revise);p.concept=concept;pending[pendingId]=p;save(pending);return providerResponse(provider,visibleProposal(pendingId,concept),model);
        }
        if(intent==='COMPOSE'){delete pending[pendingId];save(pending)}
      }
      if(intent==='ANALYZE'){
        const current=extract(last.content).sources,candidates=mergeSources(current,workspaceSources()),selected=await selectSources(provider,url,init.headers,model,task,candidates);
        diagnostic('analysis-sources',{provider,model,task,sources:selected.map(sourceInfo)});
        return wrappedFetch(input,{...init,body:JSON.stringify(appendSelected(provider,body,selected))});
      }
      if(intent!=='COMPOSE')return wrappedFetch(input,init);
      const current=extract(last.content).sources,candidates=mergeSources(current,workspaceSources()),selected=await selectSources(provider,url,init.headers,model,task,candidates);
      const a=assignment(task,selected),concept=await direct(provider,url,init.headers,model,`${shortIdea}\n\nAUFTRAG:\n${a}`),pid=id(),info=selected.map(sourceInfo);
      pending[pid]={assignment:a,concept,task,sourceInfo:info,createdAt:Date.now()};save(pending);
      diagnostic('proposal-created',{provider,model,task,candidateCount:candidates.length,sources:info,concept});
      return providerResponse(provider,visibleProposal(pid,concept),model);
    }catch(e){const msg=e?.message||String(e);if(provider==='google')return new Response(JSON.stringify({error:{message:msg}}),{status:502,headers:{'content-type':'application/json'}});return new Response(JSON.stringify({error:{message:msg}}),{status:500,headers:{'content-type':'application/json'}})}
  };
})();