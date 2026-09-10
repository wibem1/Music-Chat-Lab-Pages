(()=>{
'use strict';
if(window.__mclExplicitModeV133)return;
window.__mclExplicitModeV133=true;

const VERSION='1.3.3';
const nativeFetch=window.fetch.bind(window);
let forwardingCompose=false;
window.MCLRequestMode='chat';

function setMode(mode){
  window.MCLRequestMode=mode==='compose'?'compose':'chat';
}

function providerFor(url){
  const u=String(url||'');
  if(u.includes('api.anthropic.com/v1/messages'))return'anthropic';
  if(u.includes('api.openai.com/v1/responses'))return'openai';
  if(u.includes('generativelanguage.googleapis.com/')&&u.includes(':generateContent'))return'google';
  return null;
}

const OLD_HEAD='Die App interpretiert die Sprache des Nutzers nicht anhand von Schlüsselwörtern; du selbst entscheidest musikalisch und semantisch, was gemeint ist.';
const OLD_ACTION='MIDI-AKTIONEN: Antworte normal in natürlicher Sprache. Nur wenn jetzt tatsächlich eine MIDI-Fassung erzeugt oder verändert werden soll, hänge am Ende genau eine <MCL_ACTION> an. Die Entscheidung, welche Aktion passt, triffst du aus dem Gespräch heraus.';
const OLD_NO_ACTION='Gib keine MIDI-Aktion aus, wenn du nur diskutierst, analysierst oder einen Vorschlag machst.';
const OLD_CONTINUATION='GESPRÄCHSFORTSETZUNG: Wenn der Nutzer ein zuvor von dir angebotenes musikalisches Vorhaben bestätigt, verstehe die Bestätigung aus dem bisherigen Dialog. Es gibt keinen separaten DISCUSS/ANALYZE/COMPOSE-Router.';

function removeDecisionLayer(system){
  return String(system||'')
    .replace(OLD_HEAD,'Der Ausführungsmodus dieses Zugs wurde vom Nutzer ausdrücklich gewählt.')
    .replace(OLD_ACTION,'MIDI-AKTIONEN: Verwende die folgenden Aktionsformate für die technische Erzeugung oder Bearbeitung einer MIDI-Fassung.')
    .replace(OLD_NO_ACTION,'')
    .replace(OLD_CONTINUATION,'GESPRÄCHSFORTSETZUNG: Nutze den bisherigen Dialog vollständig als Kontext für den aktuellen, ausdrücklich gewählten Ausführungsmodus.');
}

function directive(mode){
  if(mode==='compose')return `AKTUELLER AUSFÜHRUNGSMODUS: KOMPONIERE.\nDieser Modus wurde ausdrücklich vom Nutzer gewählt. Der aktuelle Nutzertext ist im Zusammenhang mit dem bisherigen Dialog als verbindlicher Auftrag zur musikalischen Ausführung zu behandeln. Erzeuge oder bearbeite die gewünschte MIDI-Fassung jetzt. Falls dafür vollständige Notendaten fehlen, fordere sie mit <MCL_NEED> an. Die endgültige Antwort dieses Zugs muss genau eine gültige <MCL_ACTION> enthalten. Gib nicht zuerst nur eine Kompositionsidee oder einen bloßen Vorschlag aus.`;
  return `AKTUELLER AUSFÜHRUNGSMODUS: CHAT.\nDieser Modus wurde ausdrücklich vom Nutzer gewählt. Antworte ausschließlich im Gespräch: analysiere, diskutiere, kritisiere, entwickle oder ändere Kompositionsideen nach Wunsch. Erzeuge und verändere in diesem Zug keine MIDI-Fassung und gib keine <MCL_ACTION> aus. Das gilt auch dann, wenn der Nutzertext Wörter wie „komponiere“, „erstelle“ oder „ändere“ enthält; im CHAT-Modus sind solche Formulierungen Gegenstand des Gesprächs, nicht automatisch ein Ausführungsbefehl.`;
}

function inject(system,mode){
  return `${directive(mode)}\n\n${removeDecisionLayer(system)}`;
}

function patchBody(provider,body,mode){
  if(provider==='anthropic'){
    body.system=inject(body.system,mode);
  }else if(provider==='openai'){
    const input=Array.isArray(body.input)?body.input:[];
    const first=input.findIndex(x=>x?.role==='system');
    if(first>=0)input[first]={...input[first],content:inject(input[first].content,mode)};
    else input.unshift({role:'system',content:directive(mode)});
    body.input=input;
  }else if(provider==='google'){
    const si=body.systemInstruction&&typeof body.systemInstruction==='object'?body.systemInstruction:{parts:[]};
    const parts=Array.isArray(si.parts)?si.parts.slice():[];
    if(parts.length)parts[0]={...parts[0],text:inject(parts[0]?.text,mode)};
    else parts.push({text:directive(mode)});
    body.systemInstruction={...si,parts};
  }
  return body;
}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:input?.url||'';
  const provider=providerFor(url);
  if(!provider||typeof init.body!=='string')return nativeFetch(input,init);
  let body;try{body=JSON.parse(init.body)}catch{return nativeFetch(input,init)}
  const mode=window.MCLRequestMode==='compose'?'compose':'chat';
  return nativeFetch(input,{...init,body:JSON.stringify(patchBody(provider,body,mode))});
};

function bindButtons(){
  const chat=document.getElementById('sendButton');
  const compose=document.getElementById('composeButton');
  const input=document.getElementById('messageInput');
  if(!chat||!compose||!input)return;

  chat.addEventListener('click',()=>{if(!forwardingCompose)setMode('chat')},true);
  compose.addEventListener('click',()=>{
    if(chat.disabled)return;
    setMode('compose');
    forwardingCompose=true;
    try{chat.click()}finally{forwardingCompose=false}
  });
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey)setMode('chat');
  },true);

  const syncDisabled=()=>{compose.disabled=chat.disabled};
  syncDisabled();
  new MutationObserver(syncDisabled).observe(chat,{attributes:true,attributeFilter:['disabled']});
}

bindButtons();
window.MCLExplicitModeV133={version:VERSION,getMode:()=>window.MCLRequestMode,setMode};
})();
