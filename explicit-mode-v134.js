(()=>{
'use strict';
if(window.__mclExplicitModeV134)return;
window.__mclExplicitModeV134=true;

const VERSION='1.3.9';
const nativeFetch=window.fetch.bind(window);
let forwardingCompose=false;
window.MCLRequestMode='chat';

function setMode(mode){
  window.MCLRequestMode=mode==='compose'?'compose':'chat';
}

function removeLegacyProposalMarkers(){
  const key='music-chat-lab.chats.v1';
  try{
    const chats=JSON.parse(localStorage.getItem(key)||'[]');
    if(!Array.isArray(chats))return;
    let changed=false;
    for(const chat of chats){
      if(!Array.isArray(chat?.messages))continue;
      for(const message of chat.messages){
        if(typeof message?.text!=='string')continue;
        const cleaned=message.text.replace(/\n*\[MCL-(?:OPENAI-)?VORSCHLAG:[a-z0-9]+\]\s*/ig,'\n').replace(/\n{3,}/g,'\n\n').trim();
        if(cleaned!==message.text){message.text=cleaned;changed=true;}
      }
    }
    if(changed)localStorage.setItem(key,JSON.stringify(chats));
  }catch(_){ }
}

function hasAssistantContext(){
  try{
    const chats=JSON.parse(localStorage.getItem('music-chat-lab.chats.v1')||'[]');
    const id=localStorage.getItem('music-chat-lab.active-chat.v1');
    const chat=Array.isArray(chats)?chats.find(c=>c?.id===id):null;
    return !!chat?.messages?.some(m=>m?.role==='assistant'&&!m?.isError&&!m?.thinking&&String(m?.text||'').trim());
  }catch{return false}
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
  if(mode==='compose')return `AKTUELLER AUSFÜHRUNGSMODUS: KOMPONIERE.\nDieser Modus wurde ausdrücklich vom Nutzer gewählt. Der aktuelle Nutzertext ist im Zusammenhang mit dem bisherigen Dialog als verbindlicher Auftrag zur musikalischen Ausführung zu behandeln. Erzeuge oder bearbeite die gewünschte MIDI-Fassung jetzt. Falls dafür vollständige Notendaten fehlen, fordere sie mit <MCL_NEED> an. Die endgültige Antwort dieses Zugs muss genau eine gültige <MCL_ACTION> enthalten. Gib nicht zuerst nur eine Kompositionsidee oder einen bloßen Vorschlag aus.\n\nKOMPOSITIONSIDEE ALS FESTES METADATUM: Jede ausgeführte Komposition oder Bearbeitung muss eine konkrete musikalische Kompositionsidee mitführen. Wenn im bisherigen Chat bereits eine Kompositionsidee entwickelt wurde, verwende diese als Grundlage und bewahre ihren musikalischen Kern. Wenn ohne vorherigen Konzeptdialog direkt komponiert wird, entwickle die Kompositionsidee selbst während dieses Zugs, ohne Rückfrage und ohne zusätzliche Freigabestufe. Schreibe die Idee bei NEW_SCORE in score.sm; bei PATCH, MERGE oder REPLACE_SCORE in action.summary bzw. zusätzlich in score.sm. Die Idee soll die musikalische Konzeption beschreiben und darf kein bloßer technischer Statussatz wie „MIDI wurde erzeugt“ sein. Formuliere sie knapp: 2 bis 4 kurze Sätze, insgesamt höchstens etwa 350 Zeichen. Sie ist Metadatum des resultierenden Stücks und wird später in CLAB gespeichert und angezeigt.`;
  return `AKTUELLER AUSFÜHRUNGSMODUS: CHAT.\nDieser Modus wurde ausdrücklich vom Nutzer gewählt. In diesem Zug wird keine MIDI-Fassung erzeugt oder verändert und es darf keine <MCL_ACTION> ausgegeben werden. Antworte auf den eigentlichen Inhalt des Nutzertexts. Wenn der Nutzer im CHAT-Modus eine Komposition, Variation, Bearbeitung oder sonstige musikalische Ausführung verlangt, führe sie nicht als MIDI aus, sondern entwickle unmittelbar eine konkrete musikalische Kompositionsidee bzw. Bearbeitungsidee dafür. Triff die dafür nötigen musikalischen Entscheidungen selbst auf Grundlage des Auftrags und des bisherigen Dialogs. Stelle keine vorbereitenden Rückfragen und gib keine Auswahlkataloge aus, außer der Nutzer bittet ausdrücklich um Fragen, Alternativen oder Klärung. Die Idee soll konkret genug sein, dass sie anschließend mit KOMPONIERE unmittelbar umgesetzt werden kann. Halte sie knapp: 2 bis 4 kurze Sätze, insgesamt höchstens etwa 350 Zeichen, ohne lange Vorrede.`;
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
    if(!input.value.trim()){
      if(!hasAssistantContext()){
        const note=document.getElementById('composerNote');
        if(note)note.textContent='Bitte zuerst einen Kompositionsauftrag eingeben oder im Chat eine Kompositionsidee entwickeln.';
        return;
      }
      input.value='Setze den zuletzt im Chat entwickelten Kompositionsvorschlag jetzt als MIDI um.';
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }
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

removeLegacyProposalMarkers();
bindButtons();
window.MCLExplicitModeV134={version:VERSION,getMode:()=>window.MCLRequestMode,setMode};
})();
