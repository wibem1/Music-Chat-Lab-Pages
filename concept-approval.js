(() => {
  // v1.0.13 — the AI sees the whole current MIDI workspace, selects the sources meant by the user's request,
  // and only those selected scores are carried into the final composition call.
  const wrappedFetch = window.fetch.bind(window);
  const STORE = 'music-chat-lab.pending-compositions.v1';
  const DIAG = 'music-chat-lab.last-diagnostic.v1';
  const SYSTEM_PREFIX = `Du bist ein Kompositions- und Produktionsassistent für MIDI.\nErfinde selbständige, geschlossene Musik nach dem Auftrag des Nutzers. Achte auf Stimmführung, Dynamik (Velocity 1-127), Rhythmik und Artikulation. Bei der Bearbeitung vorhandenen Materials sollen dessen musikalische Identität, Form und Umfang angemessen berücksichtigt werden, sofern der Auftrag nichts anderes verlangt.`;
  const TECHNICAL_PROMPT = `NOTATION UND AUSGABE:\n- "d" = Notierter Wert in Viertelnoten-Beats (0.125, 0.25, 0.333333, 0.5, 0.666667, 0.75, 1, 1.5, 2, 3, 4, 6, 8).\n- "g" = Gate/Klingdauer als Faktor (z.B. 0.95 = normal, 0.5 = staccato, 1.05 = legato).\n- "st" = System (0=Standard, 1=Rechte Hand / oberes System, 2=Linke Hand / unteres System).\n- Format: JSON mit folgender Struktur:\n{\n  "ti": "Titel",\n  "bpm": 96,\n  "ts": {"n": 4, "d": 4},\n  "k": "e minor",\n  "sm": "Kurze Zusammenfassung",\n  "tr": [{"nm":"Piano","ch":0,"pg":0,"nt":[[0.0,1.0,60,80,1]],"ct":[[0.0,64,0]]}]\n}\nnt-Array: [StartBeat, Dauer, Pitch, Velocity, Staff, Gate] (Gate ist optional, Standard 0.95).\nct-Array: [Beat, CC, Wert].\nGib ausschließlich valides JSON aus.`;
  const sourceRe = /\[MCL-ENGINE14-SCORE name=("(?:[^"\\]|\\.)*")\]\n([\s\S]*?)\n\[\/MCL-ENGINE14-SCORE\]/g;
  const workspaceRe = /\n*--- MUSIKALISCHER ARBEITSTISCH ---[\s\S]*?--- ENDE MUSIKALISCHER ARBEITSTISCH ---\n*/g;
  const multiRe = /(synthese|verschmelz|kombinier|verbind|aus\s+.+\s+und\s+.+|(?:original|vorlage).{0,100}\b(?:und|mit)\b.{0,100}(?:variation|fassung|version)|(?:variation|fassung|version).{0,100}\b(?:und|mit)\b.{0,100}(?:original|vorlage))/i;
  const shortIdea = `Formuliere einen kurzen musikalischen Gedanken/Impuls in höchstens drei kurzen Sätzen. Beschreibe nur die wesentliche kompositorische Idee, keinen detaillierten Ablauf oder technischen Bauplan. Nenne im Vorschlag ausdrücklich die geplante Länge in Takten und das geplante Tempo in BPM. Bei vorhandenem Material dienen dessen Umfang und Tempo als Ausgangspunkt; Abweichungen sind möglich, sollen aber im Vorschlag sichtbar sein.`;

  function load(){try{return JSON.parse(localStorage.getItem(STORE))||{}}catch{return{}}}
  function save(x){localStorage.setItem(STORE,JSON.stringify(x))}
  function id(){return Math.random().toString(36).slice(2,9)}
  function extract(text){
    const sources=[];let m;sourceRe.lastIndex=0;
    while((m=sourceRe.exec(String(text||'')))){try{sources.push({name:JSON.parse(m[1]),score:JSON.parse(m[2])})}catch{}}
    sourceRe.lastIndex=0;
    const task=String(text||'').replace(sourceRe,'').replace(workspaceRe,'\n').replace(/\n\n--- DATEIANHÄNGE ---\n?/g,'\n').trim();
    return{task,sources}
  }
  function scoreFromAssistant(text){
    let s=String(text||'').trim();
    if(!s||s.includes('[MCL-VORSCHLAG:'))return null;
    const fence=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);if(fence)s=fence[1].trim();
    const first=s.indexOf('{'),last=s.lastIndexOf('}');if(first<0||last<=first)return null;
    try{const score=JSON.parse(s.slice(first,last+1));if(!score||!Array.isArray(score.tr)||!score.tr.some(t=>Array.isArray(t.nt)))return null;return{name:String(score.ti||score.sm||'Erzeugte Komposition'),score}}catch{return null}
  }
  function sameSource(a,b){try{return JSON.stringify(a?.score)===JSON.stringify(b?.score)}catch{return false}}
  function historySources(messages,skipLastUser=false){
    const out=[];let skipped=!skipLastUser;
    for(let i=messages.length-1;i>=0;i--){const m=messages[i];if(typeof m.content!=='string')continue;
      if(m.role==='user'){
        if(!skipped){skipped=true;continue}
        const found=extract(m.content).sources;
        for(let j=found.length-1;j>=0;j--)if(!out.some(x=>sameSource(x,found[j])))out.push(found[j]);
      }else if(m.role==='assistant'){
        const generated=scoreFromAssistant(m.content);if(generated&&!out.some(x=>sameSource(x,generated)))out.push(generated);
      }
    }
    return out;
  }
  function sourcesForTask(messages,task,skipLastUser=false){
    const all=historySources(messages,skipLastUser);if(!all.length)return[];
    if(multiRe.test(task))return all.slice(0,Math.min(4,all.length)).reverse();
    return [all[0]];
  }
  function sourceInfo(s){const tr=Array.isArray(s?.score?.tr)?s.score.tr:[];const notes=tr.reduce((n,t)=>n+(Array.isArray(t.nt)?t.nt.length:0),0);let end=0;tr.forEach(t=>(t.nt||[]).forEach(n=>{if(Array.isArray(n))end=Math.max(end,(Number(n[0])||0)+(Number(n[1])||0))}));const ts=s?.score?.ts||{};const bar=(Number(ts.n)||4)*(4/(Number(ts.d)||4));return{name:s.name,notes,beats:Number(end.toFixed(3)),bars:bar?Number((end/bar).toFixed(2)):null,bpm:s?.score?.bpm??null,meter:ts.n&&ts.d?`${ts.n}/${ts.d}`:null,key:s?.score?.k??null}}
  function sourceGuidance(sources){if(!sources.length)return'';const i=sourceInfo(sources[0]),parts=[];if(i.bars)parts.push(`Umfang der Vorlage: ${i.bars} Takte`);if(i.meter)parts.push(`Taktart der Vorlage: ${i.meter}`);if(i.bpm)parts.push(`Tempo der Vorlage: ${i.bpm} BPM`);return parts.length?`\n\nECKDATEN DER VORLAGE (als Ausgangspunkt, sofern der Nutzer nichts anderes verlangt):\n${parts.join('\n')}`:''}
  function assignment(task,sources){let a=`Auftrag:\n${task}${sourceGuidance(sources)}`;if(sources.length===1)a+=`\n\nVORHANDENES MATERIAL (${sources[0].name}):\n${JSON.stringify(sources[0].score)}`;else sources.forEach((s,i)=>a+=`\n\nVORHANDENES MATERIAL ${i+1} (${s.name}):\n${JSON.stringify(s.score)}`);return a}
  function selectionPrompt(task,sources){
    if(!sources.length)return'';
    const catalog=sources.map((s,i)=>{const x=sourceInfo(s);return `${i+1}: ${x.name} | ${x.bars??'?'} Takte | ${x.bpm??'?'} BPM | ${x.meter??'?'} | Tonart ${x.key??'frei'} | ${x.notes} Noten`}).join('\n');
    return `\n\nQUELLENAUSWAHL:\nVorhanden sind diese aktuellen musikalischen Quellen:\n${catalog}\nEntscheide selbst aus dem natürlichen Auftrag, auf welche Quelle oder Quellen sich der Nutzer bezieht. Beginne deine Antwort zwingend mit genau einem Marker der Form [MCL-QUELLEN:1] oder [MCL-QUELLEN:1,3]. Verwende darin nur die Nummern der tatsächlich gemeinten Quellen. Danach folgt unmittelbar der musikalische Vorschlag. Wenn der Auftrag keine vorhandene Quelle meint, verwende [MCL-QUELLEN:].`;
  }
  function parseConceptSelection(raw,sources){
    const text=String(raw||'').trim(),m=text.match(/^\s*\[MCL-QUELLEN:([0-9,\s]*)\]\s*/i);
    if(!m)return{concept:text,selected:sources,selection:null};
    const nums=[...new Set(m[1].split(',').map(x=>Number(x.trim())).filter(n=>Number.isInteger(n)&&n>=1&&n<=sources.length))];
    const selected=nums.map(n=>sources[n-1]).filter(Boolean);
    return{concept:text.slice(m[0].length).trim(),selected,selection:nums}
  }
  function diagnostic(stage,data){try{localStorage.setItem(DIAG,JSON.stringify({version:'1.0.26',timestamp:new Date().toISOString(),stage,...data},null,2))}catch{}}
  window.MCLDownloadDiagnostic=function(){const raw=localStorage.getItem(DIAG);if(!raw){alert('Noch keine Kompositionsdiagnose vorhanden.');return}const blob=new Blob([raw],{type:'application/json;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`Music-Chat-Lab-Diagnose-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)};

  function xhr(url,headers,body,provider){return new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('POST',url,true);x.timeout=180000;Object.entries(headers||{}).forEach(([k,v])=>x.setRequestHeader(k,v));x.onload=()=>{let d={};try{d=JSON.parse(x.responseText)}catch{};if(x.status>=200&&x.status<300)resolve(d);else reject(new Error(d?.error?.message||`API-Fehler ${x.status}`))};x.onerror=()=>reject(new Error(provider==='google'?'Netzwerkzugriff zur Google-API fehlgeschlagen. Bitte Verbindung/VPN prüfen und erneut versuchen.':'Failed to fetch'));x.ontimeout=()=>reject(new Error(provider==='google'?'Gemini hat die Komposition nach 3 Minuten nicht abgeschlossen. Die Anfrage wurde beendet.':'Die Anfrage hat zu lange gedauert und wurde beendet.'));x.send(JSON.stringify(body))})}
  async function claude(url,headers,model,system,user){return xhr(url,headers,{model,max_tokens:32000,output_config:{effort:'medium'},system,messages:[{role:'user',content:user}]},'anthropic')}
  async function gemini(url,headers,system,user){return xhr(url,headers,{systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig:{maxOutputTokens:32768}},'google')}
  function anthropicText(d){return(d.content||[]).filter(x=>x.type==='text').map(x=>x.text||'').join('').trim()}
  function googleText(d){return(d.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('').trim()}
  function providerResponse(provider,text,model){if(provider==='google')return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text}]},finishReason:'STOP'}]}),{status:200,headers:{'content-type':'application/json'}});return new Response(JSON.stringify({id:'mcl-proposal',type:'message',role:'assistant',model,content:[{type:'text',text}],stop_reason:'end_turn'}),{status:200,headers:{'content-type':'application/json'}})}

  async function classifyIntent(provider,url,headers,model,msgs,hasPending){
    const latest=[...msgs].reverse().find(m=>m.role==='user');
    const previous=[...msgs].reverse().find(m=>m.role==='assistant');
    const task=extract(latest?.content||'').task;
    const priorText=String(previous?.content||'').replace(/\[MCL-VORSCHLAG:[a-z0-9]+\]/ig,'').slice(-2500);
    const choices=hasPending?'CONFIRM | REJECT | REVISE | COMPOSE | DISCUSS':'COMPOSE | DISCUSS';
    const prompt=`Ordne die aktuelle Nutzereingabe nach ihrer Bedeutung ein, nicht nach einzelnen Schlüsselwörtern.\n\nMögliche Ausgabe: ${choices}.\n\nRegeln:\n- COMPOSE: Der Nutzer möchte tatsächlich neue Musik erzeugen oder vorhandene Musik verändern, fortsetzen, variieren, arrangieren, synthetisieren oder sonst musikalisch bearbeiten lassen.\n- DISCUSS: Der Nutzer möchte sprechen, fragen, analysieren, beurteilen, vergleichen, erklären, kritisieren oder Ideen erörtern, ohne dass jetzt Musik erzeugt oder verändert werden soll. Ein musikalisches Wort wie „Synthese“, „Variation“ oder „Komposition“ allein bedeutet NICHT COMPOSE.\n- CONFIRM (nur bei offenem Vorschlag): Der Nutzer bestätigt, dass die vorgeschlagene Komposition jetzt ausgeführt werden soll.\n- REJECT (nur bei offenem Vorschlag): Der Nutzer verwirft oder stoppt den Vorschlag.\n- REVISE (nur bei offenem Vorschlag): Der Nutzer möchte die vorgeschlagene Kompositionsidee ändern, bevor Musik erzeugt wird.\n- COMPOSE bleibt auch bei offenem Vorschlag möglich: Wähle COMPOSE, wenn die aktuelle Nachricht einen neuen, eigenständigen Kompositionsauftrag erteilt, statt nur den offenen Vorschlag zu bestätigen oder zu überarbeiten.\n- Bei Mehrdeutigkeit wähle DISCUSS; dann kann die KI im normalen Gespräch nachfragen.\n\nVorherige KI-Antwort (gekürzt):\n${priorText}\n\nAktuelle Nutzereingabe:\n${task}\n\nAntworte ausschließlich mit genau einem der erlaubten Wörter.`;
    const raw=(await direct(provider,url,headers,model,prompt)).trim().toUpperCase();
    const allowed=hasPending?['CONFIRM','REJECT','REVISE','COMPOSE','DISCUSS']:['COMPOSE','DISCUSS'];
    return allowed.includes(raw)?raw:'DISCUSS';
  }

  function immediateProposalMarker(messages){let lastUser=-1;for(let i=messages.length-1;i>=0;i--){if(messages[i].role==='user'){lastUser=i;break}}if(lastUser<=0)return null;const prev=messages[lastUser-1];if(prev?.role!=='assistant')return null;const m=String(prev.content||'').match(/\[MCL-VORSCHLAG:([a-z0-9]+)\]/i);return m?m[1]:null}
  function visibleProposal(pid,concept){return `Kompositionsvorschlag:\n\n${concept}\n\nWenn du damit einverstanden bist, antworte einfach mit „Ja“ oder „Mach das“. Änderungswünsche kannst du stattdessen direkt schreiben.\n\n[MCL-VORSCHLAG:${pid}]`}
  function normalizeRequest(provider,body){if(provider==='anthropic')return(Array.isArray(body.messages)?body.messages:[]).filter(m=>typeof m.content==='string').map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.content}));return(Array.isArray(body.contents)?body.contents:[]).map(m=>({role:m.role==='model'?'assistant':'user',content:(m.parts||[]).map(p=>p.text||'').join('')}))}
  function modelFrom(provider,body,url){if(provider==='anthropic')return body.model||'';const m=String(url).match(/\/models\/([^/:]+):generateContent/);return m?decodeURIComponent(m[1]):''}
  async function direct(provider,url,headers,model,prompt){if(provider==='google'){const d=await gemini(url,headers,SYSTEM_PREFIX,prompt);return googleText(d)}const d=await claude(url,headers,model,SYSTEM_PREFIX,prompt);return anthropicText(d)}

  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:input?.url||'';
    const provider=url.includes('api.anthropic.com/v1/messages')?'anthropic':url.includes('generativelanguage.googleapis.com/')&&url.includes(':generateContent')?'google':null;
    if(!provider||typeof init.body!=='string')return wrappedFetch(input,init);
    try{
      const body=JSON.parse(init.body),msgs=normalizeRequest(provider,body),last=[...msgs].reverse().find(m=>m.role==='user'&&typeof m.content==='string'),model=modelFrom(provider,body,url);
      if(!last)return wrappedFetch(input,init);
      const pendingId=immediateProposalMarker(msgs),pending=load(),hasPending=!!(pendingId&&pending[pendingId]);
      const intent=await classifyIntent(provider,url,init.headers,model,msgs,hasPending);
      diagnostic('intent-classified',{provider,model,intent,hasPending,userText:extract(last.content).task});
      if(hasPending){
        const p=pending[pendingId],change=extract(last.content).task;
        if(intent==='REJECT'){delete pending[pendingId];save(pending);return providerResponse(provider,'Kompositionsidee verworfen. Es wurde keine Komposition erzeugt.',model)}
        if(intent==='CONFIRM'){
          const compPrompt=`${TECHNICAL_PROMPT}\n\nAUFTRAG:\n${p.assignment}\n\nDEIN KONZEPT:\n${p.concept}\n\nGib jetzt die fertige JSON-Partitur aus.`;
          diagnostic('final-composition-call',{provider,model,userConfirmation:change,task:p.task,sourceOrigin:p.sourceOrigin,selection:p.selection,sources:p.sourceInfo,concept:p.concept,assignment:p.assignment,finalPrompt:compPrompt});
          delete pending[pendingId];save(pending);
          const text=await direct(provider,url,init.headers,model,compPrompt);return providerResponse(provider,text,model);
        }
        if(intent==='REVISE'){
          const revise=`Überarbeite den folgenden musikalischen Gedanken/Impuls entsprechend dem Änderungswunsch des Nutzers. ${shortIdea}\n\nAUFTRAG:\n${p.assignment}\n\nBISHERIGER IMPULS:\n${p.concept}\n\nÄNDERUNGSWUNSCH:\n${change}`;
          const concept=await direct(provider,url,init.headers,model,revise);p.concept=concept;pending[pendingId]=p;save(pending);return providerResponse(provider,visibleProposal(pendingId,concept),model);
        }
        if(intent!=='COMPOSE')return wrappedFetch(input,init);
        delete pending[pendingId];save(pending);
      }
      if(intent!=='COMPOSE')return wrappedFetch(input,init);
      let {task,sources}=extract(last.content),sourceOrigin='current-workspace';
      if(!sources.length){sources=sourcesForTask(msgs,task,true);sourceOrigin=sources.length?(multiRe.test(task)?'multiple-from-chat':'reused-from-chat'):'none'}
      const allAssignment=assignment(task,sources),conceptPrompt=`${shortIdea}${selectionPrompt(task,sources)}\n\nAUFTRAG:\n${allAssignment}`,rawConcept=await direct(provider,url,init.headers,model,conceptPrompt),parsed=parseConceptSelection(rawConcept,sources),selected=parsed.selected;
      const finalSources=selected.length?selected:(!parsed.selection? sources:[]),a=assignment(task,finalSources),concept=parsed.concept,pid=id(),info=finalSources.map(sourceInfo);
      pending[pid]={assignment:a,concept,task,sourceOrigin,selection:parsed.selection,sourceInfo:info,createdAt:Date.now()};save(pending);
      diagnostic('proposal-created',{provider,model,task,sourceOrigin,selection:parsed.selection,workspaceSources:sources.map(sourceInfo),sources:info,concept,assignment:a});
      return providerResponse(provider,visibleProposal(pid,concept),model);
    }catch(e){const msg=e?.message||String(e);if(provider==='google')return new Response(JSON.stringify({error:{message:msg}}),{status:502,headers:{'content-type':'application/json'}});return new Response(JSON.stringify({error:{message:msg}}),{status:500,headers:{'content-type':'application/json'}})}
  };
})();
