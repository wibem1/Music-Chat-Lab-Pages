(()=>{
'use strict';
if(window.__mclCompositionContinuityV123)return;
window.__mclCompositionContinuityV123=true;

const wrappedFetch=window.fetch.bind(window);
const PENDING_KEYS=['music-chat-lab.pending-compositions.v1','music-chat-lab.pending-openai-compositions.v1'];
const TAG='[MCL-FORTSETZUNG-V123]';

function textOf(m){
  if(typeof m?.content==='string')return m.content;
  if(Array.isArray(m?.content))return m.content.map(x=>x?.text||x?.input_text||x?.output_text||'').join('');
  if(Array.isArray(m?.parts))return m.parts.map(x=>x?.text||'').join('');
  return'';
}
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
    const button=document.querySelector('.mcl-midi-slot.active');
    if(button){
      const slot=Number(button.dataset.slot)+1;
      const hit=all.find(x=>Number(x?.slot)===slot&&x?.score);
      if(hit)return hit;
    }
    return all.length===1?all[0]:null;
  }catch(_){return null}
}
function looksLikeScore(text){
  const s=String(text||'').trim();
  if(!s.includes('"tr"')||!s.includes('"nt"'))return false;
  const a=s.indexOf('{'),b=s.lastIndexOf('}');
  if(a<0||b<=a)return false;
  try{const x=JSON.parse(s.slice(a,b+1));return Array.isArray(x?.tr)&&x.tr.some(t=>Array.isArray(t?.nt))}catch(_){return false}
}
function hasRecentGeneratedScore(messages,lastUserIndex){
  let seen=0;
  for(let i=lastUserIndex-1;i>=0&&seen<8;i--){
    const m=messages[i],role=m?.role;
    if(role==='assistant'||role==='model'){
      seen++;
      if(looksLikeScore(textOf(m)))return true;
    }
  }
  return false;
}
function hintFor(active){
  const slot=Number(active?.slot)||null;
  const name=String(active?.name||active?.score?.ti||'aktuelle Komposition');
  return `\n\n${TAG}\nINTERNER DIALOGKONTEXT: Das aktuell markierte musikalische Ergebnis ist ${slot?`Speicherplatz ${slot}, `:''}${JSON.stringify(name)}. Dieser Hinweis ist keine zusätzliche musikalische Vorgabe. Ordne die aktuelle Nutzeraussage semantisch im Zusammenhang mit diesem Ergebnis ein. Wenn sie eine Kritik, Korrektur oder einen Verbesserungswunsch an der zuletzt erzeugten Musik ausdrückt oder impliziert, behandle sie als Bearbeitungsauftrag (COMPOSE) und verwende die aktuelle Fassung als Ausgangsmaterial. Wenn sie lediglich eine Frage, Analyse oder allgemeine Diskussion ist, ordne sie weiterhin entsprechend als ANALYZE oder DISCUSS ein.`;
}
function appendToLatest(messages,active,isOpenAI=false){
  let i=-1;
  for(let n=messages.length-1;n>=0;n--){
    const role=messages[n]?.role;
    if(role==='user'||(!isOpenAI&&role!=='assistant'&&role!=='model')){i=n;break}
  }
  if(i<0||!hasRecentGeneratedScore(messages,i))return false;
  const original=textOf(messages[i]);
  if(!original||original.includes(TAG))return false;
  const next=original+hintFor(active);
  if(typeof messages[i].content==='string')messages[i].content=next;
  else if(Array.isArray(messages[i].content))messages[i].content=isOpenAI?[{type:'input_text',text:next}]:[{type:'text',text:next}];
  else if(Array.isArray(messages[i].parts))messages[i].parts=[{text:next}];
  else return false;
  return true;
}

window.fetch=function(input,init={}){
  const url=typeof input==='string'?input:input?.url||'';
  if(typeof init.body!=='string'||hasOpenProposal())return wrappedFetch(input,init);
  let provider=null;
  if(url.includes('api.openai.com/v1/responses'))provider='openai';
  else if(url.includes('api.anthropic.com/v1/messages'))provider='anthropic';
  else if(url.includes('generativelanguage.googleapis.com/')&&url.includes(':generateContent'))provider='google';
  if(!provider)return wrappedFetch(input,init);
  const active=activeWorkspace();if(!active?.score)return wrappedFetch(input,init);
  try{
    const body=JSON.parse(init.body),copy=JSON.parse(JSON.stringify(body));let changed=false;
    if(provider==='openai'&&Array.isArray(copy.input))changed=appendToLatest(copy.input,active,true);
    else if(provider==='anthropic'&&Array.isArray(copy.messages))changed=appendToLatest(copy.messages,active,false);
    else if(provider==='google'&&Array.isArray(copy.contents))changed=appendToLatest(copy.contents,active,false);
    return changed?wrappedFetch(input,{...init,body:JSON.stringify(copy)}):wrappedFetch(input,init);
  }catch(_){return wrappedFetch(input,init)}
};
})();
