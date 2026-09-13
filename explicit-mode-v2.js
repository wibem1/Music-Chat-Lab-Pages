(()=>{
'use strict';
if(window.__mclExplicitModeV2)return;
window.__mclExplicitModeV2=true;

const VERSION='2.0.0-alpha.1';
const nativeFetch=window.fetch.bind(window);
const CONCEPT_RE=/<MCL_CONCEPT>\s*([\s\S]*?)\s*<\/MCL_CONCEPT>/i;
let forwardingCompose=false;
window.MCLRequestMode='chat';

function setMode(mode){window.MCLRequestMode=mode==='compose'?'compose':'chat'}
function currentIdea(){return String(window.MCLCompositionIdea?.get?.()||document.getElementById('compositionIdeaInput')?.value||'').trim()}
function setIdea(text){
  const value=String(text||'').trim();
  if(!value)return;
  if(window.MCLCompositionIdea?.set)window.MCLCompositionIdea.set(value,{generated:true,source:'chat'});
  else{const e=document.getElementById('compositionIdeaInput');if(e)e.value=value}
}
function providerFor(url){
  const u=String(url||'');
  if(u.includes('api.anthropic.com/v1/messages'))return'anthropic';
  if(u.includes('api.openai.com/v1/responses'))return'openai';
  if(u.includes('generativelanguage.googleapis.com/')&&u.includes(':generateContent'))return'google';
  return null;
}

function directive(mode,idea){
  if(mode==='compose'){
    const ideaBlock=idea?`\n\nAKTUELLE EDITIERBARE KOMPOnSITIONSIDEE DES NUTZERS:\n${idea}\nBehandle sie als zusätzlichen Bestandteil des aktuellen Benutzerauftrags. Sie schreibt dir nicht vor, auf welche Weise du komponieren musst.`:'';
    return `AKTUELLER AUSFÜHRUNGSMODUS: KOMPONIERE.\nDer Nutzer hat ausdrücklich die musikalische Ausführung gewählt. Der aktuelle Nutzertext ist der maßgebliche Kompositions- oder Bearbeitungsauftrag.${ideaBlock}\n\nSetze den Auftrag musikalisch möglichst treffend um. Füge keine ästhetischen Ziele, keine demonstrative Komplexität und keine besondere Art von Originalität hinzu, die der Nutzer nicht verlangt. Triff alle innerhalb des Auftrags offenen musikalischen Entscheidungen selbst.\n\nErzeuge oder bearbeite die gewünschte MIDI-Fassung jetzt. Es gibt keine vorgeschaltete Konzept- oder Freigabestufe. Wenn vollständige Notendaten eines vorhandenen Speichers benötigt werden, darfst du sie mit <MCL_NEED> anfordern. Die endgültige Antwort dieses Zugs muss genau eine technisch gültige <MCL_ACTION> enthalten.`;
  }
  return `AKTUELLER AUSFÜHRUNGSMODUS: CHAT.\nDer Nutzer hat ausdrücklich Gespräch statt MIDI-Ausführung gewählt. Antworte auf den eigentlichen Inhalt des Nutzertexts; analysiere, diskutiere, vergleiche oder entwickle musikalische Möglichkeiten frei. In diesem Zug darf keine <MCL_ACTION> ausgegeben und keine MIDI-Fassung verändert werden.\n\nWenn im Gespräch tatsächlich eine konkrete, später ausführbare Kompositions- oder Bearbeitungsidee entsteht, darfst du sie zusätzlich ganz am Ende als verborgenen Block <MCL_CONCEPT>kurze aktuelle Idee</MCL_CONCEPT> markieren. Das ist optional: Erfinde keine Kompositionsidee nur, um dieses Feld zu füllen.`;
}
function inject(system,mode,idea){
  let s=String(system||'');
  s=s.replace('Die App interpretiert die Sprache des Nutzers nicht anhand von Schlüsselwörtern; du selbst entscheidest musikalisch und semantisch, was gemeint ist.','Der Ausführungsmodus dieses Zugs wurde vom Nutzer ausdrücklich gewählt; innerhalb dieses Modus entscheidest du musikalisch und semantisch selbständig.');
  return`${directive(mode,idea)}\n\n${s}`;
}
function patchBody(provider,body,mode,idea){
  if(provider==='anthropic')body.system=inject(body.system,mode,idea);
  else if(provider==='openai'){
    const input=Array.isArray(body.input)?body.input:[],first=input.findIndex(x=>x?.role==='system');
    if(first>=0)input[first]={...input[first],content:inject(input[first].content,mode,idea)};
    else input.unshift({role:'system',content:directive(mode,idea)});
    body.input=input;
  }else if(provider==='google'){
    const si=body.systemInstruction&&typeof body.systemInstruction==='object'?body.systemInstruction:{parts:[]},parts=Array.isArray(si.parts)?si.parts.slice():[];
    if(parts.length)parts[0]={...parts[0],text:inject(parts[0]?.text,mode,idea)};
    else parts.push({text:directive(mode,idea)});
    body.systemInstruction={...si,parts};
  }
  return body;
}
function responseText(provider,d){
  if(provider==='anthropic')return(d?.content||[]).filter(x=>x?.type==='text').map(x=>x.text||'').join('').trim();
  if(provider==='openai'){
    if(typeof d?.output_text==='string'&&d.output_text.trim())return d.output_text.trim();
    return(d?.output||[]).flatMap(x=>x?.content||[]).filter(x=>x?.type==='output_text'||x?.type==='text').map(x=>x?.text||'').join('\n').trim();
  }
  return(d?.candidates?.[0]?.content?.parts||[]).map(x=>x?.text||'').join('\n').trim();
}
function replaceResponseText(provider,d,text){
  const x=JSON.parse(JSON.stringify(d||{}));
  if(provider==='anthropic')x.content=[{type:'text',text}];
  else if(provider==='openai'){x.output_text=text;x.output=[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]}
  else{x.candidates=x.candidates?.length?x.candidates:[{}];x.candidates[0]={...(x.candidates[0]||{}),content:{role:'model',parts:[{text}]}}}
  return x;
}
function jsonResponse(data,r){const h=new Headers(r.headers||{});h.set('content-type','application/json');return new Response(JSON.stringify(data),{status:r.status,statusText:r.statusText,headers:h})}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:input?.url||'',provider=providerFor(url);
  if(!provider||typeof init.body!=='string')return nativeFetch(input,init);
  let body;try{body=JSON.parse(init.body)}catch{return nativeFetch(input,init)}
  const mode=window.MCLRequestMode==='compose'?'compose':'chat',idea=currentIdea();
  const response=await nativeFetch(input,{...init,body:JSON.stringify(patchBody(provider,body,mode,idea))});
  if(mode!=='chat'||!response.ok)return response;
  const d=await response.clone().json().catch(()=>null);if(!d)return response;
  const raw=responseText(provider,d),m=raw.match(CONCEPT_RE);if(!m)return response;
  setIdea(m[1]);
  const cleaned=raw.replace(CONCEPT_RE,'').replace(/\n{3,}/g,'\n\n').trim();
  return jsonResponse(replaceResponseText(provider,d,cleaned),response);
};

function hasAssistantContext(){
  try{
    const chats=JSON.parse(localStorage.getItem('music-chat-lab.chats.v1')||'[]'),id=localStorage.getItem('music-chat-lab.active-chat.v1'),chat=Array.isArray(chats)?chats.find(c=>c?.id===id):null;
    return!!chat?.messages?.some(m=>m?.role==='assistant'&&!m?.isError&&!m?.thinking&&String(m?.text||'').trim());
  }catch{return false}
}
function bindButtons(){
  const chat=document.getElementById('sendButton'),compose=document.getElementById('composeButton'),input=document.getElementById('messageInput');if(!chat||!compose||!input)return;
  chat.addEventListener('click',()=>{if(!forwardingCompose)setMode('chat')},true);
  compose.addEventListener('click',()=>{
    if(chat.disabled)return;
    if(!input.value.trim()){
      if(currentIdea())input.value='Komponiere eine Fassung auf Grundlage der aktuellen Kompositionsidee.';
      else if(hasAssistantContext())input.value='Setze das zuletzt im Chat entwickelte musikalische Vorhaben jetzt als MIDI um.';
      else{const note=document.getElementById('composerNote');if(note)note.textContent='Bitte zuerst einen Kompositionsauftrag eingeben.';return}
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }
    setMode('compose');forwardingCompose=true;try{chat.click()}finally{forwardingCompose=false}
  });
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey)setMode('chat')},true);
  const syncDisabled=()=>{compose.disabled=chat.disabled};syncDisabled();new MutationObserver(syncDisabled).observe(chat,{attributes:true,attributeFilter:['disabled']});
}

bindButtons();
window.MCLExplicitModeV2={version:VERSION,getMode:()=>window.MCLRequestMode,setMode};
})();