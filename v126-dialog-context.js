(()=>{
'use strict';
if(window.__mclV126DialogContext)return;
window.__mclV126DialogContext=true;

const VERSION='1.1.26';
const PENDING_KEYS=['music-chat-lab.pending-compositions.v1','music-chat-lab.pending-openai-compositions.v1'];
const TAG='[MCL-DIALOGKONTEXT-V126]';
const innerFetch=window.fetch.bind(window);

function hasOpenProposal(){
  for(const key of PENDING_KEYS){
    try{
      const x=JSON.parse(localStorage.getItem(key)||'{}');
      if(x&&Object.keys(x).some(k=>Date.now()-Number(x[k]?.createdAt||0)<30*60*1000))return true;
    }catch(_){ }
  }
  return false;
}
function activeWorkspace(){
  try{
    const all=window.MCLMidiWorkspaceSources?.()||[];
    if(!all.length)return null;
    const b=document.querySelector('.mcl-midi-slot.active');
    if(b){
      const slot=Number(b.dataset.slot)+1;
      const hit=all.find(x=>Number(x?.slot)===slot&&x?.score);
      if(hit)return hit;
    }
    return all.length===1?all[0]:null;
  }catch(_){return null}
}
function textOf(m){
  if(typeof m?.content==='string')return m.content;
  if(Array.isArray(m?.content))return m.content.map(x=>x?.text||x?.input_text||x?.output_text||'').join('');
  if(Array.isArray(m?.parts))return m.parts.map(x=>x?.text||'').join('');
  return'';
}
function appendHint(body,provider,active){
  const slot=Number(active?.slot)||null;
  const name=String(active?.name||active?.score?.ti||'aktuelle Komposition');
  const hint=`\n\n${TAG}\nSEMANTISCHER DIALOGZUSTAND: Aktuell ausgewählt ist ${slot?`Speicherplatz ${slot}, `:''}${JSON.stringify(name)}. Dieser Zustand ist keine musikalische Vorgabe. Für die Intent-Entscheidung gilt allgemein: Bezieht sich die neue Nutzeraussage inhaltlich auf dieses konkrete musikalische Ergebnis und verlangt eine Beurteilung, Erklärung oder Auseinandersetzung mit dessen musikalischen Eigenschaften, darf sie NICHT als bloßes DISCUSS behandelt werden; wähle ANALYZE, damit die tatsächlichen Partiturdaten bereitgestellt werden. Verlangt sie eine musikalische Änderung oder Verbesserung dieses Ergebnisses, wähle COMPOSE und verwende die aktuelle Fassung als Ausgangsmaterial. Nur wenn die Aussage unabhängig vom aktuellen Musikobjekt beantwortet werden kann, wähle DISCUSS. Entscheide semantisch, nicht anhand einzelner Wörter.`;
  const b=JSON.parse(JSON.stringify(body));
  if(provider==='openai'&&Array.isArray(b.input)){
    for(let i=b.input.length-1;i>=0;i--){const m=b.input[i];if(m?.role!=='user')continue;const t=textOf(m);if(!t||t.includes(TAG))break;m.content=typeof m.content==='string'?t+hint:[{type:'input_text',text:t+hint}];break}
  }else if(provider==='anthropic'&&Array.isArray(b.messages)){
    for(let i=b.messages.length-1;i>=0;i--){const m=b.messages[i];if(m?.role!=='user')continue;const t=textOf(m);if(!t||t.includes(TAG))break;m.content=typeof m.content==='string'?t+hint:[{type:'text',text:t+hint}];break}
  }else if(provider==='google'&&Array.isArray(b.contents)){
    for(let i=b.contents.length-1;i>=0;i--){const m=b.contents[i];if(m?.role==='model')continue;const t=textOf(m);if(!t||t.includes(TAG))break;m.parts=[{text:t+hint}];break}
  }
  return b;
}

window.fetch=function(input,init={}){
  const url=typeof input==='string'?input:input?.url||'';
  if(typeof init.body!=='string'||hasOpenProposal())return innerFetch(input,init);
  let provider=null;
  if(url.includes('api.openai.com/v1/responses'))provider='openai';
  else if(url.includes('api.anthropic.com/v1/messages'))provider='anthropic';
  else if(url.includes('generativelanguage.googleapis.com/')&&url.includes(':generateContent'))provider='google';
  if(!provider)return innerFetch(input,init);
  const active=activeWorkspace();if(!active?.score)return innerFetch(input,init);
  try{return innerFetch(input,{...init,body:JSON.stringify(appendHint(JSON.parse(init.body),provider,active))})}
  catch(_){return innerFetch(input,init)}
};

document.querySelectorAll('[data-app-version]').forEach(el=>el.textContent='v'+VERSION);
})();
